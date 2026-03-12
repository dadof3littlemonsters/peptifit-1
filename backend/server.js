const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const path = require('path');
const { spawn } = require('child_process');
const createFoodRouter = require('./routes/food');
const createAiRouter = require('./routes/ai');
const createAssistantRouter = require('./routes/assistant');

const OPEN_FOOD_FACTS_USER_AGENT = 'PeptiFit/1.0 (https://peptifit.trotters-stuff.uk)';
const DEFAULT_ACCOUNT_SETTINGS = {
  weight_unit: 'kg',
  glucose_unit: 'mg/dL',
  temp_unit: 'C',
  height_unit: 'cm',
  height_cm: '',
  height_ft: '',
  height_in: '',
  target_weight: '',
  calorie_goal: 2500,
  protein_goal: '',
  adherence_goal: 80
};

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'peptifit-secret-key-change-in-production';
const COFID_REFRESH_KEY = process.env.COFID_REFRESH_KEY || 'peptifit-cofid-refresh-key-change-in-production';
const COFID_REFRESH_CRON = process.env.COFID_REFRESH_CRON || '';
let cofidRefreshInProgress = false;
const PRACTICAL_COUNT_UNITS = new Set(['tablet', 'tablets', 'capsule', 'capsules', 'softgel', 'softgels', 'ml', 'scoop', 'scoops', 'drop', 'drops', 'serving', 'servings']);
const STRENGTH_UNITS = new Set(['mg', 'mcg', 'g', 'kg', 'iu', 'µg']);
const DEFAULT_SUPPLEMENT_GROUP_DEFINITIONS = [
  {
    name: 'morning',
    displayName: 'Morning',
    supplementNames: [
      'Ashwagandha KSM-66',
      'Citrus Bergamot 1200mg',
      "Pyridoxal 5 Phosphate 'P-5-P' 50mg (Vitamin B6)",
      'Tongkat Ali',
      'Vitamin D3',
      'Vitamin E',
      'Omega 3 Fish Oil',
      'Tadalafil 10mg'
    ]
  },
  {
    name: 'evening',
    displayName: 'Evening',
    supplementNames: [
      'Boron 10mg',
      'Iron Bisglycinate with Vitamin C',
      'Omega 3 Fish Oil'
    ]
  },
  {
    name: 'bedtime',
    displayName: 'Bedtime',
    supplementNames: [
      'Magnesium Glycinate 3-in-1 1800mg',
      'Zinc Picolinate 22mg',
      'Niacin (Flush)'
    ]
  }
];

function normalizeGroupKey(value) {
  return String(value || '').trim().toLowerCase();
}

function seedDefaultSupplementGroups(database) {
  database.all('SELECT id FROM users ORDER BY created_at ASC', (userErr, users) => {
    if (userErr) {
      console.error('Error loading users for supplement group seeding:', userErr);
      return;
    }

    (users || []).forEach((user) => {
      database.get('SELECT COUNT(*) AS count FROM supplements WHERE user_id = ? AND is_active = 1', [user.id], (supplementCountErr, supplementCountRow) => {
        if (supplementCountErr) {
          console.error(`Error checking active supplements for user ${user.id}:`, supplementCountErr);
          return;
        }

        if (!supplementCountRow || Number(supplementCountRow.count) === 0) {
          return;
        }

        database.get('SELECT COUNT(*) AS count FROM supplement_groups WHERE user_id = ?', [user.id], (countErr, countRow) => {
        if (countErr) {
          console.error(`Error checking supplement groups for user ${user.id}:`, countErr);
          return;
        }

        if ((countRow && Number(countRow.count)) > 0) {
          return;
        }

        DEFAULT_SUPPLEMENT_GROUP_DEFINITIONS.forEach((groupDefinition) => {
          const groupId = uuidv4();

          database.run(
            `INSERT INTO supplement_groups (id, user_id, name, normalized_name, display_name, is_default)
             VALUES (?, ?, ?, ?, ?, 1)`,
            [groupId, user.id, groupDefinition.name, normalizeGroupKey(groupDefinition.name), groupDefinition.displayName],
            (insertGroupErr) => {
              if (insertGroupErr) {
                console.error(`Error creating supplement group ${groupDefinition.name}:`, insertGroupErr);
                return;
              }

              groupDefinition.supplementNames.forEach((supplementName, index) => {
                database.get(
                  `SELECT id
                   FROM supplements
                   WHERE user_id = ?
                     AND is_active = 1
                     AND lower(trim(name)) = lower(trim(?))
                   ORDER BY created_at DESC
                   LIMIT 1`,
                  [user.id, supplementName],
                  (supplementErr, supplementRow) => {
                    if (supplementErr) {
                      console.error(`Error resolving supplement ${supplementName} for group ${groupDefinition.name}:`, supplementErr);
                      return;
                    }

                    if (!supplementRow) {
                      return;
                    }

                    database.run(
                      `INSERT INTO supplement_group_memberships (id, group_id, supplement_id, user_id, position)
                       VALUES (?, ?, ?, ?, ?)`,
                      [uuidv4(), groupId, supplementRow.id, user.id, index]
                    );
                  }
                );
              });
            }
          );
        });
        });
      });
    });
  });
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));

// Database setup
const dbPath = path.join(__dirname, 'data', 'peptifit.sqlite');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Peptides library table
  db.run(`CREATE TABLE IF NOT EXISTS peptides (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    dosage_range TEXT,
    frequency TEXT,
    administration_route TEXT,
    storage_requirements TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // User peptide doses table
  db.run(`CREATE TABLE IF NOT EXISTS peptide_doses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    peptide_id TEXT NOT NULL,
    config_id TEXT,
    dose_amount REAL NOT NULL,
    dose_unit TEXT NOT NULL,
    administration_time DATETIME NOT NULL,
    injection_site TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (peptide_id) REFERENCES peptides (id)
  )`);

  // Peptide schedules table
  db.run(`CREATE TABLE IF NOT EXISTS peptide_schedules (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    peptide_id TEXT NOT NULL,
    dose_amount REAL NOT NULL,
    dose_unit TEXT NOT NULL,
    frequency TEXT NOT NULL,
    days_of_week TEXT,
    time_of_day TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (peptide_id) REFERENCES peptides (id)
  )`);

  // User peptide configurations table
  db.run(`CREATE TABLE IF NOT EXISTS user_peptide_configs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    peptide_id TEXT NOT NULL,
    frequency TEXT NOT NULL,
    doses TEXT,
    cycle_config TEXT,
    custom_days TEXT,
    every_x_days INTEGER,
    notes TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (peptide_id) REFERENCES peptides (id)
  )`);

  // Vitals table
  db.run(`CREATE TABLE IF NOT EXISTS vitals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    vital_type TEXT NOT NULL,
    value TEXT NOT NULL,
    unit TEXT,
    notes TEXT,
    measured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Supplements table
  db.run(`CREATE TABLE IF NOT EXISTS supplements (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    brand TEXT,
    dosage TEXT,
    dose_amount REAL,
    dose_unit TEXT,
    servings_per_container INTEGER,
    frequency TEXT,
    time_of_day TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Supplement logs table
  db.run(`CREATE TABLE IF NOT EXISTS supplement_logs (
    id TEXT PRIMARY KEY,
    supplement_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    taken_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    FOREIGN KEY (supplement_id) REFERENCES supplements (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS supplement_groups (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    display_name TEXT,
    is_default BOOLEAN DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS supplement_group_memberships (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    supplement_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES supplement_groups (id),
    FOREIGN KEY (supplement_id) REFERENCES supplements (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_supplement_groups_user_name ON supplement_groups(user_id, normalized_name)');
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_supplement_group_memberships_group_supplement ON supplement_group_memberships(group_id, supplement_id)');

  // Meals table
  db.run(`CREATE TABLE IF NOT EXISTS meals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    meal_type TEXT NOT NULL,
    food_name TEXT NOT NULL,
    calories INTEGER DEFAULT 0,
    protein REAL DEFAULT 0,
    carbs REAL DEFAULT 0,
    fat REAL DEFAULT 0,
    logged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS food_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    food_id TEXT,
    source TEXT,
    name TEXT NOT NULL,
    brand TEXT,
    quantity_g REAL NOT NULL,
    meal_type TEXT DEFAULT 'snack',
    calories REAL,
    protein REAL,
    carbs REAL,
    fat REAL,
    fibre REAL,
    logged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS scanned_foods (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    source TEXT,
    name TEXT NOT NULL,
    brand TEXT,
    calories_per_100g REAL,
    protein_per_100g REAL,
    carbs_per_100g REAL,
    fat_per_100g REAL,
    fibre_per_100g REAL,
    serving_size_g REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS cofid_foods (
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
  )`);

  db.run('CREATE INDEX IF NOT EXISTS idx_cofid_foods_name ON cofid_foods(name)');
  db.run('CREATE INDEX IF NOT EXISTS idx_cofid_foods_category ON cofid_foods(category)');

  // Blood results table
  db.run(`CREATE TABLE IF NOT EXISTS blood_results (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    test_date DATE NOT NULL,
    lab_name TEXT,
    markers TEXT,
    notes TEXT,
    analysis TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  seedDefaultSupplementGroups(db);

  // Insert complete peptide library
  const defaultPeptides = [
    {
      id: uuidv4(),
      name: 'Tirzepatide',
      description: 'GLP-1/GIP receptor agonist for weight management',
      dosage_range: '2.5mg - 15mg weekly',
      frequency: 'Weekly',
      administration_route: 'Subcutaneous injection',
      storage_requirements: 'Refrigerate 2-8°C'
    },
    {
      id: uuidv4(),
      name: 'Retatrutide',
      description: 'Triple hormone receptor agonist (GLP-1/GIP/Glucagon)',
      dosage_range: '1mg - 12mg weekly',
      frequency: 'Weekly',
      administration_route: 'Subcutaneous injection',
      storage_requirements: 'Refrigerate 2-8°C'
    },
    {
      id: uuidv4(),
      name: 'ARA-290',
      description: 'Erythropoietin derivative for tissue protection',
      dosage_range: '2mg - 8mg',
      frequency: '2-3 times per week',
      administration_route: 'Subcutaneous injection',
      storage_requirements: 'Refrigerate 2-8°C'
    },
    {
      id: uuidv4(),
      name: 'KPV',
      description: 'Anti-inflammatory tripeptide',
      dosage_range: '200mcg - 500mcg',
      frequency: 'Daily or as needed',
      administration_route: 'Subcutaneous injection or topical',
      storage_requirements: 'Refrigerate 2-8°C'
    },
    {
      id: uuidv4(),
      name: 'GLOW 70',
      description: 'Combination: BPC-157 10mg, TB4 10mg, GHK-CU 50mg',
      dosage_range: '0.5ml - 1ml per dose',
      frequency: 'Daily or every other day',
      administration_route: 'Subcutaneous injection',
      storage_requirements: 'Refrigerate 2-8°C, use within 30 days of reconstitution'
    },
    {
      id: uuidv4(),
      name: 'Selank',
      description: 'Anxiolytic and cognitive enhancing peptide',
      dosage_range: '150mcg - 300mcg',
      frequency: 'Daily',
      administration_route: 'Nasal spray or subcutaneous injection',
      storage_requirements: 'Refrigerate 2-8°C'
    },
    {
      id: uuidv4(),
      name: 'Semax',
      description: 'Nootropic peptide for cognitive enhancement',
      dosage_range: '200mcg - 600mcg',
      frequency: 'Daily',
      administration_route: 'Nasal spray or subcutaneous injection',
      storage_requirements: 'Refrigerate 2-8°C'
    },
    {
      id: uuidv4(),
      name: 'HGH',
      description: 'Human Growth Hormone',
      dosage_range: '2IU - 4IU',
      frequency: 'Daily',
      administration_route: 'Subcutaneous injection',
      storage_requirements: 'Refrigerate 2-8°C, use within 14 days of reconstitution'
    },
    {
      id: uuidv4(),
      name: 'Thymosin Alpha 1 (TA1)',
      description: 'Immune system modulator',
      dosage_range: '1.6mg - 3.2mg',
      frequency: '2-3 times per week',
      administration_route: 'Subcutaneous injection',
      storage_requirements: 'Refrigerate 2-8°C'
    },
    {
      id: uuidv4(),
      name: 'NAD+',
      description: 'Nicotinamide Adenine Dinucleotide for cellular energy',
      dosage_range: '100mg - 500mg',
      frequency: '2-3 times per week',
      administration_route: 'Subcutaneous injection or IV',
      storage_requirements: 'Refrigerate 2-8°C'
    },
    {
      id: uuidv4(),
      name: 'MOTS-C',
      description: 'Mitochondrial-derived peptide for metabolic enhancement',
      dosage_range: '5mg - 20mg',
      frequency: '2-3 times per week',
      administration_route: 'Subcutaneous injection',
      storage_requirements: 'Refrigerate 2-8°C'
    }
  ];

  // Check if peptides already exist
  db.get("SELECT COUNT(*) as count FROM peptides", (err, row) => {
    if (err) {
      console.error('Error checking peptides:', err);
      return;
    }
    
    if (row.count === 0) {
      const stmt = db.prepare(`INSERT INTO peptides (id, name, description, dosage_range, frequency, administration_route, storage_requirements) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      defaultPeptides.forEach(peptide => {
        stmt.run(peptide.id, peptide.name, peptide.description, peptide.dosage_range, peptide.frequency, peptide.administration_route, peptide.storage_requirements);
      });
      stmt.finalize();
      console.log('Complete peptide library inserted');
    }
  });

  db.all(`PRAGMA table_info(peptide_doses)`, (err, columns) => {
    if (err) {
      console.error('Error inspecting peptide_doses schema:', err);
      return;
    }

    if (!columns.some((column) => column.name === 'config_id')) {
      db.run(`ALTER TABLE peptide_doses ADD COLUMN config_id TEXT`, (alterErr) => {
        if (alterErr) {
          console.error('Error adding config_id to peptide_doses:', alterErr);
        }
      });
    }
  });

  db.all(`PRAGMA table_info(supplements)`, (err, columns) => {
    if (err) {
      console.error('Error inspecting supplements schema:', err);
      return;
    }

    const requiredColumns = [
      ['brand', 'TEXT'],
      ['dose_amount', 'REAL'],
      ['dose_unit', 'TEXT'],
      ['servings_per_container', 'INTEGER'],
      ['count_per_dose', 'REAL'],
      ['count_unit', 'TEXT'],
      ['strength_amount', 'REAL'],
      ['strength_unit', 'TEXT'],
      ['strength_basis', 'TEXT'],
      ['total_dose_amount', 'REAL'],
      ['total_dose_unit', 'TEXT']
    ];

    const missingColumns = requiredColumns.filter(([columnName]) => !columns.some((column) => column.name === columnName));
    let pendingColumns = missingColumns.length;

    const maybeBackfillSupplements = () => {
      if (pendingColumns > 0) {
        return;
      }

      db.all(
        `SELECT id, name, dosage, dose_amount, dose_unit, notes, count_per_dose, count_unit, strength_amount, strength_unit, strength_basis, total_dose_amount, total_dose_unit
         FROM supplements`,
        (selectErr, supplementRows) => {
          if (selectErr) {
            console.error('Error loading supplements for schema backfill:', selectErr);
            return;
          }

          supplementRows.forEach((row) => {
            const inferred = inferSupplementSchemaFromLegacy(row);
            const needsBackfill = (
              row.count_per_dose === null ||
              row.count_unit === null ||
              row.strength_amount === null ||
              row.total_dose_amount === null
            );

            if (!needsBackfill) {
              return;
            }

            db.run(
              `UPDATE supplements
               SET count_per_dose = COALESCE(count_per_dose, ?),
                   count_unit = COALESCE(NULLIF(count_unit, ''), ?),
                   strength_amount = COALESCE(strength_amount, ?),
                   strength_unit = COALESCE(NULLIF(strength_unit, ''), ?),
                   strength_basis = COALESCE(NULLIF(strength_basis, ''), ?),
                   total_dose_amount = COALESCE(total_dose_amount, ?),
                   total_dose_unit = COALESCE(NULLIF(total_dose_unit, ''), ?)
               WHERE id = ?`,
              [
                inferred.count_per_dose,
                inferred.count_unit || null,
                inferred.strength_amount,
                inferred.strength_unit || null,
                inferred.strength_basis || null,
                inferred.total_dose_amount,
                inferred.total_dose_unit || null,
                row.id
              ],
              (updateErr) => {
                if (updateErr) {
                  console.error(`Error backfilling supplement schema for ${row.id}:`, updateErr);
                }
              }
            );
          });
        }
      );
    };

    if (missingColumns.length === 0) {
      maybeBackfillSupplements();
      return;
    }

    missingColumns.forEach(([columnName, columnType]) => {
      db.run(`ALTER TABLE supplements ADD COLUMN ${columnName} ${columnType}`, (alterErr) => {
        if (alterErr) {
          console.error(`Error adding ${columnName} to supplements:`, alterErr);
        }
        pendingColumns -= 1;
        maybeBackfillSupplements();
      });
    });
  });

  db.all(`PRAGMA table_info(users)`, (err, columns) => {
    if (err) {
      console.error('Error inspecting users schema:', err);
      return;
    }

    if (!columns.some((column) => column.name === 'settings_json')) {
      db.run(`ALTER TABLE users ADD COLUMN settings_json TEXT`, (alterErr) => {
        if (alterErr) {
          console.error('Error adding settings_json to users:', alterErr);
        }
      });
    }
  });
});

const toOptionalString = (value, maxLength = 32) => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim().slice(0, maxLength);
};

const toPositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toPercent = (value, fallback) => {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(100, Math.max(1, parsed));
};

function normalizeAccountSettings(input = {}) {
  const data = input && typeof input === 'object' ? input : {};

  const weightUnits = new Set(['kg', 'lbs', 'st']);
  const glucoseUnits = new Set(['mg/dL', 'mmol/L']);
  const tempUnits = new Set(['C', 'F']);
  const heightUnits = new Set(['cm', 'ft']);

  return {
    weight_unit: weightUnits.has(data.weight_unit) ? data.weight_unit : DEFAULT_ACCOUNT_SETTINGS.weight_unit,
    glucose_unit: glucoseUnits.has(data.glucose_unit) ? data.glucose_unit : DEFAULT_ACCOUNT_SETTINGS.glucose_unit,
    temp_unit: tempUnits.has(data.temp_unit) ? data.temp_unit : DEFAULT_ACCOUNT_SETTINGS.temp_unit,
    height_unit: heightUnits.has(data.height_unit) ? data.height_unit : DEFAULT_ACCOUNT_SETTINGS.height_unit,
    height_cm: toOptionalString(data.height_cm, 16),
    height_ft: toOptionalString(data.height_ft, 8),
    height_in: toOptionalString(data.height_in, 8),
    target_weight: toOptionalString(data.target_weight, 16),
    calorie_goal: toPositiveInt(data.calorie_goal, DEFAULT_ACCOUNT_SETTINGS.calorie_goal),
    protein_goal: toOptionalString(data.protein_goal, 16),
    adherence_goal: toPercent(data.adherence_goal, DEFAULT_ACCOUNT_SETTINGS.adherence_goal)
  };
}

function parseStoredSettings(settingsJson) {
  if (!settingsJson) {
    return { ...DEFAULT_ACCOUNT_SETTINGS };
  }

  try {
    return normalizeAccountSettings(JSON.parse(settingsJson));
  } catch (error) {
    return { ...DEFAULT_ACCOUNT_SETTINGS };
  }
}

function normalizeSupplementCountUnit(unit) {
  const normalized = String(unit || '').trim().toLowerCase();

  if (!normalized) {
    return '';
  }

  if (normalized.endsWith('s') && PRACTICAL_COUNT_UNITS.has(normalized.slice(0, -1))) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function formatCountUnit(count, unit) {
  const normalizedUnit = normalizeSupplementCountUnit(unit);

  if (!normalizedUnit) {
    return '';
  }

  if (count === null || count === undefined || count === '') {
    return normalizedUnit;
  }

  return Number(count) === 1 ? normalizedUnit : `${normalizedUnit}s`;
}

function formatNumberCompact(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }

  return Number.isInteger(numeric) ? String(numeric) : String(Number(numeric.toFixed(2)));
}

function parseAmountUnitPair(text) {
  const match = String(text || '').trim().match(/(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g|iu|ml)\b/i);

  if (!match) {
    return null;
  }

  return {
    amount: Number(match[1]),
    unit: match[2]
  };
}

function inferSupplementSchemaFromLegacy(row = {}) {
  const inferred = {
    count_per_dose: null,
    count_unit: '',
    strength_amount: null,
    strength_unit: '',
    strength_basis: '',
    total_dose_amount: null,
    total_dose_unit: ''
  };

  const legacyAmount = row.dose_amount === null || row.dose_amount === undefined || row.dose_amount === ''
    ? null
    : Number(row.dose_amount);
  const legacyUnit = String(row.dose_unit || '').trim().toLowerCase();
  const dosageText = String(row.dosage || '').trim();
  const noteText = String(row.notes || '').trim();
  const nameText = String(row.name || '').trim();

  const nameStrength = parseAmountUnitPair(nameText);
  const dosageStrength = parseAmountUnitPair(dosageText);
  const noteEachStrength = noteText.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g|iu|ml)\s*(?:each|per\s+(tablet|capsule|softgel|ml|scoop|serving))/i);
  const practicalCountFromDosage = dosageText.match(/(\d+(?:\.\d+)?)\s*(tablet|tablets|capsule|capsules|softgel|softgels|ml|scoop|scoops|drop|drops|serving|servings)\b/i);
  const practicalCountFromNotes = noteText.match(/take\s+(\d+(?:\.\d+)?)\s*(tablet|tablets|capsule|capsules|softgel|softgels|ml|scoop|scoops|drop|drops|serving|servings)\b/i);
  const noteDailyTotal = noteText.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g|iu|ml)\s+total/i);
  const noteDailyDose = noteText.match(/daily dose:\s*(\d+(?:\.\d+)?)\s*(tablet|tablets|capsule|capsules|softgel|softgels|ml|scoop|scoops|drop|drops|serving|servings)\b/i);
  const practicalUnitFromNotes = noteText.match(/\b(tablet|tablets|capsule|capsules|softgel|softgels|ml|scoop|scoops|drop|drops|serving|servings)\b/i)
    || nameText.match(/\b(tablet|tablets|capsule|capsules|softgel|softgels|ml|scoop|scoops|drop|drops|serving|servings)\b/i);

  if (legacyAmount !== null && PRACTICAL_COUNT_UNITS.has(legacyUnit)) {
    inferred.count_per_dose = legacyAmount;
    inferred.count_unit = normalizeSupplementCountUnit(legacyUnit);
  }

  if (practicalCountFromDosage && inferred.count_per_dose === null) {
    inferred.count_per_dose = Number(practicalCountFromDosage[1]);
    inferred.count_unit = normalizeSupplementCountUnit(practicalCountFromDosage[2]);
  }

  if (practicalCountFromNotes && inferred.count_per_dose === null) {
    inferred.count_per_dose = Number(practicalCountFromNotes[1]);
    inferred.count_unit = normalizeSupplementCountUnit(practicalCountFromNotes[2]);
  }

  if (noteDailyDose && inferred.count_per_dose === null) {
    inferred.count_per_dose = Number(noteDailyDose[1]);
    inferred.count_unit = normalizeSupplementCountUnit(noteDailyDose[2]);
  }

  if (inferred.count_per_dose === null && practicalUnitFromNotes) {
    inferred.count_per_dose = 1;
    inferred.count_unit = normalizeSupplementCountUnit(practicalUnitFromNotes[1]);
  }

  if (legacyAmount !== null && STRENGTH_UNITS.has(legacyUnit)) {
    inferred.strength_amount = legacyAmount;
    inferred.strength_unit = legacyUnit;
  }

  if (!inferred.strength_amount && noteEachStrength) {
    inferred.strength_amount = Number(noteEachStrength[1]);
    inferred.strength_unit = noteEachStrength[2];
    inferred.strength_basis = noteEachStrength[3] ? `per ${normalizeSupplementCountUnit(noteEachStrength[3])}` : '';
  }

  if (!inferred.strength_amount && inferred.count_per_dose !== null && dosageStrength) {
    inferred.strength_amount = dosageStrength.amount;
    inferred.strength_unit = dosageStrength.unit;
  }

  if (!inferred.strength_amount && inferred.count_per_dose !== null && nameStrength) {
    inferred.strength_amount = nameStrength.amount;
    inferred.strength_unit = nameStrength.unit;
  }

  if (inferred.strength_amount && !inferred.strength_basis && inferred.count_unit) {
    inferred.strength_basis = `per ${inferred.count_unit}`;
  } else if (inferred.strength_amount && !inferred.strength_basis) {
    inferred.strength_basis = 'per serving';
  }

  if (inferred.count_per_dose === null && inferred.strength_amount) {
    inferred.count_per_dose = 1;
    inferred.count_unit = inferred.count_unit || 'serving';
  }

  if (noteDailyTotal) {
    inferred.total_dose_amount = Number(noteDailyTotal[1]);
    inferred.total_dose_unit = noteDailyTotal[2];
  } else if (dosageStrength && inferred.count_per_dose !== null && (!inferred.strength_amount || inferred.count_per_dose > 1)) {
    inferred.total_dose_amount = dosageStrength.amount;
    inferred.total_dose_unit = dosageStrength.unit;
  } else if (inferred.strength_amount && inferred.count_per_dose !== null) {
    inferred.total_dose_amount = Number((inferred.strength_amount * inferred.count_per_dose).toFixed(2));
    inferred.total_dose_unit = inferred.strength_unit;
  } else if (legacyAmount !== null && STRENGTH_UNITS.has(legacyUnit)) {
    inferred.total_dose_amount = legacyAmount;
    inferred.total_dose_unit = legacyUnit;
  } else if (nameStrength && inferred.count_per_dose !== null && inferred.count_per_dose === 1) {
    inferred.total_dose_amount = nameStrength.amount;
    inferred.total_dose_unit = nameStrength.unit;
  }

  if (!inferred.total_dose_amount && nameStrength && inferred.count_per_dose === null) {
    inferred.total_dose_amount = nameStrength.amount;
    inferred.total_dose_unit = nameStrength.unit;
  }

  return inferred;
}

function buildLegacySupplementFields(data = {}) {
  const countPerDose = data.count_per_dose === null || data.count_per_dose === undefined || data.count_per_dose === ''
    ? null
    : Number(data.count_per_dose);
  const countUnit = normalizeSupplementCountUnit(data.count_unit);
  const strengthAmount = data.strength_amount === null || data.strength_amount === undefined || data.strength_amount === ''
    ? null
    : Number(data.strength_amount);
  const strengthUnit = String(data.strength_unit || '').trim();
  const totalDoseAmount = data.total_dose_amount === null || data.total_dose_amount === undefined || data.total_dose_amount === ''
    ? null
    : Number(data.total_dose_amount);
  const totalDoseUnit = String(data.total_dose_unit || '').trim();
  const dosage = data.dosage || (
    totalDoseAmount !== null && totalDoseUnit
      ? `${formatNumberCompact(totalDoseAmount)} ${totalDoseUnit}`
      : strengthAmount !== null && strengthUnit
        ? `${formatNumberCompact(strengthAmount)} ${strengthUnit}`
        : countPerDose !== null && countUnit
          ? `${formatNumberCompact(countPerDose)} ${formatCountUnit(countPerDose, countUnit)}`
          : ''
  );

  let legacyDoseAmount = data.dose_amount;
  let legacyDoseUnit = data.dose_unit;

  if (countPerDose !== null && countUnit) {
    legacyDoseAmount = countPerDose;
    legacyDoseUnit = formatCountUnit(countPerDose, countUnit);
  } else if (strengthAmount !== null && strengthUnit) {
    legacyDoseAmount = strengthAmount;
    legacyDoseUnit = strengthUnit;
  } else if (totalDoseAmount !== null && totalDoseUnit) {
    legacyDoseAmount = totalDoseAmount;
    legacyDoseUnit = totalDoseUnit;
  }

  return {
    dosage,
    dose_amount: legacyDoseAmount === null || legacyDoseAmount === undefined || legacyDoseAmount === '' ? null : Number(legacyDoseAmount),
    dose_unit: String(legacyDoseUnit || '').trim()
  };
}

function normalizeSupplementRecord(row) {
  if (!row) {
    return null;
  }

  const inferred = inferSupplementSchemaFromLegacy(row);
  const countPerDose = row.count_per_dose === null || row.count_per_dose === undefined || row.count_per_dose === ''
    ? inferred.count_per_dose
    : Number(row.count_per_dose);
  const countUnit = normalizeSupplementCountUnit(row.count_unit || inferred.count_unit);
  const strengthAmount = row.strength_amount === null || row.strength_amount === undefined || row.strength_amount === ''
    ? inferred.strength_amount
    : Number(row.strength_amount);
  const strengthUnit = String(row.strength_unit || inferred.strength_unit || '').trim();
  const strengthBasis = String(row.strength_basis || inferred.strength_basis || '').trim();
  const totalDoseAmount = row.total_dose_amount === null || row.total_dose_amount === undefined || row.total_dose_amount === ''
    ? inferred.total_dose_amount
    : Number(row.total_dose_amount);
  const totalDoseUnit = String(row.total_dose_unit || inferred.total_dose_unit || '').trim();
  const legacy = buildLegacySupplementFields({
    ...row,
    count_per_dose: countPerDose,
    count_unit: countUnit,
    strength_amount: strengthAmount,
    strength_unit: strengthUnit,
    total_dose_amount: totalDoseAmount,
    total_dose_unit: totalDoseUnit
  });

  return {
    ...row,
    dosage: legacy.dosage,
    dose_amount: legacy.dose_amount,
    dose_unit: legacy.dose_unit,
    count_per_dose: countPerDose,
    count_unit: countUnit || null,
    strength_amount: strengthAmount,
    strength_unit: strengthUnit || null,
    strength_basis: strengthBasis || null,
    total_dose_amount: totalDoseAmount,
    total_dose_unit: totalDoseUnit || null,
    practical_dose: {
      count_per_dose: countPerDose,
      count_unit: countUnit || null,
      frequency: row.frequency || null,
      time_of_day: row.time_of_day || null
    },
    strength: {
      amount: strengthAmount,
      unit: strengthUnit || null,
      basis: strengthBasis || null
    },
    total_dose: {
      amount: totalDoseAmount,
      unit: totalDoseUnit || null
    }
  };
}

function dbGetAsync(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function dbAllAsync(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

function dbRunAsync(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

async function getApiSupplementGroupByName(userId, groupName) {
  return dbGetAsync(
    db,
    `SELECT *
     FROM supplement_groups
     WHERE user_id = ?
       AND normalized_name = ?
       AND is_active = 1`,
    [userId, normalizeGroupKey(groupName)]
  );
}

async function getApiSupplementGroupMembers(userId, groupId) {
  return dbAllAsync(
    db,
    `SELECT s.*, m.position
     FROM supplement_group_memberships m
     JOIN supplements s ON s.id = m.supplement_id
     WHERE m.user_id = ?
       AND m.group_id = ?
       AND s.is_active = 1
     ORDER BY m.position ASC, lower(s.name) ASC`,
    [userId, groupId]
  );
}

async function validateApiGroupSupplementIds(userId, supplementIds) {
  const normalizedIds = Array.isArray(supplementIds)
    ? supplementIds.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const duplicates = normalizedIds.filter((value, index) => normalizedIds.indexOf(value) !== index);

  if (duplicates.length > 0) {
    return {
      error: {
        status: 400,
        body: {
          error: 'Duplicate supplement_ids provided',
          duplicate_ids: [...new Set(duplicates)]
        }
      }
    };
  }

  const invalidIds = [];
  const inactiveIds = [];

  for (const supplementId of normalizedIds) {
    const supplement = await dbGetAsync(
      db,
      'SELECT id, is_active FROM supplements WHERE id = ? AND user_id = ?',
      [supplementId, userId]
    );

    if (!supplement) {
      invalidIds.push(supplementId);
      continue;
    }

    if (!Boolean(Number(supplement.is_active))) {
      inactiveIds.push(supplementId);
    }
  }

  if (invalidIds.length > 0 || inactiveIds.length > 0) {
    return {
      error: {
        status: 400,
        body: {
          error: 'One or more supplement_ids are invalid for this user',
          invalid_ids: invalidIds,
          inactive_ids: inactiveIds
        }
      }
    };
  }

  return { supplementIds: normalizedIds };
}

async function replaceApiGroupMemberships(userId, groupId, supplementIds) {
  await dbRunAsync(db, 'DELETE FROM supplement_group_memberships WHERE user_id = ? AND group_id = ?', [userId, groupId]);

  for (let index = 0; index < supplementIds.length; index += 1) {
    await dbRunAsync(
      db,
      `INSERT INTO supplement_group_memberships (id, group_id, supplement_id, user_id, position)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), groupId, supplementIds[index], userId, index]
    );
  }
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

const requireCofidRefreshKey = (req, res, next) => {
  const providedKey = req.headers['x-cofid-refresh-key'] || req.body?.key;

  if (!providedKey || providedKey !== COFID_REFRESH_KEY) {
    return res.status(403).json({ error: 'Invalid CoFID refresh key' });
  }

  next();
};

const runCofidRefresh = ({ skipDownload = false } = {}) => new Promise((resolve, reject) => {
  if (cofidRefreshInProgress) {
    reject(Object.assign(new Error('CoFID refresh already in progress'), { statusCode: 409 }));
    return;
  }

  cofidRefreshInProgress = true;

  const args = ['scripts/update-cofid.js'];

  if (skipDownload) {
    args.push('--skip-download');
  }

  const child = spawn('node', args, {
    cwd: __dirname,
    env: process.env
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('error', (error) => {
    cofidRefreshInProgress = false;
    reject(error);
  });

  child.on('close', (code) => {
    cofidRefreshInProgress = false;

    if (code === 0) {
      resolve({
        message: 'CoFID refresh complete',
        skippedDownload: skipDownload,
        output: stdout.trim()
      });
      return;
    }

    reject(Object.assign(new Error(stderr.trim() || stdout.trim() || `CoFID refresh failed with exit code ${code}`), {
      statusCode: 500
    }));
  });
});

const parseNullableNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeDoseUnit = (unit) => {
  const normalized = String(unit || '').trim().toLowerCase();
  const mapping = {
    capsule: 'capsules',
    capsules: 'capsules',
    tablet: 'tablets',
    tablets: 'tablets',
    softgel: 'softgels',
    softgels: 'softgels',
    scoop: 'scoops',
    scoops: 'scoops',
    ml: 'ml',
    drop: 'drops',
    drops: 'drops'
  };

  return mapping[normalized] || null;
};

const parseServingDose = (servingSize) => {
  const text = String(servingSize || '').trim().toLowerCase();
  const match = text.match(/(\d+(?:[\.,]\d+)?)\s*(capsules?|tablets?|softgels?|scoops?|ml|drops?)/i);

  if (!match) {
    return { dose_amount: null, dose_unit: null };
  }

  return {
    dose_amount: parseNullableNumber(match[1].replace(',', '.')),
    dose_unit: normalizeDoseUnit(match[2])
  };
};

const parseServingsPerContainer = (quantity, servingDose) => {
  const text = String(quantity || '').trim().toLowerCase();
  const match = text.match(/(\d+(?:[\.,]\d+)?)\s*(capsules?|tablets?|softgels?|scoops?|ml|drops?)/i);

  if (!match) {
    return null;
  }

  const totalAmount = parseNullableNumber(match[1].replace(',', '.'));
  const totalUnit = normalizeDoseUnit(match[2]);

  if (totalAmount === null || !totalUnit || !servingDose?.dose_amount || !servingDose?.dose_unit) {
    return null;
  }

  if (totalUnit !== servingDose.dose_unit) {
    return null;
  }

  return Math.round((totalAmount / servingDose.dose_amount) * 100) / 100;
};

const summarizeIngredients = (ingredientsText) => {
  const text = String(ingredientsText || '').trim();

  if (!text) {
    return null;
  }

  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
};

const normalizeSupplementCatalogProduct = (product, codeOverride) => {
  if (!product || !product.product_name) {
    return null;
  }

  const servingDose = parseServingDose(product.serving_size);

  return {
    id: String(codeOverride || product.code || ''),
    source: 'off-supplement',
    name: product.product_name,
    brand: product.brands || null,
    dose_amount: servingDose.dose_amount,
    dose_unit: servingDose.dose_unit,
    servings_per_container: parseServingsPerContainer(product.quantity, servingDose),
    ingredients: summarizeIngredients(product.ingredients_text),
    directions: null,
    image_url: product.image_small_url || null
  };
};

async function fetchOffJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': OPEN_FOOD_FACTS_USER_AGENT,
        Accept: 'application/json'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Open Food Facts request failed with status ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function searchSupplementCatalog(query) {
  const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
  url.searchParams.set('search_terms', query);
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', '12');
  url.searchParams.set('fields', 'code,product_name,brands,serving_size,ingredients_text,quantity,image_small_url');
  url.searchParams.set('lc', 'en');

  const data = await fetchOffJson(url.toString());

  return (data.products || [])
    .map(normalizeSupplementCatalogProduct)
    .filter(Boolean);
}

async function lookupSupplementBarcode(code) {
  const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`;
  const data = await fetchOffJson(url);

  if (data.status === 0 || !data.product) {
    return null;
  }

  return normalizeSupplementCatalogProduct(data.product, code);
}

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'PeptiFit API is running' });
});

// Auth routes
app.post('/auth/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    db.run(
      'INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)',
      [userId, username, email, hashedPassword],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Username or email already exists' });
          }
          return res.status(500).json({ error: 'Failed to create user' });
        }

        const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ token, user: { id: userId, username, email } });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  db.get(
    'SELECT * FROM users WHERE username = ? OR email = ?',
    [username, username],
    async (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Server error' });
      }

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
    }
  );
});

app.get('/auth/settings', authenticateToken, (req, res) => {
  db.get(
    'SELECT settings_json FROM users WHERE id = ?',
    [req.user.userId],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to load settings' });
      }

      if (!row) {
        return res.status(404).json({ error: 'User not found' });
      }

      const settings = parseStoredSettings(row.settings_json);
      return res.json({ settings });
    }
  );
});

app.put('/auth/settings', authenticateToken, (req, res) => {
  const normalized = normalizeAccountSettings(req.body || {});
  const settingsJson = JSON.stringify(normalized);

  db.run(
    'UPDATE users SET settings_json = ? WHERE id = ?',
    [settingsJson, req.user.userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to save settings' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.json({ message: 'Settings saved', settings: normalized });
    }
  );
});

app.delete('/auth/me', authenticateToken, (req, res) => {
  const { password } = req.body || {};

  if (!password) {
    return res.status(400).json({ error: 'Password is required to delete your account' });
  }

  db.get(
    'SELECT id, username, password_hash FROM users WHERE id = ?',
    [req.user.userId],
    async (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to load account' });
      }

      if (!user) {
        return res.status(404).json({ error: 'Account not found' });
      }

      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        return res.status(400).json({ error: 'Invalid password' });
      }

      const cleanupStatements = [
        ['DELETE FROM food_logs WHERE user_id = ?', [req.user.userId]],
        ['DELETE FROM blood_results WHERE user_id = ?', [req.user.userId]],
        ['DELETE FROM meals WHERE user_id = ?', [req.user.userId]],
        ['DELETE FROM supplement_group_memberships WHERE user_id = ?', [req.user.userId]],
        ['DELETE FROM supplement_groups WHERE user_id = ?', [req.user.userId]],
        ['DELETE FROM supplement_logs WHERE user_id = ?', [req.user.userId]],
        ['DELETE FROM supplements WHERE user_id = ?', [req.user.userId]],
        ['DELETE FROM vitals WHERE user_id = ?', [req.user.userId]],
        ['DELETE FROM user_peptide_configs WHERE user_id = ?', [req.user.userId]],
        ['DELETE FROM peptide_schedules WHERE user_id = ?', [req.user.userId]],
        ['DELETE FROM peptide_doses WHERE user_id = ?', [req.user.userId]],
        ['DELETE FROM users WHERE id = ?', [req.user.userId]]
      ];

      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        let failed = false;

        cleanupStatements.forEach(([sql, params]) => {
          db.run(sql, params, (statementError) => {
            if (!statementError || failed) {
              return;
            }

            failed = true;
            db.run('ROLLBACK', () => {
              res.status(500).json({ error: 'Failed to delete account' });
            });
          });
        });

        db.run('COMMIT', (commitError) => {
          if (failed) {
            return;
          }

          if (commitError) {
            return db.run('ROLLBACK', () => {
              res.status(500).json({ error: 'Failed to delete account' });
            });
          }

          res.json({ message: 'Account deleted successfully', username: user.username });
        });
      });
    }
  );
});

app.post('/maintenance/cofid/refresh', authenticateToken, requireCofidRefreshKey, async (req, res) => {
  try {
    const result = await runCofidRefresh({
      skipDownload: Boolean(req.body?.skip_download)
    });

    res.json(result);
  } catch (error) {
    console.error('CoFID refresh failed:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'CoFID refresh failed' });
  }
});

app.use('/food', createFoodRouter({ db, authenticateToken, uuidv4 }));
app.use('/ai', createAiRouter({ authenticateToken }));
app.use('/assistant', createAssistantRouter({ db }));

if (COFID_REFRESH_CRON) {
  cron.schedule(COFID_REFRESH_CRON, async () => {
    try {
      const result = await runCofidRefresh();
      console.log('Scheduled CoFID refresh completed:', result.message);
    } catch (error) {
      console.error('Scheduled CoFID refresh failed:', error);
    }
  });
}

app.get('/supplements/catalog/search', authenticateToken, async (req, res) => {
  const query = String(req.query.query || '').trim();

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    const results = await searchSupplementCatalog(query);
    res.json({ results });
  } catch (error) {
    console.error('Supplement catalog search failed:', error);
    res.status(502).json({ error: 'Failed to reach supplement catalog provider' });
  }
});

app.get('/supplements/catalog/barcode/:code', authenticateToken, async (req, res) => {
  try {
    const result = await lookupSupplementBarcode(req.params.code);

    if (!result) {
      return res.status(404).json({ error: 'Supplement not found' });
    }

    res.json(result);
  } catch (error) {
    console.error('Supplement barcode lookup failed:', error);
    res.status(502).json({ error: 'Failed to reach supplement catalog provider' });
  }
});

// Peptides routes
app.get('/peptides', authenticateToken, (req, res) => {
  db.all('SELECT * FROM peptides ORDER BY name', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch peptides' });
    }
    res.json(rows);
  });
});

app.post('/peptides', authenticateToken, (req, res) => {
  const {
    name,
    description,
    dosage_range,
    frequency,
    administration_route,
    storage_requirements
  } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Peptide name is required' });
  }

  const peptideId = uuidv4();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO peptides
     (id, name, description, dosage_range, frequency, administration_route, storage_requirements, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      peptideId,
      String(name).trim(),
      description ? String(description).trim() : '',
      dosage_range ? String(dosage_range).trim() : '',
      frequency ? String(frequency).trim() : '',
      administration_route ? String(administration_route).trim() : '',
      storage_requirements ? String(storage_requirements).trim() : '',
      now
    ],
    function(err) {
      if (err) {
        console.error('Error creating peptide:', err);
        return res.status(500).json({ error: 'Failed to create peptide' });
      }

      res.status(201).json({
        id: peptideId,
        name: String(name).trim(),
        description: description ? String(description).trim() : '',
        dosage_range: dosage_range ? String(dosage_range).trim() : '',
        frequency: frequency ? String(frequency).trim() : '',
        administration_route: administration_route ? String(administration_route).trim() : '',
        storage_requirements: storage_requirements ? String(storage_requirements).trim() : '',
        created_at: now
      });
    }
  );
});

app.get('/peptides/:id', authenticateToken, (req, res, next) => {
  if (req.params.id === 'configs') {
    return next();
  }

  db.get('SELECT * FROM peptides WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch peptide' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Peptide not found' });
    }
    res.json(row);
  });
});

app.put('/peptides/:id', authenticateToken, (req, res) => {
  const {
    name,
    description,
    dosage_range,
    frequency,
    administration_route,
    storage_requirements
  } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Peptide name is required' });
  }

  db.run(
    `UPDATE peptides
     SET name = ?, description = ?, dosage_range = ?, frequency = ?, administration_route = ?, storage_requirements = ?
     WHERE id = ?`,
    [
      String(name).trim(),
      description ? String(description).trim() : '',
      dosage_range ? String(dosage_range).trim() : '',
      frequency ? String(frequency).trim() : '',
      administration_route ? String(administration_route).trim() : '',
      storage_requirements ? String(storage_requirements).trim() : '',
      req.params.id
    ],
    function(err) {
      if (err) {
        console.error('Error updating peptide:', err);
        return res.status(500).json({ error: 'Failed to update peptide' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Peptide not found' });
      }
      res.json({ message: 'Peptide updated successfully' });
    }
  );
});

app.delete('/peptides/:id', authenticateToken, (req, res) => {
  db.get(
    `SELECT
       (SELECT COUNT(*) FROM user_peptide_configs WHERE peptide_id = ?) AS config_count,
       (SELECT COUNT(*) FROM peptide_doses WHERE peptide_id = ?) AS dose_count`,
    [req.params.id, req.params.id],
    (err, usage) => {
      if (err) {
        console.error('Error checking peptide usage:', err);
        return res.status(500).json({ error: 'Failed to delete peptide' });
      }

      if ((usage?.config_count || 0) > 0 || (usage?.dose_count || 0) > 0) {
        return res.status(400).json({ error: 'Cannot delete a peptide that is already used in your stack or dose history' });
      }

      db.run('DELETE FROM peptides WHERE id = ?', [req.params.id], function(deleteErr) {
        if (deleteErr) {
          console.error('Error deleting peptide:', deleteErr);
          return res.status(500).json({ error: 'Failed to delete peptide' });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Peptide not found' });
        }
        res.json({ message: 'Peptide deleted successfully' });
      });
    }
  );
});

// Peptide doses routes
app.post('/doses', authenticateToken, (req, res) => {
  const { peptide_id, config_id, dose_amount, dose_unit, administration_time, injection_site, notes } = req.body;

  if (!peptide_id || !dose_amount || !dose_unit || !administration_time) {
    return res.status(400).json({ error: 'Peptide ID, dose amount, unit, and administration time are required' });
  }

  const doseId = uuidv4();

  const insertDose = (validatedConfigId = null) => {
    db.run(
      'INSERT INTO peptide_doses (id, user_id, peptide_id, config_id, dose_amount, dose_unit, administration_time, injection_site, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [doseId, req.user.userId, peptide_id, validatedConfigId, dose_amount, dose_unit, administration_time, injection_site, notes],
      function(err) {
        if (err) {
          console.error('Error recording dose:', err);
          return res.status(500).json({ error: 'Failed to record dose' });
        }
        res.status(201).json({ id: doseId, message: 'Dose recorded successfully' });
      }
    );
  };

  if (!config_id) {
    insertDose(null);
    return;
  }

  db.get(
    'SELECT id, peptide_id FROM user_peptide_configs WHERE id = ? AND user_id = ?',
    [config_id, req.user.userId],
    (err, configRow) => {
      if (err) {
        console.error('Error validating peptide config:', err);
        return res.status(500).json({ error: 'Failed to validate peptide configuration' });
      }

      if (!configRow) {
        return res.status(400).json({ error: 'Invalid peptide configuration' });
      }

      if (configRow.peptide_id !== peptide_id) {
        return res.status(400).json({ error: 'Dose peptide does not match the selected configuration' });
      }

      insertDose(configRow.id);
    }
  );
});

app.get('/doses', authenticateToken, (req, res) => {
  const query = `
    SELECT 
      d.*,
      p.name as peptide_name,
      c.frequency as config_frequency
    FROM peptide_doses d
    JOIN peptides p ON d.peptide_id = p.id
    LEFT JOIN user_peptide_configs c ON d.config_id = c.id
    WHERE d.user_id = ?
    ORDER BY d.administration_time DESC
  `;

  db.all(query, [req.user.userId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch doses' });
    }
    res.json(rows);
  });
});

app.get('/doses/recent', authenticateToken, (req, res) => {
  const query = `
    SELECT 
      d.*,
      p.name as peptide_name,
      c.frequency as config_frequency
    FROM peptide_doses d
    JOIN peptides p ON d.peptide_id = p.id
    LEFT JOIN user_peptide_configs c ON d.config_id = c.id
    WHERE d.user_id = ? 
    AND d.administration_time >= datetime('now', '-7 days')
    ORDER BY d.administration_time DESC
  `;

  db.all(query, [req.user.userId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch recent doses' });
    }
    res.json(rows);
  });
});

// Schedules routes
app.post('/schedules', authenticateToken, (req, res) => {
  const { peptide_id, dose_amount, dose_unit, frequency, days_of_week, time_of_day } = req.body;

  if (!peptide_id || !dose_amount || !dose_unit || !frequency) {
    return res.status(400).json({ error: 'All schedule fields are required' });
  }

  const scheduleId = uuidv4();
  db.run(
    'INSERT INTO peptide_schedules (id, user_id, peptide_id, dose_amount, dose_unit, frequency, days_of_week, time_of_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [scheduleId, req.user.userId, peptide_id, dose_amount, dose_unit, frequency, days_of_week, time_of_day],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create schedule' });
      }
      res.status(201).json({ id: scheduleId, message: 'Schedule created successfully' });
    }
  );
});

app.get('/schedules', authenticateToken, (req, res) => {
  const query = `
    SELECT
      s.*,
      p.name as peptide_name
    FROM peptide_schedules s
    JOIN peptides p ON s.peptide_id = p.id
    WHERE s.user_id = ? AND s.is_active = 1
    ORDER BY s.created_at DESC
  `;

  db.all(query, [req.user.userId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch schedules' });
    }
    res.json(rows);
  });
});

// ============================================
// PEPTIDE CONFIGS API
// ============================================

// GET /peptides/configs - Get all peptide configurations for the authenticated user
app.get('/peptides/configs', authenticateToken, (req, res) => {
  const query = `
    SELECT
      c.*,
      p.name as peptide_name,
      p.description as peptide_description,
      p.dosage_range,
      p.administration_route,
      p.storage_requirements
    FROM user_peptide_configs c
    JOIN peptides p ON c.peptide_id = p.id
    WHERE c.user_id = ? AND c.is_active = 1
    ORDER BY c.created_at DESC
  `;

  db.all(query, [req.user.userId], (err, rows) => {
    if (err) {
      console.error('Error fetching peptide configs:', err);
      return res.status(500).json({ error: 'Failed to fetch peptide configurations' });
    }

    // Parse JSON fields
    const configs = rows.map(row => ({
      ...row,
      doses: row.doses ? JSON.parse(row.doses) : [],
      cycle_config: row.cycle_config ? JSON.parse(row.cycle_config) : null,
      custom_days: row.custom_days ? JSON.parse(row.custom_days) : []
    }));

    res.json(configs);
  });
});

// GET /peptides/configs/:id - Get a specific config by ID
app.get('/peptides/configs/:id', authenticateToken, (req, res) => {
  const query = `
    SELECT
      c.*,
      p.name as peptide_name,
      p.description as peptide_description,
      p.dosage_range,
      p.administration_route,
      p.storage_requirements
    FROM user_peptide_configs c
    JOIN peptides p ON c.peptide_id = p.id
    WHERE c.id = ? AND c.user_id = ?
  `;

  db.get(query, [req.params.id, req.user.userId], (err, row) => {
    if (err) {
      console.error('Error fetching peptide config:', err);
      return res.status(500).json({ error: 'Failed to fetch peptide configuration' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Peptide configuration not found' });
    }

    // Parse JSON fields
    const config = {
      ...row,
      doses: row.doses ? JSON.parse(row.doses) : [],
      cycle_config: row.cycle_config ? JSON.parse(row.cycle_config) : null,
      custom_days: row.custom_days ? JSON.parse(row.custom_days) : []
    };

    res.json(config);
  });
});

// GET /peptides/configs/:id/suggested-dose - Get the suggested dose for next administration
app.get('/peptides/configs/:id/suggested-dose', authenticateToken, (req, res) => {
  // First get the config
  const configQuery = `
    SELECT c.*, p.name as peptide_name
    FROM user_peptide_configs c
    JOIN peptides p ON c.peptide_id = p.id
    WHERE c.id = ? AND c.user_id = ?
  `;

  db.get(configQuery, [req.params.id, req.user.userId], (err, config) => {
    if (err) {
      console.error('Error fetching config for suggested dose:', err);
      return res.status(500).json({ error: 'Failed to fetch configuration' });
    }
    if (!config) {
      return res.status(404).json({ error: 'Peptide configuration not found' });
    }

    // Get the last dose for this config first, with a peptide-level fallback for legacy rows.
    const lastDoseQuery = `
      SELECT * FROM peptide_doses
      WHERE user_id = ?
      AND (
        config_id = ?
        OR (config_id IS NULL AND peptide_id = ?)
      )
      ORDER BY administration_time DESC
      LIMIT 1
    `;

    db.get(lastDoseQuery, [req.user.userId, config.id, config.peptide_id], (err, lastDose) => {
      if (err) {
        console.error('Error fetching last dose:', err);
        return res.status(500).json({ error: 'Failed to fetch dose history' });
      }

      const doses = config.doses ? JSON.parse(config.doses) : [];
      const cycleConfig = config.cycle_config ? JSON.parse(config.cycle_config) : null;
      const customDays = config.custom_days ? JSON.parse(config.custom_days) : [];
      const now = new Date();
      const dayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()];
      const currentHour = now.getHours();

      let suggestedDose = null;
      let nextDoseTime = null;
      let isDue = false;
      let message = '';

      // Helper function to find the next scheduled dose time
      const findNextDoseForToday = () => {
        if (doses.length === 0) return null;

        // Sort doses by time
        const sortedDoses = [...doses].sort((a, b) => {
          const timeA = a.time ? parseInt(a.time.split(':')[0]) : 0;
          const timeB = b.time ? parseInt(b.time.split(':')[0]) : 0;
          return timeA - timeB;
        });

        // Find the next dose that hasn't been taken yet today
        for (const dose of sortedDoses) {
          if (dose.time) {
            const doseHour = parseInt(dose.time.split(':')[0]);
            if (doseHour >= currentHour) {
              return dose;
            }
          }
        }

        // Return first dose if all times have passed (for tomorrow)
        return sortedDoses[0];
      };

      // Calculate based on frequency
      switch (config.frequency) {
        case 'daily':
          suggestedDose = findNextDoseForToday();
          isDue = true;
          message = 'Daily dose';
          break;

        case 'BID': // Twice daily
        case 'TID': // Three times daily
          suggestedDose = findNextDoseForToday();
          isDue = true;
          message = config.frequency === 'BID' ? 'Twice daily dose' : 'Three times daily dose';
          break;

        case 'weekly':
          if (lastDose) {
            const lastDoseDate = new Date(lastDose.administration_time);
            const daysSinceLastDose = Math.floor((now - lastDoseDate) / (1000 * 60 * 60 * 24));
            isDue = daysSinceLastDose >= 7;
            if (isDue) {
              suggestedDose = doses[0] || null;
              message = 'Weekly dose is due';
            } else {
              const daysUntilDue = 7 - daysSinceLastDose;
              message = `Next dose in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}`;
              nextDoseTime = new Date(lastDoseDate.getTime() + 7 * 24 * 60 * 60 * 1000);
            }
          } else {
            isDue = true;
            suggestedDose = doses[0] || null;
            message = 'No previous dose recorded - dose is due';
          }
          break;

        case 'custom-weekly':
          if (customDays.includes(dayOfWeek)) {
            isDue = true;
            suggestedDose = findNextDoseForToday();
            message = `Scheduled dose day (${dayOfWeek.toUpperCase()})`;
          } else {
            message = `Not a scheduled day. Schedule: ${customDays.map(d => d.toUpperCase()).join(', ')}`;
          }
          break;

        case 'every-x-days':
          if (lastDose && config.every_x_days) {
            const lastDoseDate = new Date(lastDose.administration_time);
            const daysSinceLastDose = Math.floor((now - lastDoseDate) / (1000 * 60 * 60 * 24));
            isDue = daysSinceLastDose >= config.every_x_days;
            if (isDue) {
              suggestedDose = doses[0] || null;
              message = `Dose is due (every ${config.every_x_days} days)`;
            } else {
              const daysUntilDue = config.every_x_days - daysSinceLastDose;
              message = `Next dose in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}`;
              nextDoseTime = new Date(lastDoseDate.getTime() + config.every_x_days * 24 * 60 * 60 * 1000);
            }
          } else {
            isDue = true;
            suggestedDose = doses[0] || null;
            message = 'No previous dose recorded - dose is due';
          }
          break;

        case 'cycling':
          if (cycleConfig && lastDose) {
            const { days_on, days_off } = cycleConfig;
            const cycleLength = days_on + days_off;
            const lastDoseDate = new Date(lastDose.administration_time);
            const daysSinceLastDose = Math.floor((now - lastDoseDate) / (1000 * 60 * 60 * 24));

            // Determine where we are in the cycle
            // This is simplified - a more robust implementation would track cycle start
            const cycleDay = daysSinceLastDose % cycleLength;

            if (cycleDay < days_on) {
              isDue = true;
              suggestedDose = findNextDoseForToday();
              message = `Day ${cycleDay + 1} of ${days_on} ON days`;
            } else {
              const daysUntilOn = cycleLength - cycleDay;
              message = `OFF period - ${daysUntilOn} day${daysUntilOn !== 1 ? 's' : ''} until next ON cycle`;
            }
          } else {
            isDue = true;
            suggestedDose = doses[0] || null;
            message = 'Starting new cycle - dose is due';
          }
          break;

        case 'as-needed':
          suggestedDose = doses[0] || null;
          isDue = false;
          message = 'Take as needed';
          break;

        default:
          suggestedDose = doses[0] || null;
          message = 'Unknown frequency';
      }

      res.json({
        config_id: config.id,
        peptide_id: config.peptide_id,
        peptide_name: config.peptide_name,
        frequency: config.frequency,
        suggested_dose: suggestedDose,
        is_due: isDue,
        next_dose_time: nextDoseTime,
        message,
        last_dose: lastDose ? {
          amount: lastDose.dose_amount,
          unit: lastDose.dose_unit,
          time: lastDose.administration_time
        } : null
      });
    });
  });
});

// POST /peptides/configs - Create a new peptide configuration
app.post('/peptides/configs', authenticateToken, (req, res) => {
  const {
    peptide_id,
    frequency,
    doses,
    cycle_config,
    custom_days,
    every_x_days,
    notes
  } = req.body;

  if (!peptide_id || !frequency) {
    return res.status(400).json({ error: 'Peptide ID and frequency are required' });
  }

  // Validate that the peptide exists
  db.get('SELECT id FROM peptides WHERE id = ?', [peptide_id], (err, peptide) => {
    if (err) {
      console.error('Error validating peptide:', err);
      return res.status(500).json({ error: 'Failed to validate peptide' });
    }
    if (!peptide) {
      return res.status(400).json({ error: 'Invalid peptide ID' });
    }

    const configId = uuidv4();
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO user_peptide_configs
       (id, user_id, peptide_id, frequency, doses, cycle_config, custom_days, every_x_days, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        configId,
        req.user.userId,
        peptide_id,
        frequency,
        doses ? JSON.stringify(doses) : null,
        cycle_config ? JSON.stringify(cycle_config) : null,
        custom_days ? JSON.stringify(custom_days) : null,
        every_x_days || null,
        notes || null,
        now,
        now
      ],
      function(err) {
        if (err) {
          console.error('Error creating peptide config:', err);
          return res.status(500).json({ error: 'Failed to create peptide configuration' });
        }
        res.status(201).json({
          id: configId,
          message: 'Peptide configuration created successfully'
        });
      }
    );
  });
});

// PUT /peptides/configs/:id - Update an existing config
app.put('/peptides/configs/:id', authenticateToken, (req, res) => {
  const {
    peptide_id,
    frequency,
    doses,
    cycle_config,
    custom_days,
    every_x_days,
    notes,
    is_active
  } = req.body;

  // First verify the config exists and belongs to the user
  db.get(
    'SELECT id FROM user_peptide_configs WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.userId],
    (err, config) => {
      if (err) {
        console.error('Error finding config:', err);
        return res.status(500).json({ error: 'Failed to find configuration' });
      }
      if (!config) {
        return res.status(404).json({ error: 'Peptide configuration not found' });
      }

      const now = new Date().toISOString();
      const updates = [];
      const params = [];

      if (peptide_id !== undefined) {
        updates.push('peptide_id = ?');
        params.push(peptide_id);
      }
      if (frequency !== undefined) {
        updates.push('frequency = ?');
        params.push(frequency);
      }
      if (doses !== undefined) {
        updates.push('doses = ?');
        params.push(JSON.stringify(doses));
      }
      if (cycle_config !== undefined) {
        updates.push('cycle_config = ?');
        params.push(cycle_config ? JSON.stringify(cycle_config) : null);
      }
      if (custom_days !== undefined) {
        updates.push('custom_days = ?');
        params.push(custom_days ? JSON.stringify(custom_days) : null);
      }
      if (every_x_days !== undefined) {
        updates.push('every_x_days = ?');
        params.push(every_x_days);
      }
      if (notes !== undefined) {
        updates.push('notes = ?');
        params.push(notes);
      }
      if (is_active !== undefined) {
        updates.push('is_active = ?');
        params.push(is_active ? 1 : 0);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push('updated_at = ?');
      params.push(now);
      params.push(req.params.id);
      params.push(req.user.userId);

      const query = `UPDATE user_peptide_configs SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`;

      db.run(query, params, function(err) {
        if (err) {
          console.error('Error updating peptide config:', err);
          return res.status(500).json({ error: 'Failed to update peptide configuration' });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Peptide configuration not found' });
        }
        res.json({ message: 'Peptide configuration updated successfully' });
      });
    }
  );
});

// DELETE /peptides/configs/:id - Delete a config (soft delete by setting is_active = 0)
app.delete('/peptides/configs/:id', authenticateToken, (req, res) => {
  const now = new Date().toISOString();

  db.run(
    'UPDATE user_peptide_configs SET is_active = 0, updated_at = ? WHERE id = ? AND user_id = ?',
    [now, req.params.id, req.user.userId],
    function(err) {
      if (err) {
        console.error('Error deleting peptide config:', err);
        return res.status(500).json({ error: 'Failed to delete peptide configuration' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Peptide configuration not found' });
      }
      res.json({ message: 'Peptide configuration deleted successfully' });
    }
  );
});

// ============================================
// VITALS API
// ============================================

// GET /vitals/latest - Get latest readings for each vital type
app.get('/vitals/latest', authenticateToken, (req, res) => {
  const query = `
    SELECT vital_type, value, unit, notes, measured_at
    FROM vitals
    WHERE user_id = ?
    AND measured_at = (
      SELECT MAX(measured_at)
      FROM vitals v2
      WHERE v2.vital_type = vitals.vital_type
      AND v2.user_id = vitals.user_id
    )
    ORDER BY vital_type
  `;
  
  db.all(query, [req.user.userId], (err, rows) => {
    if (err) {
      console.error('Error fetching latest vitals:', err);
      return res.status(500).json({ error: 'Failed to fetch vitals' });
    }
    
    const result = {};
    rows.forEach(row => {
      result[row.vital_type] = row;
    });
    
    res.json(result);
  });
});

// GET /vitals - Get vitals with optional filters
app.get('/vitals', authenticateToken, (req, res) => {
  const { type, start, end, limit = 100 } = req.query;
  
  let query = 'SELECT * FROM vitals WHERE user_id = ?';
  const params = [req.user.userId];
  
  if (type) {
    query += ' AND vital_type = ?';
    params.push(type);
  }
  if (start) {
    query += ' AND measured_at >= ?';
    params.push(start);
  }
  if (end) {
    query += ' AND measured_at <= ?';
    params.push(end);
  }
  
  query += ' ORDER BY measured_at DESC LIMIT ?';
  params.push(parseInt(limit));
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error fetching vitals:', err);
      return res.status(500).json({ error: 'Failed to fetch vitals' });
    }
    res.json(rows);
  });
});

// POST /vitals - Log a vital reading
app.post('/vitals', authenticateToken, (req, res) => {
  const { vital_type, value, unit, notes, measured_at } = req.body;
  
  if (!vital_type || value === undefined) {
    return res.status(400).json({ error: 'vital_type and value are required' });
  }
  
  const id = uuidv4();
  const timestamp = measured_at || new Date().toISOString();
  
  db.run(
    'INSERT INTO vitals (id, user_id, vital_type, value, unit, notes, measured_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, req.user.userId, vital_type, value, unit || '', notes || '', timestamp],
    function(err) {
      if (err) {
        console.error('Error logging vital:', err);
        return res.status(500).json({ error: 'Failed to log vital' });
      }
      res.status(201).json({ id, message: 'Vital reading logged successfully' });
    }
  );
});

// ============================================
// SUPPLEMENTS API
// ============================================

// GET /supplements - List user's supplements
app.get('/supplements', authenticateToken, (req, res) => {
  db.all(
    'SELECT * FROM supplements WHERE user_id = ? ORDER BY name',
    [req.user.userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch supplements' });
      }
      res.json(rows.map(normalizeSupplementRecord));
    }
  );
});

// GET /supplement-groups - List user's supplement groups
app.get('/supplement-groups', authenticateToken, (req, res) => {
  db.all(
    `SELECT g.*, COUNT(m.id) AS supplement_count
     FROM supplement_groups g
     LEFT JOIN supplement_group_memberships m ON m.group_id = g.id
     WHERE g.user_id = ? AND g.is_active = 1
     GROUP BY g.id
     ORDER BY lower(coalesce(g.display_name, g.name)) ASC, datetime(g.created_at) ASC`,
    [req.user.userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch supplement groups' });
      }

      res.json(rows.map((row) => ({
        id: row.id,
        name: row.name,
        display_name: row.display_name || row.name,
        is_default: Boolean(Number(row.is_default)),
        is_active: Boolean(Number(row.is_active)),
        supplement_count: Number(row.supplement_count || 0)
      })));
    }
  );
});

// GET /supplement-groups/:groupName - Get one group with member supplements
app.get('/supplement-groups/:groupName', authenticateToken, (req, res) => {
  db.get(
    `SELECT *
     FROM supplement_groups
     WHERE user_id = ? AND normalized_name = ? AND is_active = 1`,
    [req.user.userId, normalizeGroupKey(req.params.groupName)],
    (groupErr, groupRow) => {
      if (groupErr) {
        return res.status(500).json({ error: 'Failed to fetch supplement group' });
      }

      if (!groupRow) {
        return res.status(404).json({ error: 'Supplement group not found' });
      }

      db.all(
        `SELECT s.*, m.position
         FROM supplement_group_memberships m
         JOIN supplements s ON s.id = m.supplement_id
         WHERE m.group_id = ? AND m.user_id = ? AND s.is_active = 1
         ORDER BY m.position ASC, lower(s.name) ASC`,
        [groupRow.id, req.user.userId],
        (memberErr, supplementRows) => {
          if (memberErr) {
            return res.status(500).json({ error: 'Failed to fetch supplement group members' });
          }

          res.json({
            id: groupRow.id,
            name: groupRow.name,
            display_name: groupRow.display_name || groupRow.name,
            is_default: Boolean(Number(groupRow.is_default)),
            is_active: Boolean(Number(groupRow.is_active)),
            supplements: supplementRows.map(normalizeSupplementRecord)
          });
        }
      );
    }
  );
});

// POST /supplement-groups - Create a supplement group
app.post('/supplement-groups', authenticateToken, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const displayName = String(req.body?.display_name || name).trim();

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const existingGroup = await getApiSupplementGroupByName(req.user.userId, name);
    if (existingGroup) {
      return res.status(409).json({ error: 'Supplement group already exists' });
    }

    const validated = await validateApiGroupSupplementIds(req.user.userId, req.body?.supplement_ids);
    if (validated.error) {
      return res.status(validated.error.status).json(validated.error.body);
    }

    const groupId = uuidv4();
    await dbRunAsync(
      db,
      `INSERT INTO supplement_groups (id, user_id, name, normalized_name, display_name, is_default, is_active, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 1, CURRENT_TIMESTAMP)`,
      [groupId, req.user.userId, name, normalizeGroupKey(name), displayName]
    );
    await replaceApiGroupMemberships(req.user.userId, groupId, validated.supplementIds);

    const createdGroup = await getApiSupplementGroupByName(req.user.userId, name);
    const supplements = await getApiSupplementGroupMembers(req.user.userId, groupId);
    return res.status(201).json({
      id: createdGroup.id,
      name: createdGroup.name,
      display_name: createdGroup.display_name || createdGroup.name,
      is_default: Boolean(Number(createdGroup.is_default)),
      is_active: Boolean(Number(createdGroup.is_active)),
      supplements: supplements.map(normalizeSupplementRecord)
    });
  } catch (error) {
    console.error('Failed to create supplement group:', error);
    return res.status(500).json({ error: 'Failed to create supplement group' });
  }
});

// PUT /supplement-groups/:groupName - Update a supplement group
app.put('/supplement-groups/:groupName', authenticateToken, async (req, res) => {
  try {
    const currentGroup = await getApiSupplementGroupByName(req.user.userId, req.params.groupName);
    if (!currentGroup) {
      return res.status(404).json({ error: 'Supplement group not found' });
    }

    const nextName = String(req.body?.name || currentGroup.name).trim();
    const nextDisplayName = Object.prototype.hasOwnProperty.call(req.body || {}, 'display_name')
      ? String(req.body.display_name || nextName).trim()
      : String(currentGroup.display_name || currentGroup.name).trim();

    if (!nextName) {
      return res.status(400).json({ error: 'name is required' });
    }

    if (normalizeGroupKey(nextName) !== normalizeGroupKey(currentGroup.name)) {
      const conflictingGroup = await getApiSupplementGroupByName(req.user.userId, nextName);
      if (conflictingGroup && conflictingGroup.id !== currentGroup.id) {
        return res.status(409).json({ error: 'Supplement group already exists' });
      }
    }

    const currentMembers = await getApiSupplementGroupMembers(req.user.userId, currentGroup.id);
    const nextSupplementIds = Object.prototype.hasOwnProperty.call(req.body || {}, 'supplement_ids')
      ? req.body.supplement_ids
      : currentMembers.map((item) => item.id);
    const validated = await validateApiGroupSupplementIds(req.user.userId, nextSupplementIds);
    if (validated.error) {
      return res.status(validated.error.status).json(validated.error.body);
    }

    await dbRunAsync(
      db,
      `UPDATE supplement_groups
       SET name = ?, normalized_name = ?, display_name = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [nextName, normalizeGroupKey(nextName), nextDisplayName, currentGroup.id, req.user.userId]
    );
    await replaceApiGroupMemberships(req.user.userId, currentGroup.id, validated.supplementIds);

    const updatedGroup = await getApiSupplementGroupByName(req.user.userId, nextName);
    const supplements = await getApiSupplementGroupMembers(req.user.userId, currentGroup.id);
    return res.json({
      id: updatedGroup.id,
      name: updatedGroup.name,
      display_name: updatedGroup.display_name || updatedGroup.name,
      is_default: Boolean(Number(updatedGroup.is_default)),
      is_active: Boolean(Number(updatedGroup.is_active)),
      supplements: supplements.map(normalizeSupplementRecord)
    });
  } catch (error) {
    console.error('Failed to update supplement group:', error);
    return res.status(500).json({ error: 'Failed to update supplement group' });
  }
});

// DELETE /supplement-groups/:groupName - Delete a supplement group
app.delete('/supplement-groups/:groupName', authenticateToken, async (req, res) => {
  try {
    const group = await getApiSupplementGroupByName(req.user.userId, req.params.groupName);
    if (!group) {
      return res.status(404).json({ error: 'Supplement group not found' });
    }

    await dbRunAsync(db, 'DELETE FROM supplement_group_memberships WHERE user_id = ? AND group_id = ?', [req.user.userId, group.id]);
    await dbRunAsync(db, 'DELETE FROM supplement_groups WHERE user_id = ? AND id = ?', [req.user.userId, group.id]);

    return res.json({ message: 'Supplement group deleted successfully', id: group.id, name: group.name });
  } catch (error) {
    console.error('Failed to delete supplement group:', error);
    return res.status(500).json({ error: 'Failed to delete supplement group' });
  }
});

// POST /supplements - Create a new supplement
app.post('/supplements', authenticateToken, (req, res) => {
  const {
    name,
    brand,
    dosage,
    dose_amount,
    dose_unit,
    count_per_dose,
    count_unit,
    strength_amount,
    strength_unit,
    strength_basis,
    total_dose_amount,
    total_dose_unit,
    servings_per_container,
    frequency,
    time_of_day,
    notes
  } = req.body || {};

  if (!name) {
    return res.status(400).json({ error: 'Supplement name is required' });
  }

  const id = uuidv4();
  const normalizedCountPerDose = count_per_dose === null || count_per_dose === undefined || count_per_dose === ''
    ? null
    : Number(count_per_dose);
  const normalizedCountUnit = count_unit ? normalizeSupplementCountUnit(count_unit) : '';
  const normalizedStrengthAmount = strength_amount === null || strength_amount === undefined || strength_amount === ''
    ? null
    : Number(strength_amount);
  const normalizedStrengthUnit = strength_unit ? String(strength_unit).trim() : '';
  const normalizedStrengthBasis = strength_basis ? String(strength_basis).trim() : '';
  const normalizedTotalDoseAmount = total_dose_amount === null || total_dose_amount === undefined || total_dose_amount === ''
    ? null
    : Number(total_dose_amount);
  const normalizedTotalDoseUnit = total_dose_unit ? String(total_dose_unit).trim() : '';
  const normalizedServings = servings_per_container === null || servings_per_container === undefined || servings_per_container === ''
    ? null
    : parseInt(servings_per_container, 10);
  const legacySupplementFields = buildLegacySupplementFields({
    dosage,
    dose_amount,
    dose_unit,
    count_per_dose: normalizedCountPerDose,
    count_unit: normalizedCountUnit,
    strength_amount: normalizedStrengthAmount,
    strength_unit: normalizedStrengthUnit,
    total_dose_amount: normalizedTotalDoseAmount,
    total_dose_unit: normalizedTotalDoseUnit
  });

  db.run(
    `INSERT INTO supplements
     (id, user_id, name, brand, dosage, dose_amount, dose_unit, count_per_dose, count_unit, strength_amount, strength_unit, strength_basis, total_dose_amount, total_dose_unit, servings_per_container, frequency, time_of_day, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      req.user.userId,
      name,
      brand || '',
      legacySupplementFields.dosage || '',
      Number.isFinite(legacySupplementFields.dose_amount) ? legacySupplementFields.dose_amount : null,
      legacySupplementFields.dose_unit || '',
      Number.isFinite(normalizedCountPerDose) ? normalizedCountPerDose : null,
      normalizedCountUnit || '',
      Number.isFinite(normalizedStrengthAmount) ? normalizedStrengthAmount : null,
      normalizedStrengthUnit || '',
      normalizedStrengthBasis || '',
      Number.isFinite(normalizedTotalDoseAmount) ? normalizedTotalDoseAmount : null,
      normalizedTotalDoseUnit || '',
      Number.isFinite(normalizedServings) ? normalizedServings : null,
      frequency || '',
      time_of_day || '',
      notes || ''
    ],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create supplement' });
      }
      db.get('SELECT * FROM supplements WHERE id = ? AND user_id = ?', [id, req.user.userId], (fetchErr, row) => {
        if (fetchErr || !row) {
          return res.status(201).json({ id, message: 'Supplement created successfully' });
        }
        res.status(201).json(normalizeSupplementRecord(row));
      });
    }
  );
});

// PUT /supplements/:id - Update an existing supplement
app.put('/supplements/:id', authenticateToken, (req, res) => {
  const {
    name,
    brand,
    dosage,
    dose_amount,
    dose_unit,
    count_per_dose,
    count_unit,
    strength_amount,
    strength_unit,
    strength_basis,
    total_dose_amount,
    total_dose_unit,
    servings_per_container,
    frequency,
    time_of_day,
    notes,
    is_active
  } = req.body || {};

  if (!name) {
    return res.status(400).json({ error: 'Supplement name is required' });
  }

  const normalizedCountPerDose = count_per_dose === null || count_per_dose === undefined || count_per_dose === ''
    ? null
    : Number(count_per_dose);
  const normalizedCountUnit = count_unit ? normalizeSupplementCountUnit(count_unit) : '';
  const normalizedStrengthAmount = strength_amount === null || strength_amount === undefined || strength_amount === ''
    ? null
    : Number(strength_amount);
  const normalizedStrengthUnit = strength_unit ? String(strength_unit).trim() : '';
  const normalizedStrengthBasis = strength_basis ? String(strength_basis).trim() : '';
  const normalizedTotalDoseAmount = total_dose_amount === null || total_dose_amount === undefined || total_dose_amount === ''
    ? null
    : Number(total_dose_amount);
  const normalizedTotalDoseUnit = total_dose_unit ? String(total_dose_unit).trim() : '';
  const normalizedServings = servings_per_container === null || servings_per_container === undefined || servings_per_container === ''
    ? null
    : parseInt(servings_per_container, 10);
  const legacySupplementFields = buildLegacySupplementFields({
    dosage,
    dose_amount,
    dose_unit,
    count_per_dose: normalizedCountPerDose,
    count_unit: normalizedCountUnit,
    strength_amount: normalizedStrengthAmount,
    strength_unit: normalizedStrengthUnit,
    total_dose_amount: normalizedTotalDoseAmount,
    total_dose_unit: normalizedTotalDoseUnit
  });

  db.run(
    `UPDATE supplements
     SET name = ?, brand = ?, dosage = ?, dose_amount = ?, dose_unit = ?, count_per_dose = ?, count_unit = ?, strength_amount = ?, strength_unit = ?, strength_basis = ?, total_dose_amount = ?, total_dose_unit = ?, servings_per_container = ?, frequency = ?, time_of_day = ?, notes = ?, is_active = ?
     WHERE id = ? AND user_id = ?`,
    [
      name,
      brand || '',
      legacySupplementFields.dosage || '',
      Number.isFinite(legacySupplementFields.dose_amount) ? legacySupplementFields.dose_amount : null,
      legacySupplementFields.dose_unit || '',
      Number.isFinite(normalizedCountPerDose) ? normalizedCountPerDose : null,
      normalizedCountUnit || '',
      Number.isFinite(normalizedStrengthAmount) ? normalizedStrengthAmount : null,
      normalizedStrengthUnit || '',
      normalizedStrengthBasis || '',
      Number.isFinite(normalizedTotalDoseAmount) ? normalizedTotalDoseAmount : null,
      normalizedTotalDoseUnit || '',
      Number.isFinite(normalizedServings) ? normalizedServings : null,
      frequency || '',
      time_of_day || '',
      notes || '',
      is_active !== undefined ? is_active : 1,
      req.params.id,
      req.user.userId
    ],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update supplement' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Supplement not found' });
      }
      db.get('SELECT * FROM supplements WHERE id = ? AND user_id = ?', [req.params.id, req.user.userId], (fetchErr, row) => {
        if (fetchErr || !row) {
          return res.json({ message: 'Supplement updated successfully' });
        }
        res.json(normalizeSupplementRecord(row));
      });
    }
  );
});

// DELETE /supplements/:id - Delete a supplement
app.delete('/supplements/:id', authenticateToken, (req, res) => {
  db.run(
    'DELETE FROM supplement_group_memberships WHERE supplement_id = ? AND user_id = ?',
    [req.params.id, req.user.userId],
    (membershipErr) => {
      if (membershipErr) {
        return res.status(500).json({ error: 'Failed to clean supplement group memberships' });
      }

      db.run(
        'DELETE FROM supplements WHERE id = ? AND user_id = ?',
        [req.params.id, req.user.userId],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to delete supplement' });
          }
          if (this.changes === 0) {
            return res.status(404).json({ error: 'Supplement not found' });
          }
          res.json({ message: 'Supplement deleted successfully' });
        }
      );
    }
  );
});

// POST /supplements/:id/log - Log a supplement dose
app.post('/supplements/:id/log', authenticateToken, (req, res) => {
  const supplementId = req.params.id;
  const { notes, taken_at } = req.body || {};

  const id = uuidv4();
  const takenAt = taken_at || new Date().toISOString();

  db.run(
    'INSERT INTO supplement_logs (id, supplement_id, user_id, taken_at, notes) VALUES (?, ?, ?, ?, ?)',
    [id, supplementId, req.user.userId, takenAt, notes || ''],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to log supplement' });
      }
      res.json({ message: 'Supplement logged successfully' });
    }
  );
});

// GET /supplements/:id/logs - Get logs for a specific supplement
app.get('/supplements/:id/logs', authenticateToken, (req, res) => {
  const { limit = 50, offset = 0 } = req.query;

  db.all(
    `SELECT l.*, s.dose_amount, s.dose_unit, s.count_per_dose, s.count_unit, s.strength_amount, s.strength_unit, s.strength_basis, s.total_dose_amount, s.total_dose_unit
     FROM supplement_logs l
     JOIN supplements s ON s.id = l.supplement_id
     WHERE l.supplement_id = ? AND l.user_id = ?
     ORDER BY taken_at DESC
     LIMIT ? OFFSET ?`,
    [req.params.id, req.user.userId, parseInt(limit), parseInt(offset)],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch supplement logs' });
      }
      res.json(rows.map((row) => ({
        ...row,
        supplement: normalizeSupplementRecord(row)
      })));
    }
  );
});

// DELETE /supplements/:id/logs/:logId - Remove a supplement log entry
app.delete('/supplements/:id/logs/:logId', authenticateToken, (req, res) => {
  db.run(
    `DELETE FROM supplement_logs
     WHERE id = ? AND supplement_id = ? AND user_id = ?`,
    [req.params.logId, req.params.id, req.user.userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to delete supplement log' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Supplement log not found' });
      }

      res.json({ message: 'Supplement log deleted successfully' });
    }
  );
});

// ============================================
// MEALS API
// ============================================

// GET /meals - Get meals for a specific date
app.get('/meals', authenticateToken, (req, res) => {
  const { date } = req.query;
  const queryDate = date || new Date().toISOString().split('T')[0];
  
  db.all(
    `SELECT * FROM meals 
     WHERE user_id = ? 
     AND date(logged_at) = date(?)
     ORDER BY logged_at DESC`,
    [req.user.userId, queryDate],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch meals' });
      }
      
      // Group by meal type
      const grouped = { breakfast: [], lunch: [], dinner: [], snack: [] };
      const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
      
      rows.forEach(row => {
        const type = row.meal_type || 'snack';
        if (!grouped[type]) grouped[type] = [];
        grouped[type].push(row);
        
        totals.calories += row.calories || 0;
        totals.protein += row.protein || 0;
        totals.carbs += row.carbs || 0;
        totals.fat += row.fat || 0;
      });
      
      res.json({ date: queryDate, meals: grouped, totals });
    }
  );
});

// POST /meals - Add a meal
app.post('/meals', authenticateToken, (req, res) => {
  const { meal_type, food_name, calories, protein, carbs, fat, logged_at } = req.body;
  
  if (!meal_type || !food_name || calories === undefined) {
    return res.status(400).json({ error: 'meal_type, food_name, and calories are required' });
  }
  
  const id = uuidv4();
  
  db.run(
    'INSERT INTO meals (id, user_id, meal_type, food_name, calories, protein, carbs, fat, logged_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, req.user.userId, meal_type, food_name, calories, protein || 0, carbs || 0, fat || 0, logged_at || new Date().toISOString()],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to add meal' });
      }
      res.status(201).json({ id, message: 'Meal added successfully' });
    }
  );
});

// PUT /meals/:id - Update a meal
app.put('/meals/:id', authenticateToken, (req, res) => {
  const { meal_type, food_name, calories, protein, carbs, fat } = req.body;
  
  if (!meal_type || !food_name || calories === undefined) {
    return res.status(400).json({ error: 'meal_type, food_name, and calories are required' });
  }
  
  db.run(
    'UPDATE meals SET meal_type = ?, food_name = ?, calories = ?, protein = ?, carbs = ?, fat = ? WHERE id = ? AND user_id = ?',
    [meal_type, food_name, calories, protein || 0, carbs || 0, fat || 0, req.params.id, req.user.userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update meal' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Meal not found' });
      }
      res.json({ message: 'Meal updated successfully' });
    }
  );
});

// DELETE /meals/:id - Delete a meal
app.delete('/meals/:id', authenticateToken, (req, res) => {
  db.run(
    'DELETE FROM meals WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to delete meal' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Meal not found' });
      }
      res.json({ message: 'Meal deleted successfully' });
    }
  );
});

// GET /meals/frequent-foods - Get frequently logged foods
app.get('/meals/frequent-foods', authenticateToken, (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const mealType = req.query.meal_type;
  const params = [req.user.userId];
  let sql = `SELECT food_name, calories, protein, carbs, fat, meal_type, COUNT(*) as count
     FROM meals 
     WHERE user_id = ?`;

  if (mealType) {
    sql += ' AND meal_type = ?';
    params.push(mealType);
  }

  sql += `
     GROUP BY food_name, calories, protein, carbs, fat, meal_type
     ORDER BY count DESC, MAX(logged_at) DESC
     LIMIT ?`;
  params.push(limit);
  
  db.all(
    sql,
    params,
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch frequent foods' });
      }
      res.json(rows);
    }
  );
});

// POST /meals/copy - Copy meals from one date to another
app.post('/meals/copy', authenticateToken, (req, res) => {
  const { source_date, target_date } = req.body;
  
  if (!source_date || !target_date) {
    return res.status(400).json({ error: 'source_date and target_date are required' });
  }
  
  // Get meals from source date
  db.all(
    `SELECT meal_type, food_name, calories, protein, carbs, fat
     FROM meals 
     WHERE user_id = ? AND date(logged_at) = date(?)`,
    [req.user.userId, source_date],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch meals to copy' });
      }
      
      if (rows.length === 0) {
        return res.status(404).json({ error: 'No meals found for source date' });
      }
      
      // Insert meals for target date
      const insertPromises = rows.map(row => {
        return new Promise((resolve, reject) => {
          const id = uuidv4();
          db.run(
            'INSERT INTO meals (id, user_id, meal_type, food_name, calories, protein, carbs, fat, logged_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, req.user.userId, row.meal_type, row.food_name, row.calories, row.protein, row.carbs, row.fat, target_date + ' 12:00:00'],
            function(err) {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      });
      
      Promise.all(insertPromises)
        .then(() => res.json({ message: 'Meals copied successfully', count: rows.length }))
        .catch(err => res.status(500).json({ error: 'Failed to copy meals' }));
    }
  );
});

// ============================================
// BLOOD RESULTS API
// ============================================

// GET /blood-results - Get all blood test results for the authenticated user
app.get('/blood-results', authenticateToken, (req, res) => {
  db.all(
    'SELECT * FROM blood_results WHERE user_id = ? ORDER BY test_date DESC',
    [req.user.userId],
    (err, rows) => {
      if (err) {
        console.error('Error fetching blood results:', err);
        return res.status(500).json({ error: 'Failed to fetch blood results' });
      }
      // Parse markers JSON for each row
      const results = rows.map(row => ({
        ...row,
        markers: row.markers ? JSON.parse(row.markers) : {}
      }));
      res.json(results);
    }
  );
});

// GET /blood-results/:id - Get a specific blood test result
app.get('/blood-results/:id', authenticateToken, (req, res) => {
  db.get(
    'SELECT * FROM blood_results WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.userId],
    (err, row) => {
      if (err) {
        console.error('Error fetching blood result:', err);
        return res.status(500).json({ error: 'Failed to fetch blood result' });
      }
      if (!row) {
        return res.status(404).json({ error: 'Blood result not found' });
      }
      // Parse markers JSON
      const result = {
        ...row,
        markers: row.markers ? JSON.parse(row.markers) : {}
      };
      res.json(result);
    }
  );
});

// POST /blood-results - Create a new blood test result
app.post('/blood-results', authenticateToken, (req, res) => {
  const { test_date, lab_name, markers, notes } = req.body;

  if (!test_date) {
    return res.status(400).json({ error: 'test_date is required' });
  }

  const id = uuidv4();
  const markersJson = markers ? JSON.stringify(markers) : null;

  db.run(
    'INSERT INTO blood_results (id, user_id, test_date, lab_name, markers, notes) VALUES (?, ?, ?, ?, ?, ?)',
    [id, req.user.userId, test_date, lab_name || null, markersJson, notes || null],
    function(err) {
      if (err) {
        console.error('Error creating blood result:', err);
        return res.status(500).json({ error: 'Failed to create blood result' });
      }
      res.status(201).json({ id, message: 'Blood result created successfully' });
    }
  );
});

// POST /blood-results/:id/analyze - Analyze a blood test result
app.post('/blood-results/:id/analyze', authenticateToken, (req, res) => {
  const resultId = req.params.id;

  // First, get the blood result to ensure it exists and belongs to the user
  db.get(
    'SELECT * FROM blood_results WHERE id = ? AND user_id = ?',
    [resultId, req.user.userId],
    (err, row) => {
      if (err) {
        console.error('Error fetching blood result for analysis:', err);
        return res.status(500).json({ error: 'Failed to fetch blood result' });
      }
      if (!row) {
        return res.status(404).json({ error: 'Blood result not found' });
      }

      // Placeholder analysis - in the future, this could integrate with an AI service
      const placeholderAnalysis = 'Analysis pending. AI-powered blood result analysis will be available in a future update.';

      // Update the record with the analysis
      db.run(
        'UPDATE blood_results SET analysis = ? WHERE id = ? AND user_id = ?',
        [placeholderAnalysis, resultId, req.user.userId],
        function(err) {
          if (err) {
            console.error('Error saving analysis:', err);
            return res.status(500).json({ error: 'Failed to save analysis' });
          }

          res.json({
            id: resultId,
            analysis: placeholderAnalysis,
            message: 'Analysis completed'
          });
        }
      );
    }
  );
});

// DELETE /blood-results/:id - Delete a blood test result
app.delete('/blood-results/:id', authenticateToken, (req, res) => {
  db.run(
    'DELETE FROM blood_results WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.userId],
    function(err) {
      if (err) {
        console.error('Error deleting blood result:', err);
        return res.status(500).json({ error: 'Failed to delete blood result' });
      }

      if (!this.changes) {
        return res.status(404).json({ error: 'Blood result not found' });
      }

      res.json({ message: 'Blood result deleted successfully' });
    }
  );
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`PeptiFit API server running on port ${PORT}`);
});
