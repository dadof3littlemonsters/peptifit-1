const express = require('express');

const OPEN_FOOD_FACTS_USER_AGENT = 'PeptiFit/1.0 (https://peptifit.trotters-stuff.uk)';
const VALID_MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
const DEFAULT_VOICE_API_KEY = 'peptifit-voice-key';
const FATSECRET_TOKEN_URL = 'https://oauth.fatsecret.com/connect/token';
const FATSECRET_SEARCH_URL = 'https://platform.fatsecret.com/rest/foods/search/v3';
const FATSECRET_ENABLED = process.env.FATSECRET_ENABLED === 'true';
const FATSECRET_REGION = process.env.FATSECRET_REGION || 'GB';
const FATSECRET_LANGUAGE = process.env.FATSECRET_LANGUAGE || 'en';
const FATSECRET_SCOPE = process.env.FATSECRET_SCOPE || 'premier';
const SEARCH_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const SEARCH_PROVIDER_DEADLINE_MS = 1200;
const REMOTE_SEARCH_MIN_QUERY_LENGTH = 3;
const BARCODE_LOOKUP_TIMEOUT_MS = 5000;
const BARCODE_LOOKUP_RETRY_TIMEOUT_MS = 2500;
const BARCODE_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

let fatSecretTokenCache = {
  accessToken: null,
  expiresAt: 0
};
const foodSearchCache = new Map();
const barcodeLookupCache = new Map();

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseServingSize(servingSize) {
  if (!servingSize || typeof servingSize !== 'string') {
    return null;
  }

  const match = servingSize.replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(g|gram|grams|ml)\b/i);
  return match ? parseNumber(match[1]) : null;
}

function roundNutrient(value) {
  if (value === null || value === undefined) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

function normalizeMetricServingAmount(amount, unit) {
  const parsedAmount = parseNumber(amount);
  if (parsedAmount === null) {
    return null;
  }

  const normalizedUnit = String(unit || '').toLowerCase();

  if (!normalizedUnit || normalizedUnit === 'g' || normalizedUnit === 'gram' || normalizedUnit === 'grams' || normalizedUnit === 'ml') {
    return parsedAmount;
  }

  if (normalizedUnit === 'oz') {
    return roundNutrient(parsedAmount * 28.3495);
  }

  return null;
}

function scalePer100g(valuePer100g, quantityG) {
  const value = parseNumber(valuePer100g);
  const quantity = parseNumber(quantityG);

  if (value === null || quantity === null) {
    return null;
  }

  return roundNutrient((value / 100) * quantity);
}

function normalizeOffProduct(product) {
  if (!product || !product.product_name) {
    return null;
  }

  const nutriments = product.nutriments || {};

  return {
    id: String(product.code || ''),
    source: 'off',
    name: product.product_name,
    brand: product.brands || null,
    calories_per_100g: parseNumber(nutriments['energy-kcal_100g'] ?? nutriments.energy_kcal_100g),
    protein_per_100g: parseNumber(nutriments.proteins_100g),
    carbs_per_100g: parseNumber(nutriments.carbohydrates_100g),
    fat_per_100g: parseNumber(nutriments.fat_100g),
    fibre_per_100g: parseNumber(nutriments.fiber_100g ?? nutriments.fibre_100g),
    serving_size_g: parseServingSize(product.serving_size),
    image_url: product.image_small_url || null
  };
}

function normalizeFatSecretFood(food) {
  if (!food || !food.food_id || !food.food_name) {
    return null;
  }

  const servings = Array.isArray(food.servings?.serving)
    ? food.servings.serving
    : food.servings?.serving
      ? [food.servings.serving]
      : [];

  const preferredServing = servings.find((serving) => String(serving.is_default) === '1')
    || servings.find((serving) => normalizeMetricServingAmount(serving.metric_serving_amount, serving.metric_serving_unit) !== null)
    || servings[0]
    || null;

  const servingSizeG = preferredServing
    ? normalizeMetricServingAmount(preferredServing.metric_serving_amount, preferredServing.metric_serving_unit)
    : null;

  const caloriesPerServing = parseNumber(preferredServing?.calories);
  const proteinPerServing = parseNumber(preferredServing?.protein);
  const carbsPerServing = parseNumber(preferredServing?.carbohydrate);
  const fatPerServing = parseNumber(preferredServing?.fat);
  const fibrePerServing = parseNumber(preferredServing?.fiber);

  const toPer100g = (valuePerServing) => {
    if (valuePerServing === null || servingSizeG === null || servingSizeG <= 0) {
      return null;
    }

    return roundNutrient((valuePerServing / servingSizeG) * 100);
  };

  return {
    id: String(food.food_id),
    source: 'fatsecret',
    name: food.food_name,
    brand: food.brand_name || null,
    calories_per_100g: toPer100g(caloriesPerServing),
    protein_per_100g: toPer100g(proteinPerServing),
    carbs_per_100g: toPer100g(carbsPerServing),
    fat_per_100g: toPer100g(fatPerServing),
    fibre_per_100g: toPer100g(fibrePerServing),
    serving_size_g: servingSizeG,
    image_url: null,
    attribution: 'Powered by fatsecret'
  };
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const { timeoutMs = 15000, ...fetchOptions } = options;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal
    });

    if (!response.ok) {
      throw Object.assign(new Error(`Upstream request failed with status ${response.status}`), {
        statusCode: 502
      });
    }

    return await response.json();
  } catch (error) {
    if (!error.statusCode) {
      error.statusCode = 502;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function withDeadline(promise, timeoutMs, fallbackValue) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(fallbackValue), timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        resolve({
          __deadline_error: error
        });
      });
  });
}

function getCachedValue(cache, key) {
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function setCachedValue(cache, key, value, ttlMs, maxEntries = 200) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });

  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;

    if (!oldestKey) {
      break;
    }

    cache.delete(oldestKey);
  }
}

function isFatSecretConfigured() {
  return FATSECRET_ENABLED && Boolean(process.env.FATSECRET_CLIENT_ID && process.env.FATSECRET_CLIENT_SECRET);
}

async function getFatSecretAccessToken() {
  if (!isFatSecretConfigured()) {
    return null;
  }

  if (fatSecretTokenCache.accessToken && fatSecretTokenCache.expiresAt > Date.now() + 60_000) {
    return fatSecretTokenCache.accessToken;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const credentials = Buffer.from(
      `${process.env.FATSECRET_CLIENT_ID}:${process.env.FATSECRET_CLIENT_SECRET}`
    ).toString('base64');

    const response = await fetch(FATSECRET_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: FATSECRET_SCOPE
      }).toString(),
      signal: controller.signal
    });

    if (!response.ok) {
      throw Object.assign(new Error(`fatsecret auth failed with status ${response.status}`), {
        statusCode: 502
      });
    }

    const data = await response.json();
    const expiresIn = Number(data.expires_in) || 3600;

    fatSecretTokenCache = {
      accessToken: data.access_token,
      expiresAt: Date.now() + expiresIn * 1000
    };

    return fatSecretTokenCache.accessToken;
  } catch (error) {
    if (!error.statusCode) {
      error.statusCode = 502;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function searchOpenFoodFacts(query, options = {}) {
  const {
    country = 'gb',
    language = 'en'
  } = options;
  const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
  url.searchParams.set('search_terms', query);
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('action', 'process');
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', '8');
  url.searchParams.set('fields', 'code,product_name,brands,nutriments,serving_size,image_small_url');

  if (language) {
    url.searchParams.set('lc', language);
  }

  if (country) {
    url.searchParams.set('cc', country);
  }

  const data = await fetchJson(url.toString(), {
    headers: {
      'User-Agent': OPEN_FOOD_FACTS_USER_AGENT,
      Accept: 'application/json'
    },
    timeoutMs: 20000
  });

  return (data.products || [])
    .map(normalizeOffProduct)
    .filter(Boolean)
    .filter((item) => item.id && item.name);
}

async function searchFatSecret(query) {
  const token = await getFatSecretAccessToken();

  if (!token) {
    return [];
  }

  const url = new URL(FATSECRET_SEARCH_URL);
  url.searchParams.set('search_expression', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('page_number', '0');
  url.searchParams.set('max_results', '8');
  url.searchParams.set('region', FATSECRET_REGION);
  url.searchParams.set('language', FATSECRET_LANGUAGE);

  const data = await fetchJson(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });

  const foods = Array.isArray(data.foods_search?.results?.food)
    ? data.foods_search.results.food
    : data.foods_search?.results?.food
      ? [data.foods_search.results.food]
      : [];

  return foods.map(normalizeFatSecretFood).filter(Boolean);
}

function buildOffSearchVariants(query) {
  const normalized = String(query || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return [];
  }

  const tokens = normalized.split(' ').filter(Boolean);
  const variants = [normalized];

  if (tokens.length > 1) {
    variants.push(tokens[0]);
    variants.push(tokens.slice(1).join(' '));
    variants.push(tokens[tokens.length - 1]);
  }

  if (tokens.length > 2) {
    variants.push(tokens.slice(0, 2).join(' '));
    variants.push(tokens.slice(-2).join(' '));
  }

  return [...new Set(variants.map((value) => value.trim()).filter((value) => value.length >= 2))];
}

async function searchOpenFoodFactsVariants(query) {
  const variants = buildOffSearchVariants(query);
  const collected = [];
  const searchModes = [
    { country: 'gb', language: 'en' },
    { country: null, language: 'en' },
    { country: null, language: null }
  ];

  for (const variant of variants) {
    for (const mode of searchModes) {
      try {
        const results = await searchOpenFoodFacts(variant, mode);
        collected.push(...results);

        if (dedupeFoods(collected).length >= 8) {
          break;
        }
      } catch (error) {
        console.error(`Open Food Facts variant search failed for "${variant}":`, error);
      }
    }

    if (dedupeFoods(collected).length >= 8) {
      break;
    }
  }

  return dedupeFoods(collected).slice(0, 8);
}

function normalizeCofidFood(row) {
  if (!row || !row.name) {
    return null;
  }

  const category = String(row.category || '').trim();
  const displayCategory = /[a-z]/i.test(category) && /[\s/,-]/.test(category) ? category : null;

  return {
    id: String(row.id),
    source: 'cofid',
    name: row.name,
    brand: displayCategory,
    calories_per_100g: parseNumber(row.calories_per_100g),
    protein_per_100g: parseNumber(row.protein_per_100g),
    carbs_per_100g: parseNumber(row.carbs_per_100g),
    fat_per_100g: parseNumber(row.fat_per_100g),
    fibre_per_100g: parseNumber(row.fibre_per_100g),
    serving_size_g: parseNumber(row.serving_size_g),
    image_url: null
  };
}

function tokenizeSearchText(value) {
  return String(value || '').toLowerCase().match(/[a-z0-9]+/g) || [];
}

function cofidRowMatchesQuery(row, normalizedQuery) {
  const queryTokens = tokenizeSearchText(normalizedQuery);

  if (!queryTokens.length) {
    return true;
  }

  const rowTokens = tokenizeSearchText(`${String(row?.name || '')} ${String(row?.category || '')}`);

  return queryTokens.every((queryToken) => rowTokens.some((rowToken) => rowToken.startsWith(queryToken)));
}

function getCofidSearchScore(row, normalizedQuery) {
  const name = String(row?.name || '').trim().toLowerCase();
  const category = String(row?.category || '').trim().toLowerCase();
  const queryTokens = tokenizeSearchText(normalizedQuery);
  const baseName = name.split(',')[0].trim();
  const haystack = `${name} ${category}`;
  let score = 0;

  if (name === normalizedQuery) {
    score += 1000;
  }

  if (baseName === normalizedQuery) {
    score += 800;
  }

  if (name.startsWith(`${normalizedQuery},`) || name.startsWith(`${normalizedQuery} `)) {
    score += 250;
  } else if (name.startsWith(normalizedQuery)) {
    score += 180;
  }

  if (baseName.startsWith(normalizedQuery)) {
    score += 160;
  }

  for (const token of queryTokens) {
    if (baseName === token) {
      score += 40;
    }

    if (new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(haystack)) {
      score += 30;
    } else if (haystack.includes(token)) {
      score += 10;
    }
  }

  const unmatchedDescriptor = name.includes(',') && baseName && baseName !== normalizedQuery;
  if (unmatchedDescriptor) {
    score -= 25;
  }

  const penaltyTerms = ['coated', 'breaded', 'battered', 'fried', 'baked', 'canned', 'made up with', 'with '];
  for (const term of penaltyTerms) {
    if (name.includes(term) && !normalizedQuery.includes(term.trim())) {
      score -= 20;
    }
  }

  score -= name.length / 1000;

  return score;
}

async function searchCofidFoods(db, query, limit = 8) {
  const normalizedQuery = String(query || '').trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  const exactMatch = normalizedQuery;
  const prefixPattern = `${normalizedQuery}%`;
  const containsPattern = `%${normalizedQuery}%`;
  const rows = await dbAll(
    db,
    `SELECT *
     FROM cofid_foods
     WHERE lower(name) LIKE ?
        OR lower(COALESCE(category, '')) LIKE ?
     ORDER BY CASE
       WHEN lower(name) = ? THEN 0
       WHEN lower(name) LIKE ? THEN 1
       WHEN lower(COALESCE(category, '')) LIKE ? THEN 2
       ELSE 3
     END,
     name ASC
     LIMIT ?`,
    [containsPattern, containsPattern, exactMatch, prefixPattern, prefixPattern, Math.max(limit * 8, 40)]
  );

  return rows
    .filter((row) => cofidRowMatchesQuery(row, normalizedQuery))
    .map((row) => ({ row, score: getCofidSearchScore(row, normalizedQuery) }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return String(left.row.name || '').localeCompare(String(right.row.name || ''));
    })
    .slice(0, limit)
    .map(({ row }) => normalizeCofidFood(row))
    .filter(Boolean);
}

function foodMatchesQuery(item, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  const haystack = `${String(item?.name || '').toLowerCase()} ${String(item?.brand || '').toLowerCase()}`;
  return normalizedQuery
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

function getCachedSearchResults(query) {
  const cacheKey = String(query || '').trim().toLowerCase();

  if (!cacheKey) {
    return [];
  }

  const exactMatch = getCachedValue(foodSearchCache, cacheKey);
  if (Array.isArray(exactMatch)) {
    return exactMatch;
  }

  const prefixMatches = [...foodSearchCache.entries()]
    .filter(([key, entry]) => key.length < cacheKey.length && cacheKey.startsWith(key) && entry.expiresAt > Date.now())
    .sort((left, right) => right[0].length - left[0].length);

  for (const [, entry] of prefixMatches) {
    const filtered = (entry.value || []).filter((item) => foodMatchesQuery(item, cacheKey)).slice(0, 8);

    if (filtered.length) {
      return filtered;
    }
  }

  return [];
}

async function searchOpenFoodFactsPrimary(query) {
  const [regionalOutcome, globalOutcome] = await Promise.all([
    withDeadline(searchOpenFoodFacts(query, { country: 'gb', language: 'en' }), SEARCH_PROVIDER_DEADLINE_MS, []),
    withDeadline(searchOpenFoodFacts(query, { country: null, language: 'en' }), SEARCH_PROVIDER_DEADLINE_MS, [])
  ]);

  const regionalResults = Array.isArray(regionalOutcome) ? regionalOutcome : [];
  const globalResults = Array.isArray(globalOutcome) ? globalOutcome : [];

  if (regionalOutcome && regionalOutcome.__deadline_error) {
    console.error('Regional Open Food Facts search failed:', regionalOutcome.__deadline_error);
  }

  if (globalOutcome && globalOutcome.__deadline_error) {
    console.error('Global Open Food Facts search failed:', globalOutcome.__deadline_error);
  }

  return dedupeFoods([...regionalResults, ...globalResults]).slice(0, 8);
}

async function lookupBarcode(code) {
  const cacheKey = String(code || '').trim();
  const cached = getCachedValue(barcodeLookupCache, cacheKey);

  if (cached) {
    return cached;
  }

  const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(cacheKey)}.json`;
  let lastError = null;

  for (const timeoutMs of [BARCODE_LOOKUP_TIMEOUT_MS, BARCODE_LOOKUP_RETRY_TIMEOUT_MS]) {
    try {
      const data = await fetchJson(url, {
        headers: {
          'User-Agent': OPEN_FOOD_FACTS_USER_AGENT,
          Accept: 'application/json'
        },
        timeoutMs
      });

      if (data.status === 0 || !data.product) {
        return null;
      }

      const normalized = normalizeOffProduct({ ...data.product, code: cacheKey });

      if (normalized) {
        setCachedValue(barcodeLookupCache, cacheKey, normalized, BARCODE_CACHE_TTL_MS, 500);
      }

      return normalized;
    } catch (error) {
      lastError = error;

      if (error?.name !== 'AbortError') {
        throw error;
      }
    }
  }

  throw lastError;
}

async function searchFoods(query) {
  const cacheKey = String(query || '').trim().toLowerCase();
  const cached = getCachedValue(foodSearchCache, cacheKey);

  if (Array.isArray(cached)) {
    return cached;
  }

  const cachedPrefixResults = getCachedSearchResults(cacheKey);

  if (cacheKey.length < REMOTE_SEARCH_MIN_QUERY_LENGTH) {
    return cachedPrefixResults;
  }

  const [fatSecretOutcome, offOutcome] = await Promise.all([
    withDeadline(searchFatSecret(query), SEARCH_PROVIDER_DEADLINE_MS, []),
    searchOpenFoodFactsPrimary(query)
  ]);

  const fatSecretResults = Array.isArray(fatSecretOutcome) ? fatSecretOutcome : [];
  const offResults = Array.isArray(offOutcome) ? offOutcome : [];

  if (fatSecretOutcome && fatSecretOutcome.__deadline_error) {
    console.error('fatsecret search failed:', fatSecretOutcome.__deadline_error);
  }

  if (offOutcome && offOutcome.__deadline_error) {
    console.error('Open Food Facts search failed:', offOutcome.__deadline_error);
  }

  const results = dedupeFoods([
    ...cachedPrefixResults,
    ...fatSecretResults,
    ...offResults
  ]).slice(0, 8);

  setCachedValue(foodSearchCache, cacheKey, results, SEARCH_CACHE_TTL_MS);

  return results;
}

function validateMealType(mealType) {
  return VALID_MEAL_TYPES.has(mealType) ? mealType : 'snack';
}

function ensureVoiceKey(req, res, next) {
  const providedKey = req.query.key || req.body?.key;
  const expectedKey = process.env.VOICE_API_KEY || DEFAULT_VOICE_API_KEY;

  if (!providedKey || providedKey !== expectedKey) {
    res.status(401).json({ error: 'Invalid voice API key' });
    return;
  }

  next();
}

function formatFoodLog(row) {
  return {
    ...row,
    quantity_g: parseNumber(row.quantity_g),
    calories: parseNumber(row.calories),
    protein: parseNumber(row.protein),
    carbs: parseNumber(row.carbs),
    fat: parseNumber(row.fat),
    fibre: parseNumber(row.fibre)
  };
}

function getUpstreamErrorMessage(fallbackMessage, error = null) {
  if (error?.name === 'AbortError') {
    return 'Food lookup timed out. Try searching by name instead.';
  }

  return fallbackMessage || 'Failed to reach food data provider';
}

function normalizeLocalFood(row) {
  if (!row || !row.name) {
    return null;
  }

  return {
    id: String(row.id),
    source: row.source || 'local',
    name: row.name,
    brand: row.brand || null,
    calories_per_100g: parseNumber(row.calories_per_100g),
    protein_per_100g: parseNumber(row.protein_per_100g),
    carbs_per_100g: parseNumber(row.carbs_per_100g),
    fat_per_100g: parseNumber(row.fat_per_100g),
    fibre_per_100g: parseNumber(row.fibre_per_100g),
    serving_size_g: parseNumber(row.serving_size_g),
    image_url: null
  };
}

function normalizeLoggedFood(row) {
  if (!row || !row.name) {
    return null;
  }

  const quantityG = parseNumber(row.quantity_g);
  const toPer100g = (value) => {
    const numericValue = parseNumber(value);

    if (numericValue === null || quantityG === null || quantityG <= 0) {
      return null;
    }

    return roundNutrient((numericValue / quantityG) * 100);
  };

  return {
    id: `logged:${String(row.name).toLowerCase()}::${String(row.brand || '').toLowerCase()}`,
    source: row.source || 'logged',
    name: row.name,
    brand: row.brand || null,
    calories_per_100g: toPer100g(row.calories),
    protein_per_100g: toPer100g(row.protein),
    carbs_per_100g: toPer100g(row.carbs),
    fat_per_100g: toPer100g(row.fat),
    fibre_per_100g: toPer100g(row.fibre),
    serving_size_g: quantityG,
    image_url: null
  };
}

function dedupeFoods(items) {
  const seen = new Set();

  return items.filter((item) => {
    const key = `${String(item.name || '').toLowerCase()}::${String(item.brand || '').toLowerCase()}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function searchLocalFoods(db, userId, query, limit = 8) {
  const pattern = `%${query.toLowerCase()}%`;
  const libraryRows = await dbAll(
    db,
    `SELECT *
     FROM scanned_foods
     WHERE user_id = ?
       AND (lower(name) LIKE ? OR lower(COALESCE(brand, '')) LIKE ?)
     ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
     LIMIT ?`,
    [userId, pattern, pattern, limit]
  );

  const loggedRows = await dbAll(
    db,
    `SELECT name, brand, source, quantity_g, calories, protein, carbs, fat, fibre, MAX(datetime(logged_at)) AS last_logged_at
     FROM food_logs
     WHERE user_id = ?
       AND (lower(name) LIKE ? OR lower(COALESCE(brand, '')) LIKE ?)
     GROUP BY lower(name), lower(COALESCE(brand, ''))
     ORDER BY last_logged_at DESC
     LIMIT ?`,
    [userId, pattern, pattern, limit]
  );

  return dedupeFoods([
    ...libraryRows.map(normalizeLocalFood).filter(Boolean),
    ...loggedRows.map(normalizeLoggedFood).filter(Boolean)
  ]).slice(0, limit);
}

async function saveFoodToLibrary(db, uuidv4, userId, food) {
  const normalizedName = String(food?.name || '').trim();

  if (!normalizedName) {
    return null;
  }

  const normalizedBrand = food?.brand ? String(food.brand).trim() : '';
  const existing = await dbGet(
    db,
    `SELECT id
     FROM scanned_foods
     WHERE user_id = ?
       AND lower(name) = lower(?)
       AND lower(COALESCE(brand, '')) = lower(?)
     LIMIT 1`,
    [userId, normalizedName, normalizedBrand]
  );

  const payload = [
    food?.source || 'local',
    normalizedName,
    normalizedBrand || null,
    parseNumber(food?.calories_per_100g),
    parseNumber(food?.protein_per_100g),
    parseNumber(food?.carbs_per_100g),
    parseNumber(food?.fat_per_100g),
    parseNumber(food?.fibre_per_100g),
    parseNumber(food?.serving_size_g)
  ];

  if (existing?.id) {
    await dbRun(
      db,
      `UPDATE scanned_foods
       SET source = ?, name = ?, brand = ?, calories_per_100g = ?, protein_per_100g = ?, carbs_per_100g = ?,
           fat_per_100g = ?, fibre_per_100g = ?, serving_size_g = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [...payload, existing.id, userId]
    );

    return existing.id;
  }

  const id = uuidv4();
  await dbRun(
    db,
    `INSERT INTO scanned_foods (
      id, user_id, source, name, brand, calories_per_100g, protein_per_100g,
      carbs_per_100g, fat_per_100g, fibre_per_100g, serving_size_g
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, ...payload]
  );

  return id;
}

module.exports = function createFoodRouter({ db, authenticateToken, uuidv4 }) {
  const router = express.Router();

  router.get('/voice/search', ensureVoiceKey, async (req, res) => {
    const query = (req.query.query || '').trim();

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    try {
      const cofidResults = await searchCofidFoods(db, query);
      let remoteResults = [];

      if (cofidResults.length < 8) {
        remoteResults = await searchFoods(query);
      }

      const results = dedupeFoods([...cofidResults, ...remoteResults]).slice(0, 8);
      res.json({ results });
    } catch (error) {
      console.error('Food voice search failed:', error);
      res.status(error.statusCode || 500).json({ error: getUpstreamErrorMessage('Failed to reach food data provider', error) });
    }
  });

  router.post('/voice/log', ensureVoiceKey, async (req, res) => {
    const { query, quantity_g, meal_type, user_id, logged_at } = req.body;

    if (!query || !user_id) {
      return res.status(400).json({ error: 'Query and user_id are required' });
    }

    const quantityG = parseNumber(quantity_g);
    if (quantityG === null || quantityG <= 0) {
      return res.status(400).json({ error: 'quantity_g must be a positive number' });
    }

    try {
      const user = await dbGet(db, 'SELECT id FROM users WHERE id = ?', [user_id]);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const results = await searchOpenFoodFacts(query);
      const topResult = results[0];

      if (!topResult) {
        return res.status(404).json({ error: 'Product not found' });
      }

      const logId = uuidv4();
      const mealType = validateMealType(meal_type);
      const foodLog = {
        id: logId,
        user_id,
        food_id: topResult.id,
        source: topResult.source,
        name: topResult.name,
        brand: topResult.brand,
        quantity_g: quantityG,
        meal_type: mealType,
        calories: scalePer100g(topResult.calories_per_100g, quantityG),
        protein: scalePer100g(topResult.protein_per_100g, quantityG),
        carbs: scalePer100g(topResult.carbs_per_100g, quantityG),
        fat: scalePer100g(topResult.fat_per_100g, quantityG),
        fibre: scalePer100g(topResult.fibre_per_100g, quantityG),
        logged_at: logged_at || new Date().toISOString()
      };

      await dbRun(
        db,
        `INSERT INTO food_logs (
          id, user_id, food_id, source, name, brand, quantity_g, meal_type,
          calories, protein, carbs, fat, fibre, logged_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          foodLog.id,
          foodLog.user_id,
          foodLog.food_id,
          foodLog.source,
          foodLog.name,
          foodLog.brand,
          foodLog.quantity_g,
          foodLog.meal_type,
          foodLog.calories,
          foodLog.protein,
          foodLog.carbs,
          foodLog.fat,
          foodLog.fibre,
          foodLog.logged_at
        ]
      );

      res.status(201).json({
        message: 'Food logged successfully',
        logged: foodLog
      });
    } catch (error) {
      console.error('Food voice log failed:', error);
      res.status(error.statusCode || 500).json({ error: getUpstreamErrorMessage('Failed to log food from Open Food Facts') });
    }
  });

  router.get('/search', authenticateToken, async (req, res) => {
    const query = (req.query.query || '').trim();

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    try {
      const localResults = await searchLocalFoods(db, req.user.userId, query);
      const cofidResults = await searchCofidFoods(db, query, Math.max(0, 8 - localResults.length));
      let remoteResults = [];

      if (dedupeFoods([...localResults, ...cofidResults]).length < 8) {
        try {
          remoteResults = await searchFoods(query);
        } catch (remoteError) {
          console.error('Remote food search failed, returning local results only:', remoteError);
        }
      }

      const results = dedupeFoods([...localResults, ...cofidResults, ...remoteResults]).slice(0, 8);
      res.json({ results });
    } catch (error) {
      console.error('Food search failed:', error);
      res.status(error.statusCode || 500).json({ error: getUpstreamErrorMessage('Failed to reach food data provider') });
    }
  });

  router.post('/library', authenticateToken, async (req, res) => {
    try {
      const id = await saveFoodToLibrary(db, uuidv4, req.user.userId, req.body || {});
      res.status(201).json({ id, message: 'Food saved to library' });
    } catch (error) {
      console.error('Food library save failed:', error);
      res.status(500).json({ error: 'Failed to save food to library' });
    }
  });

  router.get('/library', authenticateToken, async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    try {
      const rows = await dbAll(
        db,
        `SELECT *
         FROM scanned_foods
         WHERE user_id = ?
         ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
         LIMIT ?`,
        [req.user.userId, limit]
      );

      res.json({ foods: rows.map(normalizeLocalFood).filter(Boolean) });
    } catch (error) {
      console.error('Food library fetch failed:', error);
      res.status(500).json({ error: 'Failed to fetch food library' });
    }
  });

  router.put('/library/:id', authenticateToken, async (req, res) => {
    const foodId = req.params.id;
    const payload = req.body || {};

    if (!String(payload.name || '').trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    try {
      const result = await dbRun(
        db,
        `UPDATE scanned_foods
         SET source = ?, name = ?, brand = ?, calories_per_100g = ?, protein_per_100g = ?, carbs_per_100g = ?,
             fat_per_100g = ?, fibre_per_100g = ?, serving_size_g = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [
          payload.source || 'local',
          String(payload.name).trim(),
          payload.brand ? String(payload.brand).trim() : null,
          parseNumber(payload.calories_per_100g),
          parseNumber(payload.protein_per_100g),
          parseNumber(payload.carbs_per_100g),
          parseNumber(payload.fat_per_100g),
          parseNumber(payload.fibre_per_100g),
          parseNumber(payload.serving_size_g),
          foodId,
          req.user.userId
        ]
      );

      if (!result.changes) {
        return res.status(404).json({ error: 'Food not found' });
      }

      res.json({ message: 'Food updated successfully' });
    } catch (error) {
      console.error('Food library update failed:', error);
      res.status(500).json({ error: 'Failed to update food library item' });
    }
  });

  router.delete('/library/:id', authenticateToken, async (req, res) => {
    try {
      const result = await dbRun(
        db,
        'DELETE FROM scanned_foods WHERE id = ? AND user_id = ?',
        [req.params.id, req.user.userId]
      );

      if (!result.changes) {
        return res.status(404).json({ error: 'Food not found' });
      }

      res.json({ message: 'Food deleted successfully' });
    } catch (error) {
      console.error('Food library delete failed:', error);
      res.status(500).json({ error: 'Failed to delete food library item' });
    }
  });

  router.get('/barcode/:code', authenticateToken, async (req, res) => {
    try {
      const product = await lookupBarcode(req.params.code);

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      res.json(product);
    } catch (error) {
      console.error('Barcode lookup failed:', error);
      res.status(error.statusCode || 500).json({ error: getUpstreamErrorMessage('Failed to reach Open Food Facts', error) });
    }
  });

  router.post('/log', authenticateToken, async (req, res) => {
    const {
      food_id,
      source,
      name,
      brand,
      quantity_g,
      meal_type,
      logged_at,
      calories,
      protein,
      carbs,
      fat,
      fibre
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const quantityG = parseNumber(quantity_g);
    if (quantityG === null || quantityG <= 0) {
      return res.status(400).json({ error: 'quantity_g must be a positive number' });
    }

    const mealType = validateMealType(meal_type);
    const logId = uuidv4();

    try {
      await dbRun(
        db,
        `INSERT INTO food_logs (
          id, user_id, food_id, source, name, brand, quantity_g, meal_type,
          calories, protein, carbs, fat, fibre, logged_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          logId,
          req.user.userId,
          food_id || null,
          source || null,
          name,
          brand || null,
          quantityG,
          mealType,
          parseNumber(calories),
          parseNumber(protein),
          parseNumber(carbs),
          parseNumber(fat),
          parseNumber(fibre),
          logged_at || new Date().toISOString()
        ]
      );

      res.status(201).json({ id: logId, message: 'Food logged successfully' });
    } catch (error) {
      console.error('Food log insert failed:', error);
      res.status(500).json({ error: 'Failed to log food' });
    }
  });

  router.get('/log', authenticateToken, async (req, res) => {
    const date = (req.query.date || new Date().toISOString().split('T')[0]).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    }

    try {
      const rows = await dbAll(
        db,
        `SELECT * FROM food_logs
         WHERE user_id = ? AND substr(logged_at, 1, 10) = ?
         ORDER BY datetime(logged_at) ASC, created_at ASC`,
        [req.user.userId, date]
      );

      const logs = rows.map(formatFoodLog);
      const totals = logs.reduce((acc, log) => ({
        calories: roundNutrient(acc.calories + (log.calories || 0)) || 0,
        protein: roundNutrient(acc.protein + (log.protein || 0)) || 0,
        carbs: roundNutrient(acc.carbs + (log.carbs || 0)) || 0,
        fat: roundNutrient(acc.fat + (log.fat || 0)) || 0,
        fibre: roundNutrient(acc.fibre + (log.fibre || 0)) || 0
      }), { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 });

      res.json({ logs, totals });
    } catch (error) {
      console.error('Food log fetch failed:', error);
      res.status(500).json({ error: 'Failed to fetch food logs' });
    }
  });

  router.delete('/log/:id', authenticateToken, async (req, res) => {
    try {
      const result = await dbRun(
        db,
        'DELETE FROM food_logs WHERE id = ? AND user_id = ?',
        [req.params.id, req.user.userId]
      );

      if (!result.changes) {
        return res.status(404).json({ error: 'Food log not found' });
      }

      res.json({ message: 'Food log deleted successfully' });
    } catch (error) {
      console.error('Food log delete failed:', error);
      res.status(500).json({ error: 'Failed to delete food log' });
    }
  });

  return router;
};
