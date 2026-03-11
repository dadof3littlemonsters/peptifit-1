const express = require('express');
const { v4: uuidv4 } = require('uuid');

const VALID_MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack']);

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
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function normalizeString(value) {
  return isNonEmptyString(value) ? value.trim() : null;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundNutrient(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return Math.round(value * 10) / 10;
}

function toBoolean(value) {
  return Boolean(Number(value));
}

function validateIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function validateMealType(value) {
  const normalized = String(value || 'snack').trim().toLowerCase();
  return VALID_MEAL_TYPES.has(normalized) ? normalized : 'snack';
}

function tryParseJson(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function scalePer100(value, quantityG) {
  const numericValue = parseNumber(value);
  const numericQuantity = parseNumber(quantityG);

  if (numericValue === null || numericQuantity === null) {
    return null;
  }

  return roundNutrient((numericValue * numericQuantity) / 100);
}

function assistantError(res, status, code, message, details = {}) {
  res.status(status).json({
    success: false,
    warnings: details.warnings || [],
    error: {
      code,
      message,
      ...(details.details ? { details: details.details } : {}),
      ...(details.candidates ? { candidates: details.candidates } : {})
    }
  });
}

function assistantSuccess(req, res, payload, options = {}) {
  const warnings = [...(req.assistantWarnings || []), ...(options.warnings || [])];
  res.status(options.status || 200).json({
    success: true,
    warnings,
    ...(options.ids ? { ids: options.ids } : {}),
    ...(options.verified !== undefined ? { verified: options.verified } : {}),
    data: payload
  });
}

function normalizeSupplement(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    brand: row.brand || null,
    dosage: row.dosage || null,
    dose_amount: row.dose_amount === null || row.dose_amount === undefined ? null : Number(row.dose_amount),
    dose_unit: row.dose_unit || null,
    servings_per_container: row.servings_per_container === null || row.servings_per_container === undefined ? null : Number(row.servings_per_container),
    frequency: row.frequency || null,
    time_of_day: row.time_of_day || null,
    notes: row.notes || null,
    is_active: toBoolean(row.is_active),
    created_at: row.created_at || null
  };
}

function normalizeSupplementLog(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    supplement_id: row.supplement_id,
    supplement_name: row.supplement_name || null,
    supplement_brand: row.supplement_brand || null,
    dose_amount: row.dose_amount === null || row.dose_amount === undefined ? null : Number(row.dose_amount),
    dose_unit: row.dose_unit || null,
    taken_at: row.taken_at,
    notes: row.notes || null
  };
}

function normalizeVital(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    vital_type: row.vital_type,
    value: row.value,
    unit: row.unit || null,
    notes: row.notes || null,
    measured_at: row.measured_at,
    created_at: row.created_at || null
  };
}

function normalizeBloodResult(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    test_date: row.test_date,
    lab_name: row.lab_name || null,
    markers: typeof row.markers === 'string' ? tryParseJson(row.markers, {}) : (row.markers || {}),
    notes: row.notes || null,
    analysis: row.analysis || null,
    created_at: row.created_at || null
  };
}

function normalizePeptide(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description || null,
    dosage_range: row.dosage_range || null,
    frequency: row.frequency || null,
    administration_route: row.administration_route || null,
    storage_requirements: row.storage_requirements || null,
    created_at: row.created_at || null
  };
}

function normalizePeptideConfig(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    user_id: row.user_id,
    peptide_id: row.peptide_id,
    peptide_name: row.peptide_name || null,
    frequency: row.frequency,
    doses: typeof row.doses === 'string' ? tryParseJson(row.doses, []) : (row.doses || []),
    cycle_config: typeof row.cycle_config === 'string' ? tryParseJson(row.cycle_config, null) : (row.cycle_config || null),
    custom_days: typeof row.custom_days === 'string' ? tryParseJson(row.custom_days, []) : (row.custom_days || []),
    every_x_days: row.every_x_days === null || row.every_x_days === undefined ? null : Number(row.every_x_days),
    notes: row.notes || null,
    is_active: toBoolean(row.is_active),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

function normalizePeptideDose(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    peptide_id: row.peptide_id,
    peptide_name: row.peptide_name || null,
    config_id: row.config_id || null,
    dose_amount: Number(row.dose_amount),
    dose_unit: row.dose_unit,
    administration_time: row.administration_time,
    injection_site: row.injection_site || null,
    notes: row.notes || null,
    created_at: row.created_at || null
  };
}

function normalizeMeal(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    meal_type: row.meal_type,
    food_name: row.food_name,
    calories: row.calories === null || row.calories === undefined ? null : Number(row.calories),
    protein: row.protein === null || row.protein === undefined ? null : Number(row.protein),
    carbs: row.carbs === null || row.carbs === undefined ? null : Number(row.carbs),
    fat: row.fat === null || row.fat === undefined ? null : Number(row.fat),
    logged_at: row.logged_at
  };
}

function normalizeFoodLog(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    food_id: row.food_id || null,
    source: row.source || null,
    name: row.name,
    brand: row.brand || null,
    quantity_g: Number(row.quantity_g),
    meal_type: row.meal_type,
    calories: row.calories === null || row.calories === undefined ? null : Number(row.calories),
    protein: row.protein === null || row.protein === undefined ? null : Number(row.protein),
    carbs: row.carbs === null || row.carbs === undefined ? null : Number(row.carbs),
    fat: row.fat === null || row.fat === undefined ? null : Number(row.fat),
    fibre: row.fibre === null || row.fibre === undefined ? null : Number(row.fibre),
    logged_at: row.logged_at,
    created_at: row.created_at || null
  };
}

function buildSupplementDosageText(doseAmount, doseUnit, dosageText) {
  if (isNonEmptyString(dosageText)) {
    return dosageText.trim();
  }

  if (doseAmount !== null && isNonEmptyString(doseUnit)) {
    return `${doseAmount} ${doseUnit.trim()}`;
  }

  return null;
}

function buildFoodCandidate(row, sourceLabel) {
  return {
    id: row.id,
    source: sourceLabel,
    name: row.name,
    brand: row.brand || null,
    serving_size_g: row.serving_size_g === null || row.serving_size_g === undefined ? null : Number(row.serving_size_g),
    calories_per_100g: row.calories_per_100g === null || row.calories_per_100g === undefined ? null : Number(row.calories_per_100g),
    protein_per_100g: row.protein_per_100g === null || row.protein_per_100g === undefined ? null : Number(row.protein_per_100g),
    carbs_per_100g: row.carbs_per_100g === null || row.carbs_per_100g === undefined ? null : Number(row.carbs_per_100g),
    fat_per_100g: row.fat_per_100g === null || row.fat_per_100g === undefined ? null : Number(row.fat_per_100g),
    fibre_per_100g: row.fibre_per_100g === null || row.fibre_per_100g === undefined ? null : Number(row.fibre_per_100g)
  };
}

module.exports = function createAssistantRouter({ db }) {
  const router = express.Router();

  async function requireAssistantAuth(req, res, next) {
    const configuredKey = process.env.ASSISTANT_API_KEY;

    if (!configuredKey) {
      return assistantError(res, 503, 'assistant_auth_not_configured', 'Assistant API is disabled because ASSISTANT_API_KEY is not configured');
    }

    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const apiKey = bearerToken || req.headers['x-assistant-api-key'] || null;

    if (!apiKey) {
      return assistantError(res, 401, 'assistant_auth_required', 'Assistant API key is required');
    }

    if (apiKey !== configuredKey) {
      return assistantError(res, 403, 'assistant_auth_invalid', 'Invalid assistant API key');
    }

    const requestedUserId = normalizeString(req.headers['x-assistant-user-id'])
      || normalizeString(req.query.user_id)
      || normalizeString(req.body && req.body.user_id)
      || normalizeString(process.env.ASSISTANT_USER_ID);

    req.assistantWarnings = [];

    try {
      if (requestedUserId) {
        const userRow = await dbGet(db, 'SELECT id, username, email FROM users WHERE id = ?', [requestedUserId]);

        if (!userRow) {
          return assistantError(res, 404, 'assistant_user_not_found', 'Assistant user could not be resolved', {
            details: { user_id: requestedUserId }
          });
        }

        req.user = { userId: userRow.id, username: userRow.username };
        req.assistantUser = userRow;
        return next();
      }

      const users = await dbAll(db, 'SELECT id, username, email FROM users ORDER BY created_at ASC LIMIT 2');

      if (users.length === 1) {
        req.user = { userId: users[0].id, username: users[0].username };
        req.assistantUser = users[0];
        req.assistantWarnings.push('Assistant user was auto-resolved because exactly one PeptiFit user exists. Set ASSISTANT_USER_ID or X-Assistant-User-Id to make this explicit.');
        return next();
      }

      return assistantError(res, 400, 'assistant_user_required', 'Assistant user could not be resolved unambiguously', {
        details: {
          message: 'Set ASSISTANT_USER_ID or send X-Assistant-User-Id',
          detected_users: users.length
        }
      });
    } catch (error) {
      console.error('Assistant auth resolution failed:', error);
      return assistantError(res, 500, 'assistant_auth_resolution_failed', 'Failed to resolve assistant user');
    }
  }

  async function getSupplementById(userId, supplementId) {
    return dbGet(
      db,
      'SELECT * FROM supplements WHERE id = ? AND user_id = ?',
      [supplementId, userId]
    );
  }

  async function getSupplementLogById(userId, logId) {
    return dbGet(
      db,
      `SELECT l.*, s.name AS supplement_name, s.brand AS supplement_brand, s.dose_amount, s.dose_unit
       FROM supplement_logs l
       JOIN supplements s ON s.id = l.supplement_id
       WHERE l.id = ? AND l.user_id = ?`,
      [logId, userId]
    );
  }

  async function findSupplementsByExactName(userId, name) {
    return dbAll(
      db,
      `SELECT *
       FROM supplements
       WHERE user_id = ?
         AND is_active = 1
         AND lower(trim(name)) = lower(trim(?))
       ORDER BY lower(trim(coalesce(brand, ''))), created_at DESC`,
      [userId, name]
    );
  }

  async function getPeptideById(peptideId) {
    return dbGet(db, 'SELECT * FROM peptides WHERE id = ?', [peptideId]);
  }

  async function findPeptidesByExactName(name) {
    return dbAll(
      db,
      `SELECT *
       FROM peptides
       WHERE lower(trim(name)) = lower(trim(?))
       ORDER BY created_at DESC`,
      [name]
    );
  }

  async function getPeptideConfigById(userId, configId) {
    return dbGet(
      db,
      `SELECT c.*, p.name AS peptide_name
       FROM user_peptide_configs c
       JOIN peptides p ON p.id = c.peptide_id
       WHERE c.id = ? AND c.user_id = ?`,
      [configId, userId]
    );
  }

  async function getPeptideDoseById(userId, doseId) {
    return dbGet(
      db,
      `SELECT d.*, p.name AS peptide_name
       FROM peptide_doses d
       JOIN peptides p ON p.id = d.peptide_id
       WHERE d.id = ? AND d.user_id = ?`,
      [doseId, userId]
    );
  }

  async function getVitalById(userId, vitalId) {
    return dbGet(db, 'SELECT * FROM vitals WHERE id = ? AND user_id = ?', [vitalId, userId]);
  }

  async function getBloodResultById(userId, resultId) {
    return dbGet(db, 'SELECT * FROM blood_results WHERE id = ? AND user_id = ?', [resultId, userId]);
  }

  async function getFoodReference(userId, foodId, sourceHint, exactName, brandHint) {
    if (foodId) {
      if (sourceHint === 'local') {
        const local = await dbGet(
          db,
          'SELECT * FROM scanned_foods WHERE id = ? AND user_id = ?',
          [foodId, userId]
        );

        return local ? { source: 'local', row: local } : null;
      }

      if (sourceHint === 'cofid') {
        const cofid = await dbGet(db, 'SELECT * FROM cofid_foods WHERE id = ?', [foodId]);
        return cofid ? { source: 'cofid', row: cofid } : null;
      }

      const [local, cofid] = await Promise.all([
        dbGet(db, 'SELECT * FROM scanned_foods WHERE id = ? AND user_id = ?', [foodId, userId]),
        dbGet(db, 'SELECT * FROM cofid_foods WHERE id = ?', [foodId])
      ]);

      if (local && cofid) {
        return { ambiguous: true, candidates: [buildFoodCandidate(local, 'local'), buildFoodCandidate(cofid, 'cofid')] };
      }

      if (local) {
        return { source: 'local', row: local };
      }

      if (cofid) {
        return { source: 'cofid', row: cofid };
      }

      return null;
    }

    if (!isNonEmptyString(exactName)) {
      return null;
    }

    const normalizedBrand = normalizeString(brandHint);
    const [localMatches, cofidMatches] = await Promise.all([
      dbAll(
        db,
        `SELECT *
         FROM scanned_foods
         WHERE user_id = ?
           AND lower(trim(name)) = lower(trim(?))
           ${normalizedBrand ? "AND lower(trim(coalesce(brand, ''))) = lower(trim(?))" : ''}
         ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC`,
        normalizedBrand ? [userId, exactName, normalizedBrand] : [userId, exactName]
      ),
      dbAll(
        db,
        `SELECT *
         FROM cofid_foods
         WHERE lower(trim(name)) = lower(trim(?))
         ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
         LIMIT 20`,
        [exactName]
      )
    ]);

    const candidates = [
      ...localMatches.map((row) => ({ source: 'local', row })),
      ...cofidMatches
        .filter((row) => !normalizedBrand || normalizeString(row.brand) === normalizedBrand)
        .map((row) => ({ source: 'cofid', row }))
    ];

    if (candidates.length === 1) {
      return candidates[0];
    }

    if (candidates.length > 1) {
      return {
        ambiguous: true,
        candidates: candidates.map(({ source, row }) => buildFoodCandidate(row, source))
      };
    }

    return null;
  }

  async function getMealAndFoodLog(userId, mealId, foodLogId) {
    const [meal, foodLog] = await Promise.all([
      dbGet(db, 'SELECT * FROM meals WHERE id = ? AND user_id = ?', [mealId, userId]),
      dbGet(db, 'SELECT * FROM food_logs WHERE id = ? AND user_id = ?', [foodLogId, userId])
    ]);

    return { meal, foodLog };
  }

  router.use(requireAssistantAuth);

  router.get('/daily-summary', async (req, res) => {
    const date = String(req.query.date || new Date().toISOString().slice(0, 10)).trim();

    if (!validateIsoDate(date)) {
      return assistantError(res, 400, 'validation_error', 'date must be YYYY-MM-DD');
    }

    try {
      const [mealRows, foodLogRows, supplementRows, vitalRows, peptideDoseRows, bloodRows] = await Promise.all([
        dbAll(
          db,
          `SELECT * FROM meals
           WHERE user_id = ? AND date(logged_at) = date(?)
           ORDER BY datetime(logged_at) ASC`,
          [req.user.userId, date]
        ),
        dbAll(
          db,
          `SELECT * FROM food_logs
           WHERE user_id = ? AND substr(logged_at, 1, 10) = ?
           ORDER BY datetime(logged_at) ASC, created_at ASC`,
          [req.user.userId, date]
        ),
        dbAll(
          db,
          'SELECT * FROM supplements WHERE user_id = ? AND is_active = 1 ORDER BY name',
          [req.user.userId]
        ),
        dbAll(
          db,
          `SELECT vital_type, value, unit, notes, measured_at, created_at, id
           FROM vitals
           WHERE user_id = ?
             AND measured_at = (
               SELECT MAX(v2.measured_at)
               FROM vitals v2
               WHERE v2.user_id = vitals.user_id AND v2.vital_type = vitals.vital_type
             )
           ORDER BY vital_type`,
          [req.user.userId]
        ),
        dbAll(
          db,
          `SELECT d.*, p.name AS peptide_name
           FROM peptide_doses d
           JOIN peptides p ON p.id = d.peptide_id
           WHERE d.user_id = ?
             AND datetime(d.administration_time) >= datetime(? || ' 00:00:00', '-7 days')
             AND datetime(d.administration_time) < datetime(? || ' 00:00:00', '+1 day')
           ORDER BY datetime(d.administration_time) DESC
           LIMIT 10`,
          [req.user.userId, date, date]
        ),
        dbAll(
          db,
          `SELECT *
           FROM blood_results
           WHERE user_id = ?
             AND test_date <= date(?)
           ORDER BY test_date DESC
           LIMIT 5`,
          [req.user.userId, date]
        )
      ]);

      const meals = {
        breakfast: [],
        lunch: [],
        dinner: [],
        snack: []
      };

      mealRows.forEach((row) => {
        const normalized = normalizeMeal(row);
        const mealType = normalized.meal_type || 'snack';

        if (!meals[mealType]) {
          meals[mealType] = [];
        }

        meals[mealType].push(normalized);
      });

      const mealTotals = foodLogRows.reduce((acc, row) => ({
        calories: roundNutrient(acc.calories + (parseNumber(row.calories) || 0)) || 0,
        protein: roundNutrient(acc.protein + (parseNumber(row.protein) || 0)) || 0,
        carbs: roundNutrient(acc.carbs + (parseNumber(row.carbs) || 0)) || 0,
        fat: roundNutrient(acc.fat + (parseNumber(row.fat) || 0)) || 0,
        fibre: roundNutrient(acc.fibre + (parseNumber(row.fibre) || 0)) || 0
      }), { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 });

      const latestVitals = {};
      vitalRows.forEach((row) => {
        latestVitals[row.vital_type] = normalizeVital(row);
      });

      return assistantSuccess(req, res, {
        date,
        meals,
        meal_totals: mealTotals,
        food_logs: foodLogRows.map(normalizeFoodLog),
        active_supplements: supplementRows.map(normalizeSupplement),
        latest_vitals: latestVitals,
        recent_peptide_doses: peptideDoseRows.map(normalizePeptideDose),
        blood_results_recent: bloodRows.map(normalizeBloodResult)
      });
    } catch (error) {
      console.error('Assistant daily summary failed:', error);
      return assistantError(res, 500, 'assistant_daily_summary_failed', 'Failed to build assistant daily summary');
    }
  });

  router.get('/supplements', async (req, res) => {
    const includeInactive = String(req.query.include_inactive || 'false') === 'true';
    const logLimit = Math.min(parseInteger(req.query.log_limit) || 20, 100);

    try {
      const [supplements, logs] = await Promise.all([
        dbAll(
          db,
          `SELECT * FROM supplements
           WHERE user_id = ?
             ${includeInactive ? '' : 'AND is_active = 1'}
           ORDER BY lower(name), datetime(created_at) DESC`,
          [req.user.userId]
        ),
        dbAll(
          db,
          `SELECT l.*, s.name AS supplement_name, s.brand AS supplement_brand, s.dose_amount, s.dose_unit
           FROM supplement_logs l
           JOIN supplements s ON s.id = l.supplement_id
           WHERE l.user_id = ?
           ORDER BY datetime(l.taken_at) DESC
           LIMIT ?`,
          [req.user.userId, logLimit]
        )
      ]);

      return assistantSuccess(req, res, {
        supplements: supplements.map(normalizeSupplement),
        recent_logs: logs.map(normalizeSupplementLog)
      });
    } catch (error) {
      console.error('Assistant supplements fetch failed:', error);
      return assistantError(res, 500, 'assistant_supplements_failed', 'Failed to fetch supplements');
    }
  });

  router.get('/vitals', async (req, res) => {
    const type = normalizeString(req.query.type);
    const date = normalizeString(req.query.date);
    const start = normalizeString(req.query.start) || (validateIsoDate(date) ? `${date}T00:00:00` : null);
    const end = normalizeString(req.query.end) || (validateIsoDate(date) ? `${date}T23:59:59` : null);
    const limit = Math.min(parseInteger(req.query.limit) || 100, 500);

    if (date && !validateIsoDate(date)) {
      return assistantError(res, 400, 'validation_error', 'date must be YYYY-MM-DD');
    }

    try {
      let sql = 'SELECT * FROM vitals WHERE user_id = ?';
      const params = [req.user.userId];

      if (type) {
        sql += ' AND vital_type = ?';
        params.push(type);
      }

      if (start) {
        sql += ' AND measured_at >= ?';
        params.push(start);
      }

      if (end) {
        sql += ' AND measured_at <= ?';
        params.push(end);
      }

      sql += ' ORDER BY datetime(measured_at) DESC LIMIT ?';
      params.push(limit);

      const [latestRows, rows] = await Promise.all([
        dbAll(
          db,
          `SELECT vital_type, value, unit, notes, measured_at, created_at, id
           FROM vitals
           WHERE user_id = ?
             AND measured_at = (
               SELECT MAX(v2.measured_at)
               FROM vitals v2
               WHERE v2.user_id = vitals.user_id AND v2.vital_type = vitals.vital_type
             )
           ORDER BY vital_type`,
          [req.user.userId]
        ),
        dbAll(db, sql, params)
      ]);

      const latestVitals = {};
      latestRows.forEach((row) => {
        latestVitals[row.vital_type] = normalizeVital(row);
      });

      return assistantSuccess(req, res, {
        latest_vitals: latestVitals,
        vitals: rows.map(normalizeVital)
      });
    } catch (error) {
      console.error('Assistant vitals fetch failed:', error);
      return assistantError(res, 500, 'assistant_vitals_failed', 'Failed to fetch vitals');
    }
  });

  router.get('/blood-results', async (req, res) => {
    const resultId = normalizeString(req.query.id);
    const limit = Math.min(parseInteger(req.query.limit) || 50, 200);
    const start = normalizeString(req.query.start);
    const end = normalizeString(req.query.end);

    try {
      if (resultId) {
        const row = await getBloodResultById(req.user.userId, resultId);

        if (!row) {
          return assistantError(res, 404, 'not_found', 'Blood result not found');
        }

        return assistantSuccess(req, res, { blood_result: normalizeBloodResult(row) });
      }

      let sql = 'SELECT * FROM blood_results WHERE user_id = ?';
      const params = [req.user.userId];

      if (start) {
        sql += ' AND test_date >= date(?)';
        params.push(start);
      }

      if (end) {
        sql += ' AND test_date <= date(?)';
        params.push(end);
      }

      sql += ' ORDER BY test_date DESC LIMIT ?';
      params.push(limit);

      const rows = await dbAll(db, sql, params);
      return assistantSuccess(req, res, { blood_results: rows.map(normalizeBloodResult) });
    } catch (error) {
      console.error('Assistant blood results fetch failed:', error);
      return assistantError(res, 500, 'assistant_blood_results_failed', 'Failed to fetch blood results');
    }
  });

  router.get('/peptides', async (req, res) => {
    const doseLimit = Math.min(parseInteger(req.query.dose_limit) || 20, 100);

    try {
      const [peptides, configs, doses] = await Promise.all([
        dbAll(db, 'SELECT * FROM peptides ORDER BY lower(name)', []),
        dbAll(
          db,
          `SELECT c.*, p.name AS peptide_name
           FROM user_peptide_configs c
           JOIN peptides p ON p.id = c.peptide_id
           WHERE c.user_id = ? AND c.is_active = 1
           ORDER BY datetime(c.created_at) DESC`,
          [req.user.userId]
        ),
        dbAll(
          db,
          `SELECT d.*, p.name AS peptide_name
           FROM peptide_doses d
           JOIN peptides p ON p.id = d.peptide_id
           WHERE d.user_id = ?
           ORDER BY datetime(d.administration_time) DESC
           LIMIT ?`,
          [req.user.userId, doseLimit]
        )
      ]);

      return assistantSuccess(req, res, {
        peptides: peptides.map(normalizePeptide),
        active_configs: configs.map(normalizePeptideConfig),
        recent_doses: doses.map(normalizePeptideDose)
      });
    } catch (error) {
      console.error('Assistant peptides fetch failed:', error);
      return assistantError(res, 500, 'assistant_peptides_failed', 'Failed to fetch peptides');
    }
  });

  router.post('/log-food', async (req, res) => {
    const payload = req.body || {};
    const name = normalizeString(payload.name);
    const brand = normalizeString(payload.brand);
    const source = normalizeString(payload.source);
    const foodId = normalizeString(payload.food_id);
    const quantityG = parseNumber(payload.quantity_g);
    const mealType = validateMealType(payload.meal_type);
    const loggedAt = normalizeString(payload.logged_at) || new Date().toISOString();

    if (!name) {
      return assistantError(res, 400, 'validation_error', 'name is required');
    }

    if (quantityG === null || quantityG <= 0) {
      return assistantError(res, 400, 'validation_error', 'quantity_g must be a positive number');
    }

    const providedCalories = parseNumber(payload.calories);
    const providedProtein = parseNumber(payload.protein);
    const providedCarbs = parseNumber(payload.carbs);
    const providedFat = parseNumber(payload.fat);
    const providedFibre = parseNumber(payload.fibre);

    let resolvedFood = null;

    try {
      const hasDirectNutrition = providedCalories !== null;

      if (!hasDirectNutrition || foodId) {
        resolvedFood = await getFoodReference(req.user.userId, foodId, source, name, brand);

        if (resolvedFood && resolvedFood.ambiguous) {
          return assistantError(res, 409, 'ambiguous_food_match', 'Multiple foods match the provided reference', {
            candidates: resolvedFood.candidates
          });
        }

        if (!resolvedFood && !hasDirectNutrition) {
          return assistantError(res, 400, 'insufficient_food_data', 'Food could not be logged because calories were not provided and no exact food reference could be resolved', {
            details: {
              required: ['calories', 'or an exact local/cofid food match'],
              supplied_name: name
            }
          });
        }
      }

      const finalFood = resolvedFood ? buildFoodCandidate(resolvedFood.row, resolvedFood.source) : null;
      const foodLogId = uuidv4();
      const mealId = uuidv4();
      const foodLogRow = {
        id: foodLogId,
        user_id: req.user.userId,
        food_id: finalFood ? finalFood.id : foodId,
        source: finalFood ? finalFood.source : source,
        name: finalFood ? finalFood.name : name,
        brand: finalFood ? finalFood.brand : brand,
        quantity_g: quantityG,
        meal_type: mealType,
        calories: providedCalories !== null ? providedCalories : scalePer100(finalFood.calories_per_100g, quantityG),
        protein: providedProtein !== null ? providedProtein : scalePer100(finalFood.protein_per_100g, quantityG),
        carbs: providedCarbs !== null ? providedCarbs : scalePer100(finalFood.carbs_per_100g, quantityG),
        fat: providedFat !== null ? providedFat : scalePer100(finalFood.fat_per_100g, quantityG),
        fibre: providedFibre !== null ? providedFibre : scalePer100(finalFood.fibre_per_100g, quantityG),
        logged_at: loggedAt
      };

      await dbRun(db, 'BEGIN TRANSACTION');

      try {
        await dbRun(
          db,
          `INSERT INTO food_logs
           (id, user_id, food_id, source, name, brand, quantity_g, meal_type, calories, protein, carbs, fat, fibre, logged_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            foodLogRow.id,
            foodLogRow.user_id,
            foodLogRow.food_id || null,
            foodLogRow.source || null,
            foodLogRow.name,
            foodLogRow.brand || null,
            foodLogRow.quantity_g,
            foodLogRow.meal_type,
            foodLogRow.calories,
            foodLogRow.protein,
            foodLogRow.carbs,
            foodLogRow.fat,
            foodLogRow.fibre,
            foodLogRow.logged_at
          ]
        );

        await dbRun(
          db,
          `INSERT INTO meals
           (id, user_id, meal_type, food_name, calories, protein, carbs, fat, logged_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            mealId,
            req.user.userId,
            foodLogRow.meal_type,
            foodLogRow.name,
            foodLogRow.calories || 0,
            foodLogRow.protein || 0,
            foodLogRow.carbs || 0,
            foodLogRow.fat || 0,
            foodLogRow.logged_at
          ]
        );

        await dbRun(db, 'COMMIT');
      } catch (error) {
        await dbRun(db, 'ROLLBACK').catch(() => null);
        throw error;
      }

      const persisted = await getMealAndFoodLog(req.user.userId, mealId, foodLogId);
      const verified = Boolean(persisted.meal && persisted.foodLog);

      if (!verified) {
        return assistantError(res, 500, 'verification_failed', 'Food log write could not be verified');
      }

      return assistantSuccess(req, res, {
        meal: normalizeMeal(persisted.meal),
        food_log: normalizeFoodLog(persisted.foodLog),
        resolved_food: finalFood
      }, {
        status: 201,
        ids: { meal_id: mealId, food_log_id: foodLogId },
        verified
      });
    } catch (error) {
      console.error('Assistant food log failed:', error);
      return assistantError(res, 500, 'assistant_log_food_failed', 'Failed to log food');
    }
  });

  router.post('/log-supplement', async (req, res) => {
    const supplementId = normalizeString(req.body && req.body.supplement_id);
    const supplementName = normalizeString(req.body && req.body.name);
    const takenAt = normalizeString(req.body && req.body.taken_at) || new Date().toISOString();
    const notes = normalizeString(req.body && req.body.notes);

    try {
      let supplement = null;

      if (supplementId) {
        supplement = await getSupplementById(req.user.userId, supplementId);
        if (!supplement) {
          return assistantError(res, 404, 'not_found', 'Supplement not found', {
            details: { supplement_id: supplementId }
          });
        }
      } else if (supplementName) {
        const matches = await findSupplementsByExactName(req.user.userId, supplementName);

        if (matches.length > 1) {
          return assistantError(res, 409, 'ambiguous_supplement_match', 'Multiple active supplements match the provided name', {
            candidates: matches.map((row) => normalizeSupplement(row))
          });
        }

        if (matches.length === 0) {
          return assistantError(res, 404, 'not_found', 'No active supplement matched the provided name', {
            details: { name: supplementName }
          });
        }

        supplement = matches[0];
      } else {
        return assistantError(res, 400, 'validation_error', 'supplement_id or exact supplement name is required');
      }

      const logId = uuidv4();
      await dbRun(
        db,
        'INSERT INTO supplement_logs (id, supplement_id, user_id, taken_at, notes) VALUES (?, ?, ?, ?, ?)',
        [logId, supplement.id, req.user.userId, takenAt, notes || '']
      );

      const persisted = await getSupplementLogById(req.user.userId, logId);
      const verified = Boolean(persisted);

      if (!verified) {
        return assistantError(res, 500, 'verification_failed', 'Supplement log write could not be verified');
      }

      return assistantSuccess(req, res, {
        supplement: normalizeSupplement(supplement),
        supplement_log: normalizeSupplementLog(persisted)
      }, {
        status: 201,
        ids: { supplement_log_id: logId, supplement_id: supplement.id },
        verified
      });
    } catch (error) {
      console.error('Assistant supplement log failed:', error);
      return assistantError(res, 500, 'assistant_log_supplement_failed', 'Failed to log supplement');
    }
  });

  router.post('/log-vital', async (req, res) => {
    const vitalType = normalizeString(req.body && req.body.vital_type);
    const value = req.body && req.body.value;
    const unit = normalizeString(req.body && req.body.unit);
    const notes = normalizeString(req.body && req.body.notes);
    const measuredAt = normalizeString(req.body && req.body.measured_at) || new Date().toISOString();

    if (!vitalType || value === undefined || value === null || value === '') {
      return assistantError(res, 400, 'validation_error', 'vital_type and value are required');
    }

    try {
      const vitalId = uuidv4();
      await dbRun(
        db,
        'INSERT INTO vitals (id, user_id, vital_type, value, unit, notes, measured_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [vitalId, req.user.userId, vitalType, String(value), unit || '', notes || '', measuredAt]
      );

      const persisted = await getVitalById(req.user.userId, vitalId);
      const verified = Boolean(persisted);

      if (!verified) {
        return assistantError(res, 500, 'verification_failed', 'Vital write could not be verified');
      }

      return assistantSuccess(req, res, {
        vital: normalizeVital(persisted)
      }, {
        status: 201,
        ids: { vital_id: vitalId },
        verified
      });
    } catch (error) {
      console.error('Assistant vital log failed:', error);
      return assistantError(res, 500, 'assistant_log_vital_failed', 'Failed to log vital');
    }
  });

  router.post('/blood-results', async (req, res) => {
    const testDate = normalizeString(req.body && req.body.test_date);
    const labName = normalizeString(req.body && req.body.lab_name);
    const markers = req.body && req.body.markers;
    const notes = normalizeString(req.body && req.body.notes);

    if (!testDate || !validateIsoDate(testDate)) {
      return assistantError(res, 400, 'validation_error', 'test_date is required and must be YYYY-MM-DD');
    }

    if (markers !== undefined && (typeof markers !== 'object' || Array.isArray(markers) || markers === null)) {
      return assistantError(res, 400, 'validation_error', 'markers must be an object when provided');
    }

    try {
      const resultId = uuidv4();
      await dbRun(
        db,
        'INSERT INTO blood_results (id, user_id, test_date, lab_name, markers, notes) VALUES (?, ?, ?, ?, ?, ?)',
        [resultId, req.user.userId, testDate, labName, markers ? JSON.stringify(markers) : null, notes]
      );

      const persisted = await getBloodResultById(req.user.userId, resultId);
      const verified = Boolean(persisted);

      if (!verified) {
        return assistantError(res, 500, 'verification_failed', 'Blood result write could not be verified');
      }

      return assistantSuccess(req, res, {
        blood_result: normalizeBloodResult(persisted)
      }, {
        status: 201,
        ids: { blood_result_id: resultId },
        verified
      });
    } catch (error) {
      console.error('Assistant blood result create failed:', error);
      return assistantError(res, 500, 'assistant_create_blood_result_failed', 'Failed to create blood result');
    }
  });

  router.post('/log-peptide-dose', async (req, res) => {
    const peptideIdInput = normalizeString(req.body && req.body.peptide_id);
    const peptideName = normalizeString(req.body && req.body.peptide_name);
    const configId = normalizeString(req.body && req.body.config_id);
    const doseAmount = parseNumber(req.body && req.body.dose_amount);
    const doseUnit = normalizeString(req.body && req.body.dose_unit);
    const administrationTime = normalizeString(req.body && req.body.administration_time);
    const injectionSite = normalizeString(req.body && req.body.injection_site);
    const notes = normalizeString(req.body && req.body.notes);

    if (doseAmount === null || doseAmount <= 0 || !doseUnit || !administrationTime) {
      return assistantError(res, 400, 'validation_error', 'dose_amount, dose_unit, and administration_time are required');
    }

    try {
      let peptide = null;
      let config = null;

      if (configId) {
        config = await getPeptideConfigById(req.user.userId, configId);

        if (!config) {
          return assistantError(res, 404, 'not_found', 'Peptide configuration not found', {
            details: { config_id: configId }
          });
        }
      }

      if (peptideIdInput) {
        peptide = await getPeptideById(peptideIdInput);
        if (!peptide) {
          return assistantError(res, 404, 'not_found', 'Peptide not found', {
            details: { peptide_id: peptideIdInput }
          });
        }
      } else if (peptideName) {
        const matches = await findPeptidesByExactName(peptideName);

        if (matches.length > 1) {
          return assistantError(res, 409, 'ambiguous_peptide_match', 'Multiple peptides match the provided name', {
            candidates: matches.map(normalizePeptide)
          });
        }

        if (matches.length === 0) {
          return assistantError(res, 404, 'not_found', 'Peptide not found', {
            details: { name: peptideName }
          });
        }

        peptide = matches[0];
      }

      if (!peptide && config) {
        peptide = await getPeptideById(config.peptide_id);
      }

      if (!peptide) {
        return assistantError(res, 400, 'validation_error', 'peptide_id, peptide_name, or config_id is required');
      }

      if (config && config.peptide_id !== peptide.id) {
        return assistantError(res, 400, 'validation_error', 'config_id does not belong to the resolved peptide', {
          details: {
            config_id: config.id,
            config_peptide_id: config.peptide_id,
            peptide_id: peptide.id
          }
        });
      }

      const doseId = uuidv4();
      await dbRun(
        db,
        `INSERT INTO peptide_doses
         (id, user_id, peptide_id, config_id, dose_amount, dose_unit, administration_time, injection_site, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [doseId, req.user.userId, peptide.id, config ? config.id : null, doseAmount, doseUnit, administrationTime, injectionSite, notes]
      );

      const persisted = await getPeptideDoseById(req.user.userId, doseId);
      const verified = Boolean(persisted);

      if (!verified) {
        return assistantError(res, 500, 'verification_failed', 'Peptide dose write could not be verified');
      }

      return assistantSuccess(req, res, {
        peptide: normalizePeptide(peptide),
        peptide_config: config ? normalizePeptideConfig(config) : null,
        peptide_dose: normalizePeptideDose(persisted)
      }, {
        status: 201,
        ids: { dose_id: doseId, peptide_id: peptide.id, ...(config ? { config_id: config.id } : {}) },
        verified
      });
    } catch (error) {
      console.error('Assistant peptide dose log failed:', error);
      return assistantError(res, 500, 'assistant_log_peptide_dose_failed', 'Failed to log peptide dose');
    }
  });

  router.post('/supplements', async (req, res) => {
    const name = normalizeString(req.body && req.body.name);
    const brand = normalizeString(req.body && req.body.brand);
    const doseAmount = parseNumber(req.body && req.body.dose_amount);
    const doseUnit = normalizeString(req.body && req.body.dose_unit);
    const dosage = buildSupplementDosageText(doseAmount, doseUnit, req.body && req.body.dosage);
    const servingsPerContainer = parseInteger(req.body && req.body.servings_per_container);
    const frequency = normalizeString(req.body && req.body.frequency);
    const timeOfDay = normalizeString(req.body && req.body.time_of_day);
    const notes = normalizeString(req.body && req.body.notes);

    if (!name) {
      return assistantError(res, 400, 'validation_error', 'name is required');
    }

    try {
      const supplementId = uuidv4();
      await dbRun(
        db,
        `INSERT INTO supplements
         (id, user_id, name, brand, dosage, dose_amount, dose_unit, servings_per_container, frequency, time_of_day, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          supplementId,
          req.user.userId,
          name,
          brand || '',
          dosage || '',
          doseAmount,
          doseUnit || '',
          servingsPerContainer,
          frequency || '',
          timeOfDay || '',
          notes || ''
        ]
      );

      const persisted = await getSupplementById(req.user.userId, supplementId);
      const verified = Boolean(persisted);

      if (!verified) {
        return assistantError(res, 500, 'verification_failed', 'Supplement write could not be verified');
      }

      return assistantSuccess(req, res, {
        supplement: normalizeSupplement(persisted)
      }, {
        status: 201,
        ids: { supplement_id: supplementId },
        verified
      });
    } catch (error) {
      console.error('Assistant supplement create failed:', error);
      return assistantError(res, 500, 'assistant_create_supplement_failed', 'Failed to create supplement');
    }
  });

  router.put('/supplements/:id', async (req, res) => {
    try {
      const current = await getSupplementById(req.user.userId, req.params.id);

      if (!current) {
        return assistantError(res, 404, 'not_found', 'Supplement not found');
      }

      const name = normalizeString(req.body && req.body.name) || current.name;
      const brand = req.body && Object.prototype.hasOwnProperty.call(req.body, 'brand')
        ? (normalizeString(req.body.brand) || '')
        : current.brand;
      const nextDoseAmount = req.body && Object.prototype.hasOwnProperty.call(req.body, 'dose_amount')
        ? parseNumber(req.body.dose_amount)
        : parseNumber(current.dose_amount);
      const nextDoseUnit = req.body && Object.prototype.hasOwnProperty.call(req.body, 'dose_unit')
        ? (normalizeString(req.body.dose_unit) || '')
        : current.dose_unit;
      const dosage = req.body && Object.prototype.hasOwnProperty.call(req.body, 'dosage')
        ? buildSupplementDosageText(nextDoseAmount, nextDoseUnit, req.body.dosage)
        : buildSupplementDosageText(nextDoseAmount, nextDoseUnit, current.dosage);
      const servingsPerContainer = req.body && Object.prototype.hasOwnProperty.call(req.body, 'servings_per_container')
        ? parseInteger(req.body.servings_per_container)
        : parseInteger(current.servings_per_container);
      const frequency = req.body && Object.prototype.hasOwnProperty.call(req.body, 'frequency')
        ? (normalizeString(req.body.frequency) || '')
        : current.frequency;
      const timeOfDay = req.body && Object.prototype.hasOwnProperty.call(req.body, 'time_of_day')
        ? (normalizeString(req.body.time_of_day) || '')
        : current.time_of_day;
      const notes = req.body && Object.prototype.hasOwnProperty.call(req.body, 'notes')
        ? (normalizeString(req.body.notes) || '')
        : current.notes;
      const isActive = req.body && Object.prototype.hasOwnProperty.call(req.body, 'is_active')
        ? (req.body.is_active ? 1 : 0)
        : current.is_active;

      await dbRun(
        db,
        `UPDATE supplements
         SET name = ?, brand = ?, dosage = ?, dose_amount = ?, dose_unit = ?, servings_per_container = ?, frequency = ?, time_of_day = ?, notes = ?, is_active = ?
         WHERE id = ? AND user_id = ?`,
        [
          name,
          brand || '',
          dosage || '',
          nextDoseAmount,
          nextDoseUnit || '',
          servingsPerContainer,
          frequency || '',
          timeOfDay || '',
          notes || '',
          isActive,
          req.params.id,
          req.user.userId
        ]
      );

      const persisted = await getSupplementById(req.user.userId, req.params.id);
      const verified = Boolean(persisted);

      if (!verified) {
        return assistantError(res, 500, 'verification_failed', 'Supplement update could not be verified');
      }

      return assistantSuccess(req, res, {
        supplement: normalizeSupplement(persisted)
      }, {
        ids: { supplement_id: req.params.id },
        verified
      });
    } catch (error) {
      console.error('Assistant supplement update failed:', error);
      return assistantError(res, 500, 'assistant_update_supplement_failed', 'Failed to update supplement');
    }
  });

  router.post('/peptides', async (req, res) => {
    const name = normalizeString(req.body && req.body.name);
    const description = normalizeString(req.body && req.body.description);
    const dosageRange = normalizeString(req.body && req.body.dosage_range);
    const frequency = normalizeString(req.body && req.body.frequency);
    const administrationRoute = normalizeString(req.body && req.body.administration_route);
    const storageRequirements = normalizeString(req.body && req.body.storage_requirements);

    if (!name) {
      return assistantError(res, 400, 'validation_error', 'name is required');
    }

    try {
      const peptideId = uuidv4();
      const createdAt = new Date().toISOString();
      await dbRun(
        db,
        `INSERT INTO peptides
         (id, name, description, dosage_range, frequency, administration_route, storage_requirements, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          peptideId,
          name,
          description || '',
          dosageRange || '',
          frequency || '',
          administrationRoute || '',
          storageRequirements || '',
          createdAt
        ]
      );

      const persisted = await getPeptideById(peptideId);
      const verified = Boolean(persisted);

      if (!verified) {
        return assistantError(res, 500, 'verification_failed', 'Peptide write could not be verified');
      }

      return assistantSuccess(req, res, {
        peptide: normalizePeptide(persisted)
      }, {
        status: 201,
        ids: { peptide_id: peptideId },
        verified
      });
    } catch (error) {
      console.error('Assistant peptide create failed:', error);
      return assistantError(res, 500, 'assistant_create_peptide_failed', 'Failed to create peptide');
    }
  });

  router.put('/peptides/:id', async (req, res) => {
    try {
      const current = await getPeptideById(req.params.id);

      if (!current) {
        return assistantError(res, 404, 'not_found', 'Peptide not found');
      }

      const name = normalizeString(req.body && req.body.name) || current.name;
      const description = req.body && Object.prototype.hasOwnProperty.call(req.body, 'description')
        ? (normalizeString(req.body.description) || '')
        : current.description;
      const dosageRange = req.body && Object.prototype.hasOwnProperty.call(req.body, 'dosage_range')
        ? (normalizeString(req.body.dosage_range) || '')
        : current.dosage_range;
      const frequency = req.body && Object.prototype.hasOwnProperty.call(req.body, 'frequency')
        ? (normalizeString(req.body.frequency) || '')
        : current.frequency;
      const administrationRoute = req.body && Object.prototype.hasOwnProperty.call(req.body, 'administration_route')
        ? (normalizeString(req.body.administration_route) || '')
        : current.administration_route;
      const storageRequirements = req.body && Object.prototype.hasOwnProperty.call(req.body, 'storage_requirements')
        ? (normalizeString(req.body.storage_requirements) || '')
        : current.storage_requirements;

      await dbRun(
        db,
        `UPDATE peptides
         SET name = ?, description = ?, dosage_range = ?, frequency = ?, administration_route = ?, storage_requirements = ?
         WHERE id = ?`,
        [
          name,
          description || '',
          dosageRange || '',
          frequency || '',
          administrationRoute || '',
          storageRequirements || '',
          req.params.id
        ]
      );

      const persisted = await getPeptideById(req.params.id);
      const verified = Boolean(persisted);

      if (!verified) {
        return assistantError(res, 500, 'verification_failed', 'Peptide update could not be verified');
      }

      return assistantSuccess(req, res, {
        peptide: normalizePeptide(persisted)
      }, {
        ids: { peptide_id: req.params.id },
        verified
      });
    } catch (error) {
      console.error('Assistant peptide update failed:', error);
      return assistantError(res, 500, 'assistant_update_peptide_failed', 'Failed to update peptide');
    }
  });

  router.post('/peptide-configs', async (req, res) => {
    const peptideId = normalizeString(req.body && req.body.peptide_id);
    const frequency = normalizeString(req.body && req.body.frequency);
    const doses = req.body && req.body.doses;
    const cycleConfig = req.body && req.body.cycle_config;
    const customDays = req.body && req.body.custom_days;
    const everyXDays = req.body && Object.prototype.hasOwnProperty.call(req.body, 'every_x_days')
      ? parseInteger(req.body.every_x_days)
      : null;
    const notes = normalizeString(req.body && req.body.notes);

    if (!peptideId || !frequency) {
      return assistantError(res, 400, 'validation_error', 'peptide_id and frequency are required');
    }

    if (doses !== undefined && !Array.isArray(doses)) {
      return assistantError(res, 400, 'validation_error', 'doses must be an array when provided');
    }

    if (cycleConfig !== undefined && (typeof cycleConfig !== 'object' || Array.isArray(cycleConfig) || cycleConfig === null)) {
      return assistantError(res, 400, 'validation_error', 'cycle_config must be an object when provided');
    }

    if (customDays !== undefined && !Array.isArray(customDays)) {
      return assistantError(res, 400, 'validation_error', 'custom_days must be an array when provided');
    }

    try {
      const peptide = await getPeptideById(peptideId);

      if (!peptide) {
        return assistantError(res, 400, 'validation_error', 'Invalid peptide ID', {
          details: { peptide_id: peptideId }
        });
      }

      const configId = uuidv4();
      const now = new Date().toISOString();

      await dbRun(
        db,
        `INSERT INTO user_peptide_configs
         (id, user_id, peptide_id, frequency, doses, cycle_config, custom_days, every_x_days, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          configId,
          req.user.userId,
          peptideId,
          frequency,
          doses ? JSON.stringify(doses) : null,
          cycleConfig ? JSON.stringify(cycleConfig) : null,
          customDays ? JSON.stringify(customDays) : null,
          everyXDays,
          notes,
          now,
          now
        ]
      );

      const persisted = await getPeptideConfigById(req.user.userId, configId);
      const verified = Boolean(persisted);

      if (!verified) {
        return assistantError(res, 500, 'verification_failed', 'Peptide configuration write could not be verified');
      }

      return assistantSuccess(req, res, {
        peptide_config: normalizePeptideConfig(persisted)
      }, {
        status: 201,
        ids: { config_id: configId, peptide_id: peptideId },
        verified
      });
    } catch (error) {
      console.error('Assistant peptide config create failed:', error);
      return assistantError(res, 500, 'assistant_create_peptide_config_failed', 'Failed to create peptide configuration');
    }
  });

  router.put('/peptide-configs/:id', async (req, res) => {
    try {
      const current = await getPeptideConfigById(req.user.userId, req.params.id);

      if (!current) {
        return assistantError(res, 404, 'not_found', 'Peptide configuration not found');
      }

      const nextPeptideId = req.body && Object.prototype.hasOwnProperty.call(req.body, 'peptide_id')
        ? normalizeString(req.body.peptide_id)
        : current.peptide_id;
      const nextFrequency = req.body && Object.prototype.hasOwnProperty.call(req.body, 'frequency')
        ? normalizeString(req.body.frequency)
        : current.frequency;
      const nextDoses = req.body && Object.prototype.hasOwnProperty.call(req.body, 'doses')
        ? req.body.doses
        : tryParseJson(current.doses, []);
      const nextCycleConfig = req.body && Object.prototype.hasOwnProperty.call(req.body, 'cycle_config')
        ? req.body.cycle_config
        : tryParseJson(current.cycle_config, null);
      const nextCustomDays = req.body && Object.prototype.hasOwnProperty.call(req.body, 'custom_days')
        ? req.body.custom_days
        : tryParseJson(current.custom_days, []);
      const nextEveryXDays = req.body && Object.prototype.hasOwnProperty.call(req.body, 'every_x_days')
        ? parseInteger(req.body.every_x_days)
        : parseInteger(current.every_x_days);
      const nextNotes = req.body && Object.prototype.hasOwnProperty.call(req.body, 'notes')
        ? normalizeString(req.body.notes)
        : current.notes;
      const nextIsActive = req.body && Object.prototype.hasOwnProperty.call(req.body, 'is_active')
        ? (req.body.is_active ? 1 : 0)
        : current.is_active;

      if (!nextPeptideId || !nextFrequency) {
        return assistantError(res, 400, 'validation_error', 'peptide_id and frequency must remain set');
      }

      if (!Array.isArray(nextDoses)) {
        return assistantError(res, 400, 'validation_error', 'doses must be an array');
      }

      if (nextCycleConfig !== null && nextCycleConfig !== undefined && (typeof nextCycleConfig !== 'object' || Array.isArray(nextCycleConfig))) {
        return assistantError(res, 400, 'validation_error', 'cycle_config must be an object when provided');
      }

      if (!Array.isArray(nextCustomDays)) {
        return assistantError(res, 400, 'validation_error', 'custom_days must be an array');
      }

      const peptide = await getPeptideById(nextPeptideId);
      if (!peptide) {
        return assistantError(res, 400, 'validation_error', 'Invalid peptide ID', {
          details: { peptide_id: nextPeptideId }
        });
      }

      const now = new Date().toISOString();
      await dbRun(
        db,
        `UPDATE user_peptide_configs
         SET peptide_id = ?, frequency = ?, doses = ?, cycle_config = ?, custom_days = ?, every_x_days = ?, notes = ?, is_active = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        [
          nextPeptideId,
          nextFrequency,
          JSON.stringify(nextDoses),
          nextCycleConfig ? JSON.stringify(nextCycleConfig) : null,
          nextCustomDays ? JSON.stringify(nextCustomDays) : null,
          nextEveryXDays,
          nextNotes || null,
          nextIsActive,
          now,
          req.params.id,
          req.user.userId
        ]
      );

      const persisted = await getPeptideConfigById(req.user.userId, req.params.id);
      const verified = Boolean(persisted);

      if (!verified) {
        return assistantError(res, 500, 'verification_failed', 'Peptide configuration update could not be verified');
      }

      return assistantSuccess(req, res, {
        peptide_config: normalizePeptideConfig(persisted)
      }, {
        ids: { config_id: req.params.id, peptide_id: persisted.peptide_id },
        verified
      });
    } catch (error) {
      console.error('Assistant peptide config update failed:', error);
      return assistantError(res, 500, 'assistant_update_peptide_config_failed', 'Failed to update peptide configuration');
    }
  });

  return router;
};
