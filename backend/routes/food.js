const express = require('express');

const OPEN_FOOD_FACTS_USER_AGENT = 'PeptiFit/1.0 (https://peptifit.trotters-stuff.uk)';
const VALID_MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
const DEFAULT_VOICE_API_KEY = 'peptifit-voice-key';

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

function getUsdaNutrientValue(foodNutrients, matcher) {
  const nutrient = (foodNutrients || []).find((item) => matcher(item));
  return nutrient ? parseNumber(nutrient.value) : null;
}

function normalizeUsdaFood(food) {
  if (!food || !food.description || !food.fdcId) {
    return null;
  }

  const foodNutrients = food.foodNutrients || [];

  return {
    id: String(food.fdcId),
    source: 'usda',
    name: food.description,
    brand: food.brandOwner || food.brandName || null,
    calories_per_100g: getUsdaNutrientValue(foodNutrients, (item) => item.nutrientNumber === '208' || item.nutrientName === 'Energy'),
    protein_per_100g: getUsdaNutrientValue(foodNutrients, (item) => item.nutrientNumber === '203' || item.nutrientName === 'Protein'),
    carbs_per_100g: getUsdaNutrientValue(foodNutrients, (item) => item.nutrientNumber === '205' || item.nutrientName === 'Carbohydrate, by difference'),
    fat_per_100g: getUsdaNutrientValue(foodNutrients, (item) => item.nutrientNumber === '204' || item.nutrientName === 'Total lipid (fat)'),
    fibre_per_100g: getUsdaNutrientValue(foodNutrients, (item) => item.nutrientNumber === '291' || item.nutrientName === 'Fiber, total dietary'),
    serving_size_g: parseNumber(food.servingSize),
    image_url: null
  };
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      ...options,
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

async function searchOpenFoodFacts(query) {
  const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
  url.searchParams.set('search_terms', query);
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', '8');
  url.searchParams.set('fields', 'code,product_name,brands,nutriments,serving_size,image_small_url');
  url.searchParams.set('lc', 'en');
  url.searchParams.set('cc', 'gb');

  const data = await fetchJson(url.toString(), {
    headers: {
      'User-Agent': OPEN_FOOD_FACTS_USER_AGENT,
      Accept: 'application/json'
    }
  });

  return (data.products || [])
    .map(normalizeOffProduct)
    .filter(Boolean)
    .filter((item) => item.id && item.name);
}

async function searchUsda(query) {
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('query', query);
  url.searchParams.set('api_key', process.env.USDA_API_KEY || 'DEMO_KEY');
  url.searchParams.set('pageSize', '5');

  const data = await fetchJson(url.toString(), {
    headers: {
      Accept: 'application/json'
    }
  });

  return (data.foods || [])
    .map(normalizeUsdaFood)
    .filter(Boolean);
}

async function lookupBarcode(code) {
  const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`;
  const data = await fetchJson(url, {
    headers: {
      'User-Agent': OPEN_FOOD_FACTS_USER_AGENT,
      Accept: 'application/json'
    }
  });

  if (data.status === 0 || !data.product) {
    return null;
  }

  return normalizeOffProduct({ ...data.product, code });
}

async function searchFoods(query) {
  const offResults = await searchOpenFoodFacts(query);

  if (offResults.length >= 3) {
    return offResults;
  }

  const usdaResults = await searchUsda(query);
  return [...offResults, ...usdaResults];
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

function getUpstreamErrorMessage(fallbackMessage) {
  return fallbackMessage || 'Failed to reach food data provider';
}

module.exports = function createFoodRouter({ db, authenticateToken, uuidv4 }) {
  const router = express.Router();

  router.get('/voice/search', ensureVoiceKey, async (req, res) => {
    const query = (req.query.query || '').trim();

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    try {
      const results = await searchFoods(query);
      res.json({ results });
    } catch (error) {
      console.error('Food voice search failed:', error);
      res.status(error.statusCode || 500).json({ error: getUpstreamErrorMessage('Failed to reach food data provider') });
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
      const results = await searchFoods(query);
      res.json({ results });
    } catch (error) {
      console.error('Food search failed:', error);
      res.status(error.statusCode || 500).json({ error: getUpstreamErrorMessage('Failed to reach food data provider') });
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
      res.status(error.statusCode || 500).json({ error: getUpstreamErrorMessage('Failed to reach Open Food Facts') });
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
