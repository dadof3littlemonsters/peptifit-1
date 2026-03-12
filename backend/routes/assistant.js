const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const createAiRouter = require('./ai');
const { v4: uuidv4 } = require('uuid');

const VALID_MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
const OPEN_FOOD_FACTS_USER_AGENT = 'PeptiFit/1.0 (https://peptifit.trotters-stuff.uk)';
const REMOTE_SEARCH_MIN_QUERY_LENGTH = 3;
const { scanNutritionLabel } = createAiRouter.helpers;

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

function parseServingSize(servingSize) {
  if (!servingSize || typeof servingSize !== 'string') {
    return null;
  }

  const match = servingSize.replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(g|gram|grams|ml)\b/i);
  return match ? parseNumber(match[1]) : null;
}

function stripDataUrlPrefix(value) {
  const text = String(value || '').trim();
  const commaIndex = text.indexOf(',');

  if (text.startsWith('data:') && commaIndex !== -1) {
    return text.slice(commaIndex + 1);
  }

  return text;
}

function getMimeTypeFromDataUrl(value, fallback = 'application/octet-stream') {
  const text = String(value || '').trim();
  const match = text.match(/^data:([^;,]+)[;,]/i);
  return match ? match[1].toLowerCase() : fallback;
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

function normalizeLoggedFood(row) {
  if (!row || !row.name) {
    return null;
  }

  const quantityG = parseNumber(row.quantity_g);
  const toPer100 = (value) => {
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
    calories_per_100g: toPer100(row.calories),
    protein_per_100g: toPer100(row.protein),
    carbs_per_100g: toPer100(row.carbs),
    fat_per_100g: toPer100(row.fat),
    fibre_per_100g: toPer100(row.fibre),
    serving_size_g: quantityG,
    image_url: null
  };
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

function dedupeFoodCandidates(items) {
  const seen = new Set();

  return items.filter((item) => {
    const key = `${String(item.name || '').toLowerCase()}::${String(item.brand || '').toLowerCase()}::${String(item.source || '').toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
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

async function searchOpenFoodFacts(query, options = {}) {
  const { country = 'gb', language = 'en' } = options;
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
    .filter((item) => item && item.id && item.name);
}

async function lookupOffBarcode(code) {
  const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(String(code || '').trim())}.json`;
  const data = await fetchJson(url, {
    headers: {
      'User-Agent': OPEN_FOOD_FACTS_USER_AGENT,
      Accept: 'application/json'
    },
    timeoutMs: 8000
  });

  if (data.status === 0 || !data.product) {
    return null;
  }

  return normalizeOffProduct({ ...data.product, code });
}

async function resolveImageDataUrl(payload) {
  const inlineImage = normalizeString(payload.image) || normalizeString(payload.image_base64);
  if (inlineImage) {
    if (inlineImage.startsWith('data:')) {
      return inlineImage;
    }

    return `data:${getMimeTypeFromDataUrl(payload.image, 'image/png')};base64,${stripDataUrlPrefix(inlineImage)}`;
  }

  const imagePath = normalizeString(payload.image_path);
  if (!imagePath) {
    return null;
  }

  const resolvedPath = path.resolve(imagePath);
  const ext = path.extname(resolvedPath).toLowerCase();
  const mimeType = ext === '.jpg' || ext === '.jpeg'
    ? 'image/jpeg'
    : ext === '.webp'
      ? 'image/webp'
      : 'image/png';
  const buffer = await fs.readFile(resolvedPath);
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function normalizeParsedLabelData(data, warnings = []) {
  const normalized = {
    name: normalizeString(data.name) || 'Scanned food',
    brand: normalizeString(data.brand),
    serving_size_g: parseNumber(data.serving_size_g),
    calories_per_100g: parseNumber(data.calories_per_100g),
    protein_per_100g: parseNumber(data.protein_per_100g),
    carbs_per_100g: parseNumber(data.carbs_per_100g),
    fat_per_100g: parseNumber(data.fat_per_100g),
    fibre_per_100g: parseNumber(data.fibre_per_100g),
    calories_per_serving: parseNumber(data.calories_per_serving ?? data.calories),
    protein_per_serving: parseNumber(data.protein_per_serving ?? data.protein),
    carbs_per_serving: parseNumber(data.carbs_per_serving ?? data.carbs),
    fat_per_serving: parseNumber(data.fat_per_serving ?? data.fat),
    fibre_per_serving: parseNumber(data.fibre_per_serving ?? data.fibre),
    confidence: data.confidence !== undefined ? parseNumber(data.confidence) : null
  };

  if (!normalized.calories_per_100g && normalized.calories_per_serving !== null && normalized.serving_size_g) {
    normalized.calories_per_100g = roundNutrient((normalized.calories_per_serving / normalized.serving_size_g) * 100);
  }
  if (!normalized.protein_per_100g && normalized.protein_per_serving !== null && normalized.serving_size_g) {
    normalized.protein_per_100g = roundNutrient((normalized.protein_per_serving / normalized.serving_size_g) * 100);
  }
  if (!normalized.carbs_per_100g && normalized.carbs_per_serving !== null && normalized.serving_size_g) {
    normalized.carbs_per_100g = roundNutrient((normalized.carbs_per_serving / normalized.serving_size_g) * 100);
  }
  if (!normalized.fat_per_100g && normalized.fat_per_serving !== null && normalized.serving_size_g) {
    normalized.fat_per_100g = roundNutrient((normalized.fat_per_serving / normalized.serving_size_g) * 100);
  }
  if (!normalized.fibre_per_100g && normalized.fibre_per_serving !== null && normalized.serving_size_g) {
    normalized.fibre_per_100g = roundNutrient((normalized.fibre_per_serving / normalized.serving_size_g) * 100);
  }

  return {
    ...normalized,
    warnings
  };
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

function buildSupplementComponent(name, amount, unit, options = {}) {
  const normalizedName = normalizeString(name);
  const normalizedAmount = parseNumber(amount);
  const normalizedUnit = normalizeString(unit);
  const normalizedBasis = normalizeString(options.basis);
  const normalizedContext = normalizeString(options.context);

  if (!normalizedName || normalizedAmount === null || !normalizedUnit) {
    return null;
  }

  return {
    name: normalizedName,
    amount: normalizedAmount,
    unit: normalizedUnit,
    basis: normalizedBasis,
    context: normalizedContext
  };
}

function parseSupplementComponents(row) {
  const notes = normalizeString(row && row.notes);
  if (!notes) {
    return [];
  }

  const strengthAmount = parseNumber(row && row.strength_amount);
  const strengthUnit = normalizeString(row && row.strength_unit);
  const strengthBasis = normalizeString(row && row.strength_basis);
  const totalDoseAmount = parseNumber(row && row.total_dose_amount);
  const totalDoseUnit = normalizeString(row && row.total_dose_unit);
  const supplementName = String(row && row.name || '').trim().toLowerCase();
  const dedupe = new Set();
  const components = [];
  const addComponent = (component) => {
    if (!component) {
      return;
    }

    const componentName = component.name.toLowerCase();
    const matchesPrimaryStrength =
      strengthAmount !== null &&
      component.amount === strengthAmount &&
      component.unit.toLowerCase() === String(strengthUnit || '').toLowerCase() &&
      String(component.basis || '').toLowerCase() === String(strengthBasis || '').toLowerCase() &&
      supplementName.includes(componentName);
    const matchesPrimaryTotal =
      totalDoseAmount !== null &&
      component.amount === totalDoseAmount &&
      component.unit.toLowerCase() === String(totalDoseUnit || '').toLowerCase() &&
      supplementName.includes(componentName);

    if (matchesPrimaryStrength || matchesPrimaryTotal) {
      return;
    }

    const key = [
      componentName,
      component.amount,
      component.unit.toLowerCase(),
      String(component.basis || '').toLowerCase(),
      String(component.context || '').toLowerCase()
    ].join('::');

    if (dedupe.has(key)) {
      return;
    }

    dedupe.add(key);
    components.push(component);
  };

  const contextualPattern = /([^.:]+?)\s*\(([^)]+)\)\s*:\s*([^.]*)/gi;
  let contextualMatch;
  while ((contextualMatch = contextualPattern.exec(notes)) !== null) {
    const rawContext = normalizeString(contextualMatch[1]);
    const rawBasis = normalizeString(contextualMatch[2]);
    const body = String(contextualMatch[3] || '');
    const context = rawContext ? rawContext.toLowerCase().replace(/\s+/g, '_') : null;
    const basis = rawBasis ? `per ${rawBasis}` : null;

    body.split(';').forEach((part) => {
      const item = normalizeString(part);
      if (!item) {
        return;
      }
      const match = item.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(mg|mcg|g|kg|iu|µg)\b/i);
      if (!match) {
        return;
      }
      addComponent(buildSupplementComponent(match[1], match[2], match[3], { basis, context }));
    });
  }

  const genericNotes = notes.replace(contextualPattern, '');

  genericNotes.split(/[.;]/).forEach((fragment) => {
    const text = normalizeString(fragment);
    if (!text || text.includes(':')) {
      return;
    }

    const perMatch = text.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(mg|mcg|g|kg|iu|µg)\s+per\s+(.+)$/i);
    if (perMatch) {
      addComponent(buildSupplementComponent(perMatch[1], perMatch[2], perMatch[3], {
        basis: `per ${normalizeString(perMatch[4])}`
      }));
      return;
    }

    const trailingMatch = text.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(mg|mcg|g|kg|iu|µg)$/i);
    if (trailingMatch) {
      addComponent(buildSupplementComponent(trailingMatch[1], trailingMatch[2], trailingMatch[3], {
        basis: strengthBasis
      }));
    }
  });

  const parentheticalPattern = /\((\d+(?:\.\d+)?)\s*(mg|mcg|g|kg|iu|µg)\s+([^)]+)\)/gi;
  let parentheticalMatch;
  while ((parentheticalMatch = parentheticalPattern.exec(notes)) !== null) {
    addComponent(buildSupplementComponent(parentheticalMatch[3], parentheticalMatch[1], parentheticalMatch[2], {
      basis: strengthBasis
    }));
  }

  return components;
}

function normalizeSupplement(row) {
  if (!row) {
    return null;
  }

  const countPerDose = row.count_per_dose === null || row.count_per_dose === undefined || row.count_per_dose === ''
    ? null
    : Number(row.count_per_dose);
  const countUnit = normalizeString(row.count_unit);
  const strengthAmount = row.strength_amount === null || row.strength_amount === undefined || row.strength_amount === ''
    ? null
    : Number(row.strength_amount);
  const strengthUnit = normalizeString(row.strength_unit);
  const strengthBasis = normalizeString(row.strength_basis);
  const totalDoseAmount = row.total_dose_amount === null || row.total_dose_amount === undefined || row.total_dose_amount === ''
    ? null
    : Number(row.total_dose_amount);
  const totalDoseUnit = normalizeString(row.total_dose_unit);
  const components = parseSupplementComponents(row);

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
    created_at: row.created_at || null,
    count_per_dose: countPerDose,
    count_unit: countUnit,
    strength_amount: strengthAmount,
    strength_unit: strengthUnit,
    strength_basis: strengthBasis,
    total_dose_amount: totalDoseAmount,
    total_dose_unit: totalDoseUnit,
    practical_dose: {
      count_per_dose: countPerDose,
      count_unit: countUnit,
      frequency: row.frequency || null,
      time_of_day: row.time_of_day || null
    },
    strength: {
      amount: strengthAmount,
      unit: strengthUnit,
      basis: strengthBasis
    },
    total_dose: {
      amount: totalDoseAmount,
      unit: totalDoseUnit
    },
    components
  };
}

function normalizeSupplementLog(row) {
  if (!row) {
    return null;
  }

  const components = parseSupplementComponents({
    name: row.supplement_name,
    notes: row.supplement_notes,
    strength_amount: row.strength_amount,
    strength_unit: row.strength_unit,
    strength_basis: row.strength_basis,
    total_dose_amount: row.total_dose_amount,
    total_dose_unit: row.total_dose_unit
  });

  return {
    id: row.id,
    supplement_id: row.supplement_id,
    supplement_name: row.supplement_name || null,
    supplement_brand: row.supplement_brand || null,
    dose_amount: row.dose_amount === null || row.dose_amount === undefined ? null : Number(row.dose_amount),
    dose_unit: row.dose_unit || null,
    taken_at: row.taken_at,
    notes: row.notes || null,
    practical_dose: {
      count_per_dose: row.count_per_dose === null || row.count_per_dose === undefined ? null : Number(row.count_per_dose),
      count_unit: normalizeString(row.count_unit)
    },
    strength: {
      amount: row.strength_amount === null || row.strength_amount === undefined ? null : Number(row.strength_amount),
      unit: normalizeString(row.strength_unit),
      basis: normalizeString(row.strength_basis)
    },
    total_dose: {
      amount: row.total_dose_amount === null || row.total_dose_amount === undefined ? null : Number(row.total_dose_amount),
      unit: normalizeString(row.total_dose_unit)
    },
    components
  };
}

function normalizeSupplementGroup(row, supplements = []) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    group_name: row.name,
    normalized_name: row.normalized_name || normalizeString(row.name),
    display_name: row.display_name || row.name,
    is_default: toBoolean(row.is_default),
    is_active: row.is_active === undefined ? true : toBoolean(row.is_active),
    supplement_count: supplements.length,
    supplements
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

function singularSupplementUnit(unit) {
  const normalized = String(unit || '').trim().toLowerCase();
  if (!normalized) {
    return '';
  }
  if (normalized.endsWith('s')) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function pluralSupplementUnit(unit, count) {
  const singular = singularSupplementUnit(unit);
  if (!singular) {
    return '';
  }
  return Number(count) === 1 ? singular : `${singular}s`;
}

function buildLegacySupplementFields(payload = {}) {
  const countPerDose = parseNumber(payload.count_per_dose);
  const countUnit = singularSupplementUnit(payload.count_unit);
  const strengthAmount = parseNumber(payload.strength_amount);
  const strengthUnit = normalizeString(payload.strength_unit);
  const totalDoseAmount = parseNumber(payload.total_dose_amount);
  const totalDoseUnit = normalizeString(payload.total_dose_unit);

  const dosage = normalizeString(payload.dosage)
    || (totalDoseAmount !== null && totalDoseUnit ? `${totalDoseAmount} ${totalDoseUnit}` : null)
    || (strengthAmount !== null && strengthUnit ? `${strengthAmount} ${strengthUnit}` : null)
    || (countPerDose !== null && countUnit ? `${countPerDose} ${pluralSupplementUnit(countUnit, countPerDose)}` : null)
    || '';

  if (countPerDose !== null && countUnit) {
    return {
      dosage,
      dose_amount: countPerDose,
      dose_unit: pluralSupplementUnit(countUnit, countPerDose)
    };
  }

  if (strengthAmount !== null && strengthUnit) {
    return {
      dosage,
      dose_amount: strengthAmount,
      dose_unit: strengthUnit
    };
  }

  return {
    dosage,
    dose_amount: totalDoseAmount,
    dose_unit: totalDoseUnit || ''
  };
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

  async function searchLocalFoods(userId, query, limit = 8) {
    const pattern = `%${String(query || '').toLowerCase()}%`;
    const [libraryRows, loggedRows] = await Promise.all([
      dbAll(
        db,
        `SELECT *
         FROM scanned_foods
         WHERE user_id = ?
           AND (lower(name) LIKE ? OR lower(COALESCE(brand, '')) LIKE ?)
         ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
         LIMIT ?`,
        [userId, pattern, pattern, limit]
      ),
      dbAll(
        db,
        `SELECT name, brand, source, quantity_g, calories, protein, carbs, fat, fibre, MAX(datetime(logged_at)) AS last_logged_at
         FROM food_logs
         WHERE user_id = ?
           AND (lower(name) LIKE ? OR lower(COALESCE(brand, '')) LIKE ?)
         GROUP BY lower(name), lower(COALESCE(brand, ''))
         ORDER BY last_logged_at DESC
         LIMIT ?`,
        [userId, pattern, pattern, limit]
      )
    ]);

    return dedupeFoodCandidates([
      ...libraryRows.map(normalizeLocalFood).filter(Boolean),
      ...loggedRows.map(normalizeLoggedFood).filter(Boolean)
    ]).slice(0, limit);
  }

  async function searchCofidFoods(query, limit = 8) {
    const pattern = `%${String(query || '').toLowerCase()}%`;
    const rows = await dbAll(
      db,
      `SELECT *
       FROM cofid_foods
       WHERE lower(name) LIKE ? OR lower(COALESCE(category, '')) LIKE ?
       ORDER BY name ASC
       LIMIT ?`,
      [pattern, pattern, Math.max(limit * 3, 24)]
    );

    return rows
      .map((row) => ({
        id: String(row.id),
        source: 'cofid',
        name: row.name,
        brand: row.category || null,
        calories_per_100g: parseNumber(row.calories_per_100g),
        protein_per_100g: parseNumber(row.protein_per_100g),
        carbs_per_100g: parseNumber(row.carbs_per_100g),
        fat_per_100g: parseNumber(row.fat_per_100g),
        fibre_per_100g: parseNumber(row.fibre_per_100g),
        serving_size_g: parseNumber(row.serving_size_g),
        image_url: null
      }))
      .filter((item) => item.name)
      .slice(0, limit);
  }

  async function searchRemoteFoods(query, limit = 8) {
    if (String(query || '').trim().length < REMOTE_SEARCH_MIN_QUERY_LENGTH) {
      return [];
    }

    try {
      const [regionalResults, globalResults] = await Promise.all([
        searchOpenFoodFacts(query, { country: 'gb', language: 'en' }).catch(() => []),
        searchOpenFoodFacts(query, { country: null, language: 'en' }).catch(() => [])
      ]);

      return dedupeFoodCandidates([...regionalResults, ...globalResults]).slice(0, limit);
    } catch (error) {
      return [];
    }
  }

  async function searchFoodCandidates(userId, query, limit = 8) {
    const [localResults, cofidResults] = await Promise.all([
      searchLocalFoods(userId, query, limit),
      searchCofidFoods(query, Math.max(limit, 8))
    ]);
    let remoteResults = [];

    if (dedupeFoodCandidates([...localResults, ...cofidResults]).length < limit) {
      remoteResults = await searchRemoteFoods(query, limit);
    }

    return dedupeFoodCandidates([...localResults, ...cofidResults, ...remoteResults]).slice(0, limit);
  }

  async function parseNutritionLabelPayload(payload) {
    const image = await resolveImageDataUrl(payload || {});
    const productNameHint = normalizeString(payload?.product_name_hint);
    const warnings = [];

    if (!image) {
      throw Object.assign(new Error('image, image_base64, or image_path is required'), { statusCode: 400 });
    }

    try {
      const parsed = await scanNutritionLabel({ image, productNameHint });
      const populatedFields = [
        parsed.calories_per_100g,
        parsed.protein_per_100g,
        parsed.carbs_per_100g,
        parsed.fat_per_100g,
        parsed.calories_per_serving
      ].filter((value) => value !== null).length;

      if (populatedFields < 3) {
        warnings.push('Nutrition label extraction returned limited structured data. Confirm values before logging.');
      }

      return normalizeParsedLabelData(parsed, warnings);
    } catch (error) {
      throw Object.assign(new Error(error.message || 'Failed to parse nutrition label'), {
        statusCode: error.statusCode || 502
      });
    }
  }

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
      `SELECT l.*, s.name AS supplement_name, s.brand AS supplement_brand, s.notes AS supplement_notes, s.dose_amount, s.dose_unit, s.count_per_dose, s.count_unit, s.strength_amount, s.strength_unit, s.strength_basis, s.total_dose_amount, s.total_dose_unit
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

  async function getSupplementGroupByName(userId, groupName) {
    return dbGet(
      db,
      `SELECT *
       FROM supplement_groups
       WHERE user_id = ?
         AND normalized_name = ?
         AND is_active = 1`,
      [userId, normalizeString(groupName)?.toLowerCase()]
    );
  }

  async function getSupplementGroupSupplements(userId, groupId, options = {}) {
    const includeInactive = options.includeInactive === true;

    return dbAll(
      db,
      `SELECT s.*, m.position
       FROM supplement_group_memberships m
       JOIN supplements s ON s.id = m.supplement_id
       WHERE m.user_id = ?
         AND m.group_id = ?
         ${includeInactive ? '' : 'AND s.is_active = 1'}
       ORDER BY m.position ASC, lower(s.name) ASC`,
      [userId, groupId]
    );
  }

  async function listSupplementGroups(userId, options = {}) {
    const groups = await dbAll(
      db,
      `SELECT *
       FROM supplement_groups
       WHERE user_id = ?
         AND is_active = 1
       ORDER BY lower(display_name), created_at ASC`,
      [userId]
    );

    const includeSupplements = options.includeSupplements !== false;

    if (!includeSupplements) {
      return groups.map((group) => normalizeSupplementGroup(group, []));
    }

    const normalizedGroups = [];
    for (const group of groups) {
      const supplements = await getSupplementGroupSupplements(userId, group.id, { includeInactive: false });
      normalizedGroups.push(normalizeSupplementGroup(group, supplements.map(normalizeSupplement)));
    }

    return normalizedGroups;
  }

  function normalizeSupplementIdList(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((item) => normalizeString(item)).filter(Boolean);
  }

  async function validateGroupSupplementIds(userId, supplementIds) {
    const normalizedIds = normalizeSupplementIdList(supplementIds);
    const duplicates = normalizedIds.filter((value, index) => normalizedIds.indexOf(value) !== index);

    if (duplicates.length > 0) {
      return {
        error: {
          status: 400,
          code: 'duplicate_supplement_ids',
          message: 'Duplicate supplement_ids were provided',
          details: {
            duplicate_ids: [...new Set(duplicates)]
          }
        }
      };
    }

    const rows = [];
    const invalidIds = [];
    const inactiveIds = [];

    for (const supplementId of normalizedIds) {
      const supplement = await getSupplementById(userId, supplementId);
      if (!supplement) {
        invalidIds.push(supplementId);
        continue;
      }

      if (!toBoolean(supplement.is_active)) {
        inactiveIds.push(supplementId);
        continue;
      }

      rows.push(supplement);
    }

    if (invalidIds.length > 0 || inactiveIds.length > 0) {
      return {
        error: {
          status: 400,
          code: 'invalid_supplement_group_members',
          message: 'One or more supplement_ids could not be added to the group',
          details: {
            invalid_ids: invalidIds,
            inactive_ids: inactiveIds
          }
        }
      };
    }

    return {
      supplementIds: normalizedIds,
      rows
    };
  }

  async function replaceSupplementGroupMemberships(userId, groupId, supplementIds) {
    await dbRun(
      db,
      'DELETE FROM supplement_group_memberships WHERE user_id = ? AND group_id = ?',
      [userId, groupId]
    );

    for (let index = 0; index < supplementIds.length; index += 1) {
      await dbRun(
        db,
        `INSERT INTO supplement_group_memberships (id, group_id, supplement_id, user_id, position)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), groupId, supplementIds[index], userId, index]
      );
    }
  }

  async function getNormalizedSupplementGroupByName(userId, groupName) {
    const group = await getSupplementGroupByName(userId, groupName);
    if (!group) {
      return null;
    }

    const supplements = await getSupplementGroupSupplements(userId, group.id, { includeInactive: false });
    return normalizeSupplementGroup(group, supplements.map(normalizeSupplement));
  }

  async function resolveSupplementBatch(req, options = {}) {
    const userId = req.user.userId;
    const groupName = normalizeString(req.body && req.body.group_name);
    const supplementIds = Array.isArray(req.body && req.body.supplement_ids)
      ? req.body.supplement_ids.map((value) => normalizeString(value)).filter(Boolean)
      : [];

    if (groupName && supplementIds.length > 0) {
      return {
        error: {
          status: 400,
          code: 'validation_error',
          message: 'Provide either group_name or supplement_ids, not both'
        }
      };
    }

    if (!groupName && supplementIds.length === 0) {
      return {
        error: {
          status: 400,
          code: 'validation_error',
          message: 'group_name or supplement_ids is required'
        }
      };
    }

    if (supplementIds.length > 0) {
      const duplicates = supplementIds.filter((value, index) => supplementIds.indexOf(value) !== index);
      if (duplicates.length > 0) {
        return {
          error: {
            status: 400,
            code: 'duplicate_supplement_ids',
            message: 'Duplicate supplement_ids were provided',
            details: {
              duplicate_ids: [...new Set(duplicates)]
            }
          }
        };
      }
    }

    let group = null;
    let groupSupplements = [];
    let requestedIds = supplementIds;

    if (groupName) {
      group = await getSupplementGroupByName(userId, groupName);
      if (!group) {
        return {
          error: {
            status: 404,
            code: 'supplement_group_not_found',
            message: `Supplement group ${groupName} was not found`
          }
        };
      }

      groupSupplements = await getSupplementGroupSupplements(userId, group.id, { includeInactive: false });
      if (groupSupplements.length === 0) {
        return {
          error: {
            status: 400,
            code: 'empty_supplement_group',
            message: `Supplement group ${group.name} has no active supplements`
          }
        };
      }

      requestedIds = groupSupplements.map((supplement) => supplement.id);
    }

    const resolvedRows = [];
    const results = [];
    for (const supplementId of requestedIds) {
      const supplement = groupName
        ? groupSupplements.find((item) => item.id === supplementId)
        : await getSupplementById(userId, supplementId);

      if (!supplement) {
        results.push({
          supplement_id: supplementId,
          supplement_name: null,
          status: 'failed',
          error: 'Supplement not found for user'
        });
        continue;
      }

      if (!toBoolean(supplement.is_active)) {
        results.push({
          supplement_id: supplement.id,
          supplement_name: supplement.name,
          status: 'failed',
          error: 'Supplement is inactive'
        });
        continue;
      }

      resolvedRows.push(supplement);
      results.push({
        supplement_id: supplement.id,
        supplement_name: supplement.name,
        status: options.mode === 'check' ? 'pending_check' : 'pending'
      });
    }

    return {
      group,
      requestedIds,
      resolvedRows,
      results
    };
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

  async function getMealById(userId, mealId) {
    return dbGet(db, 'SELECT * FROM meals WHERE id = ? AND user_id = ?', [mealId, userId]);
  }

  async function getFoodLogById(userId, foodLogId) {
    return dbGet(db, 'SELECT * FROM food_logs WHERE id = ? AND user_id = ?', [foodLogId, userId]);
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
          `SELECT l.*, s.name AS supplement_name, s.brand AS supplement_brand, s.notes AS supplement_notes, s.dose_amount, s.dose_unit, s.count_per_dose, s.count_unit, s.strength_amount, s.strength_unit, s.strength_basis, s.total_dose_amount, s.total_dose_unit
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

  router.get('/supplement-groups', async (req, res) => {
    try {
      const groups = await listSupplementGroups(req.user.userId, { includeSupplements: true });
      return assistantSuccess(req, res, { groups });
    } catch (error) {
      console.error('Assistant supplement groups fetch failed:', error);
      return assistantError(res, 500, 'assistant_supplement_groups_failed', 'Failed to fetch supplement groups');
    }
  });

  router.get('/supplement-groups/:groupName', async (req, res) => {
    try {
      const group = await getSupplementGroupByName(req.user.userId, req.params.groupName);
      if (!group) {
        return assistantError(res, 404, 'supplement_group_not_found', `Supplement group ${req.params.groupName} was not found`);
      }

      const supplements = await getSupplementGroupSupplements(req.user.userId, group.id, { includeInactive: false });
      return assistantSuccess(req, res, normalizeSupplementGroup(group, supplements.map(normalizeSupplement)));
    } catch (error) {
      console.error('Assistant supplement group fetch failed:', error);
      return assistantError(res, 500, 'assistant_supplement_group_failed', 'Failed to fetch supplement group');
    }
  });

  router.post('/supplement-groups', async (req, res) => {
    try {
      const name = normalizeString(req.body && req.body.name);
      const displayName = normalizeString(req.body && req.body.display_name) || name;

      if (!name) {
        return assistantError(res, 400, 'validation_error', 'name is required');
      }

      const existing = await getSupplementGroupByName(req.user.userId, name);
      if (existing) {
        return assistantError(res, 409, 'supplement_group_exists', `Supplement group ${name} already exists`);
      }

      const validatedMembers = await validateGroupSupplementIds(req.user.userId, req.body && req.body.supplement_ids);
      if (validatedMembers.error) {
        return assistantError(
          res,
          validatedMembers.error.status,
          validatedMembers.error.code,
          validatedMembers.error.message,
          validatedMembers.error.details ? { details: validatedMembers.error.details } : {}
        );
      }

      const groupId = uuidv4();
      await dbRun(
        db,
        `INSERT INTO supplement_groups (id, user_id, name, normalized_name, display_name, is_default, is_active, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, 1, CURRENT_TIMESTAMP)`,
        [groupId, req.user.userId, name, name.toLowerCase(), displayName]
      );

      await replaceSupplementGroupMemberships(req.user.userId, groupId, validatedMembers.supplementIds);

      const createdGroup = await getNormalizedSupplementGroupByName(req.user.userId, name);
      return assistantSuccess(req, res, createdGroup, {
        status: 201,
        ids: { group_id: groupId },
        verified: true
      });
    } catch (error) {
      console.error('Assistant supplement group create failed:', error);
      return assistantError(res, 500, 'assistant_create_supplement_group_failed', 'Failed to create supplement group');
    }
  });

  router.put('/supplement-groups/:groupName', async (req, res) => {
    try {
      const currentGroup = await getSupplementGroupByName(req.user.userId, req.params.groupName);
      if (!currentGroup) {
        return assistantError(res, 404, 'supplement_group_not_found', `Supplement group ${req.params.groupName} was not found`);
      }

      const nextName = normalizeString(req.body && req.body.name) || currentGroup.name;
      const nextDisplayName = req.body && Object.prototype.hasOwnProperty.call(req.body, 'display_name')
        ? (normalizeString(req.body.display_name) || nextName)
        : (currentGroup.display_name || currentGroup.name);

      if (nextName.toLowerCase() !== String(currentGroup.normalized_name || currentGroup.name).toLowerCase()) {
        const conflictingGroup = await getSupplementGroupByName(req.user.userId, nextName);
        if (conflictingGroup && conflictingGroup.id !== currentGroup.id) {
          return assistantError(res, 409, 'supplement_group_exists', `Supplement group ${nextName} already exists`);
        }
      }

      const currentSupplements = await getSupplementGroupSupplements(req.user.userId, currentGroup.id, { includeInactive: false });
      const nextSupplementIds = req.body && Object.prototype.hasOwnProperty.call(req.body, 'supplement_ids')
        ? req.body.supplement_ids
        : currentSupplements.map((item) => item.id);
      const validatedMembers = await validateGroupSupplementIds(req.user.userId, nextSupplementIds);
      if (validatedMembers.error) {
        return assistantError(
          res,
          validatedMembers.error.status,
          validatedMembers.error.code,
          validatedMembers.error.message,
          validatedMembers.error.details ? { details: validatedMembers.error.details } : {}
        );
      }

      await dbRun(
        db,
        `UPDATE supplement_groups
         SET name = ?, normalized_name = ?, display_name = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [nextName, nextName.toLowerCase(), nextDisplayName, currentGroup.id, req.user.userId]
      );
      await replaceSupplementGroupMemberships(req.user.userId, currentGroup.id, validatedMembers.supplementIds);

      const updatedGroup = await getNormalizedSupplementGroupByName(req.user.userId, nextName);
      return assistantSuccess(req, res, updatedGroup, {
        ids: { group_id: currentGroup.id },
        verified: true
      });
    } catch (error) {
      console.error('Assistant supplement group update failed:', error);
      return assistantError(res, 500, 'assistant_update_supplement_group_failed', 'Failed to update supplement group');
    }
  });

  router.delete('/supplement-groups/:groupName', async (req, res) => {
    try {
      const group = await getSupplementGroupByName(req.user.userId, req.params.groupName);
      if (!group) {
        return assistantError(res, 404, 'supplement_group_not_found', `Supplement group ${req.params.groupName} was not found`);
      }

      const deletedGroup = await getNormalizedSupplementGroupByName(req.user.userId, req.params.groupName);
      await dbRun(db, 'DELETE FROM supplement_group_memberships WHERE user_id = ? AND group_id = ?', [req.user.userId, group.id]);
      await dbRun(db, 'DELETE FROM supplement_groups WHERE user_id = ? AND id = ?', [req.user.userId, group.id]);

      return assistantSuccess(req, res, {
        deleted_group: deletedGroup,
        deletion_mode: 'hard_delete'
      }, {
        ids: { group_id: group.id },
        verified: true
      });
    } catch (error) {
      console.error('Assistant supplement group delete failed:', error);
      return assistantError(res, 500, 'assistant_delete_supplement_group_failed', 'Failed to delete supplement group');
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

  router.get('/food/search', async (req, res) => {
    const query = normalizeString(req.query.query) || normalizeString(req.query.q);
    const limit = Math.min(parseInteger(req.query.limit) || 8, 20);

    if (!query) {
      return assistantError(res, 400, 'validation_error', 'query is required');
    }

    try {
      const candidates = await searchFoodCandidates(req.user.userId, query, limit);
      return assistantSuccess(req, res, {
        query,
        candidates
      });
    } catch (error) {
      console.error('Assistant food search failed:', error);
      return assistantError(res, 500, 'assistant_food_search_failed', 'Failed to search foods');
    }
  });

  router.get('/food/barcode/:code', async (req, res) => {
    const code = normalizeString(req.params.code);

    if (!code) {
      return assistantError(res, 400, 'validation_error', 'barcode is required');
    }

    try {
      const candidate = await lookupOffBarcode(code);

      if (!candidate) {
        return assistantError(res, 404, 'not_found', 'No product matched the provided barcode', {
          details: { barcode: code }
        });
      }

      return assistantSuccess(req, res, {
        barcode: code,
        candidate
      });
    } catch (error) {
      console.error('Assistant barcode lookup failed:', error);
      return assistantError(res, error.statusCode || 500, 'assistant_food_barcode_failed', 'Failed to resolve barcode');
    }
  });

  router.post('/food/parse-label', async (req, res) => {
    try {
      const parsed = await parseNutritionLabelPayload(req.body || {});
      const warnings = [...(parsed.warnings || [])];

      if ((parsed.confidence !== null && parsed.confidence < 0.75) || parsed.calories_per_100g === null) {
        warnings.push('Label parse confidence is limited. Confirm the extracted nutrition before logging.');
      }

      return assistantSuccess(req, res, {
        parsed_label: {
          ...parsed,
          warnings: undefined
        }
      }, {
        warnings
      });
    } catch (error) {
      console.error('Assistant label parsing failed:', error);
      return assistantError(res, error.statusCode || 500, 'assistant_food_parse_label_failed', error.message || 'Failed to parse nutrition label');
    }
  });

  router.post('/log-food', async (req, res) => {
    const payload = req.body || {};
    const name = normalizeString(payload.name);
    const brand = normalizeString(payload.brand);
    const source = normalizeString(payload.source);
    const foodId = normalizeString(payload.food_id);
    const barcode = normalizeString(payload.barcode);
    const quantityG = parseNumber(payload.quantity_g);
    const mealType = validateMealType(payload.meal_type);
    const loggedAt = normalizeString(payload.logged_at) || new Date().toISOString();

    if (quantityG === null || quantityG <= 0) {
      return assistantError(res, 400, 'validation_error', 'quantity_g must be a positive number');
    }

    const providedCalories = parseNumber(payload.calories);
    const providedProtein = parseNumber(payload.protein);
    const providedCarbs = parseNumber(payload.carbs);
    const providedFat = parseNumber(payload.fat);
    const providedFibre = parseNumber(payload.fibre);
    const resolvedFoodPayload = payload.resolved_food && typeof payload.resolved_food === 'object' ? payload.resolved_food : null;
    const parsedLabelPayload = payload.parsed_label && typeof payload.parsed_label === 'object' ? payload.parsed_label : null;

    try {
      const hasDirectNutrition = providedCalories !== null;
      let finalFood = null;
      let finalName = name;
      let finalBrand = brand;
      let nutritionWarnings = [];

      if (resolvedFoodPayload) {
        finalFood = {
          id: normalizeString(resolvedFoodPayload.id),
          source: normalizeString(resolvedFoodPayload.source) || 'assistant',
          name: normalizeString(resolvedFoodPayload.name),
          brand: normalizeString(resolvedFoodPayload.brand),
          serving_size_g: parseNumber(resolvedFoodPayload.serving_size_g),
          calories_per_100g: parseNumber(resolvedFoodPayload.calories_per_100g),
          protein_per_100g: parseNumber(resolvedFoodPayload.protein_per_100g),
          carbs_per_100g: parseNumber(resolvedFoodPayload.carbs_per_100g),
          fat_per_100g: parseNumber(resolvedFoodPayload.fat_per_100g),
          fibre_per_100g: parseNumber(resolvedFoodPayload.fibre_per_100g)
        };
      } else if (parsedLabelPayload) {
        finalFood = {
          id: null,
          source: 'label-parse',
          name: normalizeString(parsedLabelPayload.name) || name,
          brand: normalizeString(parsedLabelPayload.brand) || brand,
          serving_size_g: parseNumber(parsedLabelPayload.serving_size_g),
          calories_per_100g: parseNumber(parsedLabelPayload.calories_per_100g),
          protein_per_100g: parseNumber(parsedLabelPayload.protein_per_100g),
          carbs_per_100g: parseNumber(parsedLabelPayload.carbs_per_100g),
          fat_per_100g: parseNumber(parsedLabelPayload.fat_per_100g),
          fibre_per_100g: parseNumber(parsedLabelPayload.fibre_per_100g)
        };
        nutritionWarnings = [...(Array.isArray(parsedLabelPayload.warnings) ? parsedLabelPayload.warnings : [])];
      } else if (barcode) {
        finalFood = await lookupOffBarcode(barcode);
        if (!finalFood) {
          return assistantError(res, 404, 'not_found', 'No product matched the provided barcode', {
            details: { barcode }
          });
        }
      } else if (!hasDirectNutrition || foodId) {
        const resolvedFood = await getFoodReference(req.user.userId, foodId, source, name, brand);

        if (resolvedFood && resolvedFood.ambiguous) {
          return assistantError(res, 409, 'ambiguous_food_match', 'Multiple foods match the provided reference', {
            candidates: resolvedFood.candidates
          });
        }

        if (resolvedFood) {
          finalFood = buildFoodCandidate(resolvedFood.row, resolvedFood.source);
        } else if (!hasDirectNutrition && name) {
          const candidates = await searchFoodCandidates(req.user.userId, name, 8);
          if (candidates.length > 1) {
            return assistantError(res, 409, 'ambiguous_food_match', 'Multiple food candidates matched the provided name', {
              candidates
            });
          }
          if (candidates.length === 1) {
            finalFood = candidates[0];
          }
        }
      }

      if (!hasDirectNutrition && !finalFood) {
        return assistantError(res, 400, 'insufficient_food_data', 'Food could not be logged because there was not enough nutrition data and no unique product could be resolved', {
          details: {
            required: ['explicit calories', 'or barcode', 'or resolved_food', 'or parsed_label', 'or a unique search match'],
            supplied_name: name
          }
        });
      }

      finalName = finalFood?.name || finalName;
      finalBrand = finalFood?.brand || finalBrand;

      if (!finalName) {
        return assistantError(res, 400, 'validation_error', 'name is required unless the resolved product includes one');
      }

      const foodLogId = uuidv4();
      const mealId = uuidv4();
      const foodLogRow = {
        id: foodLogId,
        user_id: req.user.userId,
        food_id: finalFood ? finalFood.id : foodId,
        source: finalFood ? finalFood.source : source,
        name: finalName,
        brand: finalBrand,
        quantity_g: quantityG,
        meal_type: mealType,
        calories: providedCalories !== null ? providedCalories : scalePer100(finalFood?.calories_per_100g, quantityG),
        protein: providedProtein !== null ? providedProtein : scalePer100(finalFood?.protein_per_100g, quantityG),
        carbs: providedCarbs !== null ? providedCarbs : scalePer100(finalFood?.carbs_per_100g, quantityG),
        fat: providedFat !== null ? providedFat : scalePer100(finalFood?.fat_per_100g, quantityG),
        fibre: providedFibre !== null ? providedFibre : scalePer100(finalFood?.fibre_per_100g, quantityG),
        logged_at: loggedAt
      };

      if (foodLogRow.calories === null) {
        return assistantError(res, 400, 'insufficient_food_data', 'Resolved food did not include enough nutrition data to log this quantity', {
          details: {
            quantity_g: quantityG,
            source: finalFood?.source || source || null
          }
        });
      }

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
        verified,
        warnings: nutritionWarnings
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

  router.post('/log-supplement-group', async (req, res) => {
    try {
      const takenAt = normalizeString(req.body && req.body.taken_at) || new Date().toISOString();
      const notes = normalizeString(req.body && req.body.notes);
      const resolved = await resolveSupplementBatch(req);

      if (resolved.error) {
        return assistantError(
          res,
          resolved.error.status,
          resolved.error.code,
          resolved.error.message,
          resolved.error.details ? { details: resolved.error.details } : {}
        );
      }

      const results = [...resolved.results];

      for (const supplement of resolved.resolvedRows) {
        const resultIndex = results.findIndex((item) => item.supplement_id === supplement.id);
        const logId = uuidv4();

        try {
          await dbRun(
            db,
            'INSERT INTO supplement_logs (id, supplement_id, user_id, taken_at, notes) VALUES (?, ?, ?, ?, ?)',
            [logId, supplement.id, req.user.userId, takenAt, notes || '']
          );

          const verifiedRow = await getSupplementLogById(req.user.userId, logId);
          if (!verifiedRow) {
            results[resultIndex] = {
              supplement_id: supplement.id,
              supplement_name: supplement.name,
              status: 'failed',
              error: 'Supplement log insert was not verifiable'
            };
            continue;
          }

          results[resultIndex] = {
            supplement_id: supplement.id,
            supplement_name: supplement.name,
            status: 'created',
            supplement_log_id: logId,
            verified: true,
            supplement_log: normalizeSupplementLog(verifiedRow)
          };
        } catch (error) {
          results[resultIndex] = {
            supplement_id: supplement.id,
            supplement_name: supplement.name,
            status: 'failed',
            error: error.message || 'Failed to create supplement log'
          };
        }
      }

      const summary = {
        requested: resolved.requestedIds.length,
        resolved: resolved.resolvedRows.length,
        succeeded: results.filter((item) => item.status === 'created').length,
        failed: results.filter((item) => item.status === 'failed').length
      };
      const verified = summary.failed === 0 && summary.succeeded === resolved.resolvedRows.length;
      const groupName = resolved.group ? resolved.group.name : null;

      return res.status(verified ? 200 : 207).json({
        success: verified,
        warnings: req.assistantWarnings || [],
        verified,
        summary,
        data: {
          group_name: groupName,
          taken_at: takenAt,
          results
        }
      });
    } catch (error) {
      console.error('Assistant supplement group logging failed:', error);
      return assistantError(res, 500, 'assistant_log_supplement_group_failed', 'Failed to log supplement group');
    }
  });

  router.post('/check-supplement-group', async (req, res) => {
    try {
      const date = normalizeString(req.body && req.body.date);
      if (!validateIsoDate(date)) {
        return assistantError(res, 400, 'validation_error', 'date is required in YYYY-MM-DD format');
      }

      const resolved = await resolveSupplementBatch(req, { mode: 'check' });
      if (resolved.error) {
        return assistantError(
          res,
          resolved.error.status,
          resolved.error.code,
          resolved.error.message,
          resolved.error.details ? { details: resolved.error.details } : {}
        );
      }

      const results = [];
      for (const result of resolved.results) {
        if (result.status === 'failed') {
          results.push({
            supplement_id: result.supplement_id,
            supplement_name: result.supplement_name,
            logged: false,
            supplement_log_id: null,
            latest_taken_at: null,
            error: result.error
          });
          continue;
        }

        const verifiedLog = await dbGet(
          db,
          `SELECT id, taken_at
           FROM supplement_logs
           WHERE user_id = ?
             AND supplement_id = ?
             AND date(taken_at) = date(?)
           ORDER BY datetime(taken_at) DESC, rowid DESC
           LIMIT 1`,
          [req.user.userId, result.supplement_id, date]
        );

        results.push({
          supplement_id: result.supplement_id,
          supplement_name: result.supplement_name,
          logged: Boolean(verifiedLog),
          supplement_log_id: verifiedLog ? verifiedLog.id : null,
          latest_taken_at: verifiedLog ? verifiedLog.taken_at : null
        });
      }

      const summary = {
        total: results.length,
        logged: results.filter((item) => item.logged).length,
        missing: results.filter((item) => !item.logged).length
      };

      return assistantSuccess(req, res, {
        group_name: resolved.group ? resolved.group.name : null,
        date,
        summary,
        results
      }, {
        verified: summary.missing === 0
      });
    } catch (error) {
      console.error('Assistant supplement group check failed:', error);
      return assistantError(res, 500, 'assistant_check_supplement_group_failed', 'Failed to check supplement group');
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
    const countPerDose = parseNumber(req.body && (req.body.count_per_dose ?? req.body.dose_amount));
    const countUnit = normalizeString(req.body && (req.body.count_unit ?? req.body.dose_unit));
    const strengthAmount = parseNumber(req.body && req.body.strength_amount);
    const strengthUnit = normalizeString(req.body && req.body.strength_unit);
    const strengthBasis = normalizeString(req.body && req.body.strength_basis);
    const totalDoseAmount = parseNumber(req.body && req.body.total_dose_amount);
    const totalDoseUnit = normalizeString(req.body && req.body.total_dose_unit);
    const legacySupplement = buildLegacySupplementFields({
      dosage: req.body && req.body.dosage,
      count_per_dose: countPerDose,
      count_unit: countUnit,
      strength_amount: strengthAmount,
      strength_unit: strengthUnit,
      total_dose_amount: totalDoseAmount,
      total_dose_unit: totalDoseUnit
    });
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
         (id, user_id, name, brand, dosage, dose_amount, dose_unit, count_per_dose, count_unit, strength_amount, strength_unit, strength_basis, total_dose_amount, total_dose_unit, servings_per_container, frequency, time_of_day, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          supplementId,
          req.user.userId,
          name,
          brand || '',
          legacySupplement.dosage || '',
          legacySupplement.dose_amount,
          legacySupplement.dose_unit || '',
          countPerDose,
          singularSupplementUnit(countUnit) || '',
          strengthAmount,
          strengthUnit || '',
          strengthBasis || '',
          totalDoseAmount,
          totalDoseUnit || '',
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
      const nextCountPerDose = req.body && Object.prototype.hasOwnProperty.call(req.body, 'count_per_dose')
        ? parseNumber(req.body.count_per_dose)
        : parseNumber(current.count_per_dose);
      const nextCountUnit = req.body && Object.prototype.hasOwnProperty.call(req.body, 'count_unit')
        ? (normalizeString(req.body.count_unit) || '')
        : current.count_unit;
      const nextStrengthAmount = req.body && Object.prototype.hasOwnProperty.call(req.body, 'strength_amount')
        ? parseNumber(req.body.strength_amount)
        : parseNumber(current.strength_amount);
      const nextStrengthUnit = req.body && Object.prototype.hasOwnProperty.call(req.body, 'strength_unit')
        ? (normalizeString(req.body.strength_unit) || '')
        : current.strength_unit;
      const nextStrengthBasis = req.body && Object.prototype.hasOwnProperty.call(req.body, 'strength_basis')
        ? (normalizeString(req.body.strength_basis) || '')
        : current.strength_basis;
      const nextTotalDoseAmount = req.body && Object.prototype.hasOwnProperty.call(req.body, 'total_dose_amount')
        ? parseNumber(req.body.total_dose_amount)
        : parseNumber(current.total_dose_amount);
      const nextTotalDoseUnit = req.body && Object.prototype.hasOwnProperty.call(req.body, 'total_dose_unit')
        ? (normalizeString(req.body.total_dose_unit) || '')
        : current.total_dose_unit;
      const legacySupplement = buildLegacySupplementFields({
        dosage: req.body && Object.prototype.hasOwnProperty.call(req.body, 'dosage') ? req.body.dosage : current.dosage,
        count_per_dose: nextCountPerDose,
        count_unit: nextCountUnit,
        strength_amount: nextStrengthAmount,
        strength_unit: nextStrengthUnit,
        total_dose_amount: nextTotalDoseAmount,
        total_dose_unit: nextTotalDoseUnit
      });
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
         SET name = ?, brand = ?, dosage = ?, dose_amount = ?, dose_unit = ?, count_per_dose = ?, count_unit = ?, strength_amount = ?, strength_unit = ?, strength_basis = ?, total_dose_amount = ?, total_dose_unit = ?, servings_per_container = ?, frequency = ?, time_of_day = ?, notes = ?, is_active = ?
         WHERE id = ? AND user_id = ?`,
        [
          name,
          brand || '',
          legacySupplement.dosage || '',
          legacySupplement.dose_amount,
          legacySupplement.dose_unit || '',
          nextCountPerDose,
          singularSupplementUnit(nextCountUnit) || '',
          nextStrengthAmount,
          nextStrengthUnit || '',
          nextStrengthBasis || '',
          nextTotalDoseAmount,
          nextTotalDoseUnit || '',
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

  router.delete('/meals/:id', async (req, res) => {
    try {
      const meal = await getMealById(req.user.userId, req.params.id);
      if (!meal) {
        return assistantError(res, 404, 'not_found', 'Meal not found');
      }

      await dbRun(db, 'DELETE FROM meals WHERE id = ? AND user_id = ?', [req.params.id, req.user.userId]);
      const verified = !(await getMealById(req.user.userId, req.params.id));

      return assistantSuccess(req, res, {
        deleted: normalizeMeal(meal),
        deletion_mode: 'hard_delete'
      }, {
        ids: { meal_id: req.params.id },
        verified
      });
    } catch (error) {
      console.error('Assistant meal delete failed:', error);
      return assistantError(res, 500, 'assistant_delete_meal_failed', 'Failed to delete meal');
    }
  });

  router.delete('/food-logs/:id', async (req, res) => {
    try {
      const foodLog = await getFoodLogById(req.user.userId, req.params.id);
      if (!foodLog) {
        return assistantError(res, 404, 'not_found', 'Food log not found');
      }

      await dbRun(db, 'DELETE FROM food_logs WHERE id = ? AND user_id = ?', [req.params.id, req.user.userId]);
      const verified = !(await getFoodLogById(req.user.userId, req.params.id));

      return assistantSuccess(req, res, {
        deleted: normalizeFoodLog(foodLog),
        deletion_mode: 'hard_delete'
      }, {
        ids: { food_log_id: req.params.id },
        verified
      });
    } catch (error) {
      console.error('Assistant food log delete failed:', error);
      return assistantError(res, 500, 'assistant_delete_food_log_failed', 'Failed to delete food log');
    }
  });

  router.delete('/supplement-logs/:id', async (req, res) => {
    try {
      const supplementLog = await getSupplementLogById(req.user.userId, req.params.id);
      if (!supplementLog) {
        return assistantError(res, 404, 'not_found', 'Supplement log not found');
      }

      await dbRun(db, 'DELETE FROM supplement_logs WHERE id = ? AND user_id = ?', [req.params.id, req.user.userId]);
      const verified = !(await getSupplementLogById(req.user.userId, req.params.id));

      return assistantSuccess(req, res, {
        deleted: normalizeSupplementLog(supplementLog),
        deletion_mode: 'hard_delete'
      }, {
        ids: { supplement_log_id: req.params.id },
        verified
      });
    } catch (error) {
      console.error('Assistant supplement log delete failed:', error);
      return assistantError(res, 500, 'assistant_delete_supplement_log_failed', 'Failed to delete supplement log');
    }
  });

  router.delete('/supplements/:id', async (req, res) => {
    try {
      const supplement = await getSupplementById(req.user.userId, req.params.id);
      if (!supplement) {
        return assistantError(res, 404, 'not_found', 'Supplement not found');
      }

      await dbRun(
        db,
        'UPDATE supplements SET is_active = 0 WHERE id = ? AND user_id = ?',
        [req.params.id, req.user.userId]
      );
      const persisted = await getSupplementById(req.user.userId, req.params.id);

      return assistantSuccess(req, res, {
        deleted: normalizeSupplement(persisted),
        deletion_mode: 'soft_delete'
      }, {
        ids: { supplement_id: req.params.id },
        verified: persisted ? persisted.is_active === 0 : false
      });
    } catch (error) {
      console.error('Assistant supplement delete failed:', error);
      return assistantError(res, 500, 'assistant_delete_supplement_failed', 'Failed to disable supplement');
    }
  });

  router.delete('/peptide-doses/:id', async (req, res) => {
    try {
      const dose = await getPeptideDoseById(req.user.userId, req.params.id);
      if (!dose) {
        return assistantError(res, 404, 'not_found', 'Peptide dose not found');
      }

      await dbRun(db, 'DELETE FROM peptide_doses WHERE id = ? AND user_id = ?', [req.params.id, req.user.userId]);
      const verified = !(await getPeptideDoseById(req.user.userId, req.params.id));

      return assistantSuccess(req, res, {
        deleted: normalizePeptideDose(dose),
        deletion_mode: 'hard_delete'
      }, {
        ids: { dose_id: req.params.id },
        verified
      });
    } catch (error) {
      console.error('Assistant peptide dose delete failed:', error);
      return assistantError(res, 500, 'assistant_delete_peptide_dose_failed', 'Failed to delete peptide dose');
    }
  });

  router.delete('/peptide-configs/:id', async (req, res) => {
    try {
      const current = await getPeptideConfigById(req.user.userId, req.params.id);
      if (!current) {
        return assistantError(res, 404, 'not_found', 'Peptide configuration not found');
      }

      const now = new Date().toISOString();
      await dbRun(
        db,
        'UPDATE user_peptide_configs SET is_active = 0, updated_at = ? WHERE id = ? AND user_id = ?',
        [now, req.params.id, req.user.userId]
      );
      const persisted = await getPeptideConfigById(req.user.userId, req.params.id);

      return assistantSuccess(req, res, {
        deleted: normalizePeptideConfig(persisted),
        deletion_mode: 'soft_delete'
      }, {
        ids: { config_id: req.params.id },
        verified: persisted ? persisted.is_active === 0 : false
      });
    } catch (error) {
      console.error('Assistant peptide config delete failed:', error);
      return assistantError(res, 500, 'assistant_delete_peptide_config_failed', 'Failed to disable peptide configuration');
    }
  });

  router.delete('/blood-results/:id', async (req, res) => {
    try {
      const bloodResult = await getBloodResultById(req.user.userId, req.params.id);
      if (!bloodResult) {
        return assistantError(res, 404, 'not_found', 'Blood result not found');
      }

      await dbRun(db, 'DELETE FROM blood_results WHERE id = ? AND user_id = ?', [req.params.id, req.user.userId]);
      const verified = !(await getBloodResultById(req.user.userId, req.params.id));

      return assistantSuccess(req, res, {
        deleted: normalizeBloodResult(bloodResult),
        deletion_mode: 'hard_delete'
      }, {
        ids: { blood_result_id: req.params.id },
        verified
      });
    } catch (error) {
      console.error('Assistant blood result delete failed:', error);
      return assistantError(res, 500, 'assistant_delete_blood_result_failed', 'Failed to delete blood result');
    }
  });

  return router;
};
