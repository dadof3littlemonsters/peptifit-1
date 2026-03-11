const express = require('express');

const OPEN_FOOD_FACTS_USER_AGENT = 'PeptiFit/1.0 (https://peptifit.trotters-stuff.uk)';
const VALID_MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
const DEFAULT_VOICE_API_KEY = 'peptifit-voice-key';
const DASHSCOPE_URL = 'https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const SEARCH_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const SEARCH_PROVIDER_DEADLINE_MS = 1200;
const REMOTE_SEARCH_MIN_QUERY_LENGTH = 3;
const BARCODE_LOOKUP_TIMEOUT_MS = 5000;
const BARCODE_LOOKUP_RETRY_TIMEOUT_MS = 2500;
const BARCODE_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const AI_QUERY_EXPANSION_TIMEOUT_MS = 8000;
const AI_MANUAL_SEARCH_ENABLED = process.env.AI_FOOD_SEARCH_FALLBACK_ENABLED !== 'false';

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

function getResponseText(content) {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (part && typeof part.text === 'string') {
          return part.text;
        }

        return '';
      })
      .join('\n')
      .trim();
  }

  return '';
}

function stripMarkdownFences(value) {
  const text = String(value || '').trim();

  if (!text.startsWith('```')) {
    return text;
  }

  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function parseJsonContent(content) {
  const cleaned = stripMarkdownFences(content);

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }

    throw error;
  }
}

function getAiProviderConfig() {
  const provider = String(process.env.AI_PROVIDER || 'dashscope').trim().toLowerCase();

  if (provider === 'deepseek') {
    return {
      provider,
      apiKey: process.env.DEEPSEEK_API_KEY,
      url: process.env.DEEPSEEK_API_URL || DEEPSEEK_URL,
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat'
    };
  }

  if (provider === 'groq') {
    return {
      provider,
      apiKey: process.env.GROQ_API_KEY,
      url: process.env.GROQ_API_URL || GROQ_URL,
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
    };
  }

  if (provider === 'openrouter') {
    return {
      provider,
      apiKey: process.env.OPENROUTER_API_KEY,
      url: process.env.OPENROUTER_API_URL || OPENROUTER_URL,
      model: process.env.OPENROUTER_MODEL || 'x-ai/grok-4.1-fast',
      referer: process.env.OPENROUTER_REFERER || process.env.APP_BASE_URL || 'https://trax.delboysden.uk',
      title: process.env.OPENROUTER_TITLE || 'PeptiFit'
    };
  }

  return {
    provider: 'dashscope',
    apiKey: process.env.DASHSCOPE_API_KEY,
    url: process.env.DASHSCOPE_API_URL || DASHSCOPE_URL,
    model: process.env.DASHSCOPE_MODEL || 'qwen3.5-plus'
  };
}

async function expandManualSearchQueryWithAi(query) {
  if (!AI_MANUAL_SEARCH_ENABLED) {
    return [];
  }

  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) {
    return [];
  }

  const providerConfig = getAiProviderConfig();
  const { apiKey, url, model, provider, referer, title } = providerConfig;

  if (!apiKey) {
    return [];
  }

  const systemPrompt = 'You rewrite food search queries for nutrition databases. Return ONLY valid JSON.';
  const userPrompt = [
    'Rewrite the food search query into up to 4 compact alternatives likely to match structured food databases.',
    'Prioritize base food names, UK wording variants, singular/plural, and punctuation/hyphen variants.',
    'Keep each alternative under 6 words and do not include explanations.',
    `Input query: "${normalizedQuery}"`,
    'Return shape: {"queries": ["..."]}'
  ].join('\n');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_QUERY_EXPANSION_TIMEOUT_MS);

  try {
    const requestBody = {
      model,
      max_tokens: 200,
      temperature: 0.1
    };

    if (provider === 'groq' || provider === 'openrouter' || provider === 'deepseek') {
      requestBody.messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
      requestBody.response_format = { type: 'json_object' };
    } else {
      requestBody.messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [{ type: 'text', text: userPrompt }]
        }
      ];
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(provider === 'openrouter' && referer ? { 'HTTP-Referer': referer } : {}),
        ...(provider === 'openrouter' && title ? { 'X-OpenRouter-Title': title } : {})
      },
      signal: controller.signal,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      return [];
    }

    const payload = await response.json().catch(() => ({}));
    const messageContent = getResponseText(payload?.choices?.[0]?.message?.content);

    if (!messageContent) {
      return [];
    }

    const parsed = parseJsonContent(messageContent);
    const querySet = new Set([normalizedQuery.toLowerCase()]);
    const alternatives = Array.isArray(parsed?.queries) ? parsed.queries : [];

    return alternatives
      .map((value) => String(value || '').trim())
      .filter((value) => value.length >= 2 && value.length <= 60)
      .filter((value) => {
        const key = value.toLowerCase();
        if (querySet.has(key)) {
          return false;
        }
        querySet.add(key);
        return true;
      })
      .slice(0, 4);
  } catch (error) {
    return [];
  } finally {
    clearTimeout(timeout);
  }
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

  const queryTokens = tokenizeSearchText(normalizedQuery).slice(0, 5);
  const exactMatch = normalizedQuery;
  const prefixPattern = `${normalizedQuery}%`;
  const containsPattern = `%${normalizedQuery}%`;
  const tokenPredicates = queryTokens
    .map(() => '(lower(name) LIKE ? OR lower(COALESCE(category, \'\')) LIKE ?)')
    .join(' OR ');
  const tokenParams = queryTokens.flatMap((token) => {
    const pattern = `%${token}%`;
    return [pattern, pattern];
  });
  const tokenScoreExpression = queryTokens.length
    ? queryTokens.map(() => '(CASE WHEN (lower(name) LIKE ? OR lower(COALESCE(category, \'\')) LIKE ?) THEN 1 ELSE 0 END)').join(' + ')
    : '0';
  const tokenScoreParams = queryTokens.flatMap((token) => {
    const pattern = `%${token}%`;
    return [pattern, pattern];
  });
  const whereTokenClause = tokenPredicates ? ` OR ${tokenPredicates}` : '';
  const rows = await dbAll(
    db,
    `SELECT *
     FROM cofid_foods
     WHERE lower(name) LIKE ?
        OR lower(COALESCE(category, '')) LIKE ?
        ${whereTokenClause}
      ORDER BY CASE
       WHEN lower(name) = ? THEN 0
       WHEN lower(name) LIKE ? THEN 1
       WHEN lower(COALESCE(category, '')) LIKE ? THEN 2
       ELSE 3
     END,
     (${tokenScoreExpression}) DESC,
     name ASC
     LIMIT ?`,
    [
      containsPattern,
      containsPattern,
      ...tokenParams,
      exactMatch,
      prefixPattern,
      prefixPattern,
      ...tokenScoreParams,
      Math.max(limit * 12, 60)
    ]
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

  const offOutcome = await searchOpenFoodFactsPrimary(query);
  const offResults = Array.isArray(offOutcome) ? offOutcome : [];

  if (offOutcome && offOutcome.__deadline_error) {
    console.error('Open Food Facts search failed:', offOutcome.__deadline_error);
  }

  const results = dedupeFoods([
    ...cachedPrefixResults,
    ...offResults
  ]).slice(0, 8);

  setCachedValue(foodSearchCache, cacheKey, results, SEARCH_CACHE_TTL_MS);

  return results;
}

function validateMealType(mealType) {
  return VALID_MEAL_TYPES.has(mealType) ? mealType : 'snack';
}

function getAcceptedVoiceKeys() {
  const keys = new Set();
  const configuredKey = String(process.env.VOICE_API_KEY || '').trim();
  const configuredKeys = String(process.env.VOICE_API_KEYS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (configuredKey) {
    keys.add(configuredKey);
  }

  for (const key of configuredKeys) {
    keys.add(key);
  }

  // Keep the original default valid to reduce operator/config friction.
  keys.add(DEFAULT_VOICE_API_KEY);
  return keys;
}

function ensureVoiceKey(req, res, next) {
  const providedKey = req.query.key || req.body?.key;
  const acceptedKeys = getAcceptedVoiceKeys();

  if (!providedKey || !acceptedKeys.has(String(providedKey).trim())) {
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

async function insertMealRow(db, meal) {
  await dbRun(
    db,
    `INSERT INTO meals (
      id, user_id, meal_type, food_name, calories, protein, carbs, fat, logged_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      meal.id,
      meal.user_id,
      meal.meal_type,
      meal.food_name,
      meal.calories,
      meal.protein,
      meal.carbs,
      meal.fat,
      meal.logged_at
    ]
  );
}

async function insertFoodLogRow(db, foodLog) {
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
}

async function verifyPersistedRows(db, userId, mealId, foodLogId) {
  const [mealRow, foodLogRow] = await Promise.all([
    dbGet(db, 'SELECT id FROM meals WHERE id = ? AND user_id = ?', [mealId, userId]),
    dbGet(db, 'SELECT id FROM food_logs WHERE id = ? AND user_id = ?', [foodLogId, userId])
  ]);

  return Boolean(mealRow?.id && foodLogRow?.id);
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

      const cofidResults = await searchCofidFoods(db, query, 8);
      let remoteResults = [];

      if (cofidResults.length < 8) {
        try {
          remoteResults = await searchFoods(query);
        } catch (remoteError) {
          console.error('Voice food remote search failed, retrying with variants:', remoteError);
          remoteResults = await searchOpenFoodFactsVariants(query).catch((variantError) => {
            console.error('Voice food variant search failed:', variantError);
            return [];
          });
        }
      }

      const results = dedupeFoods([...cofidResults, ...remoteResults]).slice(0, 8);
      const topResult = results[0];

      if (!topResult) {
        return res.status(404).json({ error: 'Product not found' });
      }

      const mealId = uuidv4();
      const foodLogId = uuidv4();
      const mealType = validateMealType(meal_type);
      const normalizedLoggedAt = logged_at || new Date().toISOString();
      const foodLog = {
        id: foodLogId,
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
        logged_at: normalizedLoggedAt
      };

      const mealRow = {
        id: mealId,
        user_id,
        meal_type: mealType,
        food_name: topResult.name,
        calories: parseNumber(foodLog.calories) || 0,
        protein: parseNumber(foodLog.protein) || 0,
        carbs: parseNumber(foodLog.carbs) || 0,
        fat: parseNumber(foodLog.fat) || 0,
        logged_at: normalizedLoggedAt
      };

      await dbRun(db, 'BEGIN TRANSACTION');
      let libraryFoodId = null;
      try {
        await insertMealRow(db, mealRow);
        await insertFoodLogRow(db, foodLog);
        libraryFoodId = await saveFoodToLibrary(db, uuidv4, user_id, {
          source: topResult.source,
          name: topResult.name,
          brand: topResult.brand,
          calories_per_100g: topResult.calories_per_100g,
          protein_per_100g: topResult.protein_per_100g,
          carbs_per_100g: topResult.carbs_per_100g,
          fat_per_100g: topResult.fat_per_100g,
          fibre_per_100g: topResult.fibre_per_100g,
          serving_size_g: topResult.serving_size_g
        });
        await dbRun(db, 'COMMIT');
      } catch (writeError) {
        await dbRun(db, 'ROLLBACK').catch(() => null);
        throw writeError;
      }

      const persisted = await verifyPersistedRows(db, user_id, mealId, foodLogId);
      if (!persisted) {
        throw Object.assign(new Error('Write verification failed for voice meal log'), { statusCode: 500 });
      }

      res.status(201).json({
        message: 'Food logged successfully',
        verified: true,
        library_food_id: libraryFoodId,
        meal: {
          id: mealRow.id,
          user_id: mealRow.user_id,
          meal_type: mealRow.meal_type,
          food_name: mealRow.food_name,
          calories: mealRow.calories,
          protein: mealRow.protein,
          carbs: mealRow.carbs,
          fat: mealRow.fat,
          logged_at: mealRow.logged_at
        },
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

      let results = dedupeFoods([...localResults, ...cofidResults, ...remoteResults]).slice(0, 8);

      // AI fallback: expand sparse manual queries and retry search with rewritten variants.
      if (tokenizeSearchText(query).length >= 2 && results.length < 4) {
        const aiVariants = await expandManualSearchQueryWithAi(query);

        if (aiVariants.length) {
          const expandedCollections = [];

          for (const variant of aiVariants) {
            const variantLocal = await searchLocalFoods(db, req.user.userId, variant, 4);
            const variantCofid = await searchCofidFoods(db, variant, 4);
            let variantRemote = [];

            if (dedupeFoods([...variantLocal, ...variantCofid]).length < 6) {
              try {
                variantRemote = await searchFoods(variant);
              } catch (variantRemoteError) {
                console.error(`AI fallback remote food search failed for "${variant}":`, variantRemoteError);
              }
            }

            expandedCollections.push(...variantLocal, ...variantCofid, ...variantRemote);

            if (dedupeFoods([...results, ...expandedCollections]).length >= 8) {
              break;
            }
          }

          results = dedupeFoods([...results, ...expandedCollections]).slice(0, 8);
        }
      }

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
    const mealId = uuidv4();
    const loggedAt = logged_at || new Date().toISOString();

    try {
      await dbRun(db, 'BEGIN TRANSACTION');

      try {
        // Insert into food_logs
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
            loggedAt
          ]
        );

        // Insert into meals for dashboard display
        console.log('Inserting into meals:', { mealId, userId: req.user.userId, mealType, name });
        try {
          await dbRun(
            db,
            `INSERT INTO meals (
              id, user_id, meal_type, food_name, calories, protein, carbs, fat, logged_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              mealId,
              req.user.userId,
              mealType,
              name,
              parseNumber(calories) || 0,
              parseNumber(protein) || 0,
              parseNumber(carbs) || 0,
              parseNumber(fat) || 0,
              loggedAt
            ]
          );
          console.log('Meals insert successful');
        } catch (mealsError) {
          console.error('Meals insert error:', mealsError);
          throw mealsError;
        }

        await dbRun(db, 'COMMIT');
      } catch (writeError) {
        await dbRun(db, 'ROLLBACK').catch(() => null);
        throw writeError;
      }

      res.status(201).json({ id: logId, meal_id: mealId, message: 'Food logged successfully' });
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
