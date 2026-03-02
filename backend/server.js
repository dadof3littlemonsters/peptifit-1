const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const path = require('path');
const createFoodRouter = require('./routes/food');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'peptifit-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());

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
    dosage TEXT,
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
});

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

app.use('/food', createFoodRouter({ db, authenticateToken, uuidv4 }));

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
      res.json(rows);
    }
  );
});

// POST /supplements - Create a new supplement
app.post('/supplements', authenticateToken, (req, res) => {
  const { name, dosage, frequency, time_of_day, notes } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Supplement name is required' });
  }

  const id = uuidv4();

  db.run(
    'INSERT INTO supplements (id, user_id, name, dosage, frequency, time_of_day, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, req.user.userId, name, dosage || '', frequency || '', time_of_day || '', notes || ''],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to create supplement' });
      }
      res.status(201).json({ id, message: 'Supplement created successfully' });
    }
  );
});

// PUT /supplements/:id - Update an existing supplement
app.put('/supplements/:id', authenticateToken, (req, res) => {
  const { name, dosage, frequency, time_of_day, notes, is_active } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Supplement name is required' });
  }

  db.run(
    'UPDATE supplements SET name = ?, dosage = ?, frequency = ?, time_of_day = ?, notes = ?, is_active = ? WHERE id = ? AND user_id = ?',
    [name, dosage || '', frequency || '', time_of_day || '', notes || '', is_active !== undefined ? is_active : 1, req.params.id, req.user.userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update supplement' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Supplement not found' });
      }
      res.json({ message: 'Supplement updated successfully' });
    }
  );
});

// DELETE /supplements/:id - Delete a supplement
app.delete('/supplements/:id', authenticateToken, (req, res) => {
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
});

// POST /supplements/:id/log - Log a supplement dose
app.post('/supplements/:id/log', authenticateToken, (req, res) => {
  const supplementId = req.params.id;
  const { notes } = req.body;

  const id = uuidv4();
  const takenAt = new Date().toISOString();

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
    `SELECT * FROM supplement_logs
     WHERE supplement_id = ? AND user_id = ?
     ORDER BY taken_at DESC
     LIMIT ? OFFSET ?`,
    [req.params.id, req.user.userId, parseInt(limit), parseInt(offset)],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch supplement logs' });
      }
      res.json(rows);
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
  const { meal_type, food_name, calories, protein, carbs, fat } = req.body;
  
  if (!meal_type || !food_name || calories === undefined) {
    return res.status(400).json({ error: 'meal_type, food_name, and calories are required' });
  }
  
  const id = uuidv4();
  
  db.run(
    'INSERT INTO meals (id, user_id, meal_type, food_name, calories, protein, carbs, fat) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, req.user.userId, meal_type, food_name, calories, protein || 0, carbs || 0, fat || 0],
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
  
  db.all(
    `SELECT food_name, calories, protein, carbs, fat, COUNT(*) as count
     FROM meals 
     WHERE user_id = ?
     GROUP BY food_name, calories
     ORDER BY count DESC, MAX(logged_at) DESC
     LIMIT ?`,
    [req.user.userId, limit],
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

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`PeptiFit API server running on port ${PORT}`);
});
