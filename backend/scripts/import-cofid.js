const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

const defaultDbCandidates = [
  path.join(__dirname, '..', '..', 'data', 'peptifit.sqlite'),
  path.join(__dirname, '..', 'data', 'peptifit.sqlite')
];

function printUsage() {
  console.log('Usage: npm run import:cofid -- <path-to-cofid.json|csv> [--append] [--db <path-to-sqlite>]');
}

function resolveDbPath(args) {
  const dbIndex = args.indexOf('--db');

  if (dbIndex !== -1 && args[dbIndex + 1]) {
    return path.resolve(process.cwd(), args[dbIndex + 1]);
  }

  return defaultDbCandidates.find((candidate) => fs.existsSync(candidate)) || defaultDbCandidates[0];
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const normalized = String(value).trim().replace(/,/g, '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstDefined(record, aliases) {
  for (const alias of aliases) {
    const value = record[alias];

    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }

  return null;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function parseCsv(content) {
  const rows = [];
  let current = '';
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }

      row.push(current);
      if (row.some((value) => String(value).trim() !== '')) {
        rows.push(row);
      }
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  row.push(current);
  if (row.some((value) => String(value).trim() !== '')) {
    rows.push(row);
  }

  if (!rows.length) {
    return [];
  }

  const headers = rows[0].map((header) => String(header || '').trim());
  return rows.slice(1).map((values) => {
    const record = {};

    headers.forEach((header, index) => {
      record[header] = values[index] !== undefined ? String(values[index]).trim() : '';
    });

    return record;
  });
}

function loadRecords(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.json') {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : parsed?.foods || [];
  }

  if (extension === '.csv') {
    return parseCsv(content);
  }

  throw new Error(`Unsupported file format: ${extension || 'unknown'}`);
}

function normalizeRecord(record, index) {
  const name = String(firstDefined(record, ['name', 'food_name', 'Food Name', 'description']) || '').trim();

  if (!name) {
    return null;
  }

  const code = firstDefined(record, ['code', 'food_code', 'Food Code', 'cofid_code', 'cofid_id']);
  const category = firstDefined(record, ['category', 'food_group', 'group', 'Group', 'section']);
  const stableId = code
    ? `cofid:${String(code).trim()}`
    : `cofid:${slugify(name)}:${index + 1}`;

  return {
    id: stableId,
    code: code ? String(code).trim() : null,
    name,
    category: category ? String(category).trim() : null,
    serving_size_g: parseNumber(firstDefined(record, ['serving_size_g', 'serving_g', 'portion_g'])),
    calories_per_100g: parseNumber(firstDefined(record, ['calories_per_100g', 'energy_kcal_per_100g', 'energy_kcal', 'kcal', 'Energy (kcal) (kcal)'])),
    protein_per_100g: parseNumber(firstDefined(record, ['protein_per_100g', 'protein_g', 'protein', 'Protein (g)'])),
    carbs_per_100g: parseNumber(firstDefined(record, ['carbs_per_100g', 'carbohydrate_per_100g', 'carbohydrate_g', 'carbohydrate', 'carbs', 'Carbohydrate (g)'])),
    fat_per_100g: parseNumber(firstDefined(record, ['fat_per_100g', 'fat_g', 'fat', 'Fat (g)'])),
    fibre_per_100g: parseNumber(firstDefined(record, ['fibre_per_100g', 'fiber_per_100g', 'fibre_g', 'fiber_g', 'fibre', 'fiber', 'AOAC fibre (g)', 'NSP (g)']))
  };
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve(this);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const append = args.includes('--append');
  const dbPath = resolveDbPath(args);
  const positionalArgs = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--append') {
      continue;
    }

    if (arg === '--db') {
      index += 1;
      continue;
    }

    if (!arg.startsWith('--')) {
      positionalArgs.push(arg);
    }
  }

  const inputPath = positionalArgs[0];

  if (!inputPath) {
    printUsage();
    process.exit(1);
  }

  const resolvedInputPath = path.resolve(process.cwd(), inputPath);
  const rawRecords = loadRecords(resolvedInputPath);
  const foods = rawRecords.map(normalizeRecord).filter(Boolean);

  if (!foods.length) {
    throw new Error('No importable CoFID rows found.');
  }

  const db = new sqlite3.Database(dbPath);

  await run(
    db,
    `CREATE TABLE IF NOT EXISTS cofid_foods (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE,
      name TEXT NOT NULL,
      category TEXT,
      serving_size_g REAL,
      calories_per_100g REAL,
      protein_per_100g REAL,
      carbs_per_100g REAL,
      fat_per_100g REAL,
      fibre_per_100g REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );

  if (!append) {
    await run(db, 'DELETE FROM cofid_foods');
  }

  await run(db, 'BEGIN TRANSACTION');

  try {
    for (const food of foods) {
      await run(
        db,
        `INSERT INTO cofid_foods (
          id, code, name, category, serving_size_g, calories_per_100g,
          protein_per_100g, carbs_per_100g, fat_per_100g, fibre_per_100g, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          code = excluded.code,
          name = excluded.name,
          category = excluded.category,
          serving_size_g = excluded.serving_size_g,
          calories_per_100g = excluded.calories_per_100g,
          protein_per_100g = excluded.protein_per_100g,
          carbs_per_100g = excluded.carbs_per_100g,
          fat_per_100g = excluded.fat_per_100g,
          fibre_per_100g = excluded.fibre_per_100g,
          updated_at = CURRENT_TIMESTAMP`,
        [
          food.id || crypto.randomUUID(),
          food.code,
          food.name,
          food.category,
          food.serving_size_g,
          food.calories_per_100g,
          food.protein_per_100g,
          food.carbs_per_100g,
          food.fat_per_100g,
          food.fibre_per_100g
        ]
      );
    }

    await run(db, 'COMMIT');
  } catch (error) {
    await run(db, 'ROLLBACK');
    throw error;
  } finally {
    db.close();
  }

  console.log(`Imported ${foods.length} CoFID foods from ${resolvedInputPath}`);
  console.log(`Database: ${dbPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
