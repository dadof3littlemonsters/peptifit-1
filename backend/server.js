const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const path = require('path');

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

// Peptides routes
app.get('/peptides', authenticateToken, (req, res) => {
  db.all('SELECT * FROM peptides ORDER BY name', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch peptides' });
    }
    res.json(rows);
  });
});

app.get('/peptides/:id', authenticateToken, (req, res) => {
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

// Peptide doses routes
app.post('/doses', authenticateToken, (req, res) => {
  const { peptide_id, dose_amount, dose_unit, administration_time, injection_site, notes } = req.body;

  if (!peptide_id || !dose_amount || !dose_unit || !administration_time) {
    return res.status(400).json({ error: 'Peptide ID, dose amount, unit, and administration time are required' });
  }

  const doseId = uuidv4();
  db.run(
    'INSERT INTO peptide_doses (id, user_id, peptide_id, dose_amount, dose_unit, administration_time, injection_site, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [doseId, req.user.userId, peptide_id, dose_amount, dose_unit, administration_time, injection_site, notes],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to record dose' });
      }
      res.status(201).json({ id: doseId, message: 'Dose recorded successfully' });
    }
  );
});

app.get('/doses', authenticateToken, (req, res) => {
  const query = `
    SELECT 
      d.*,
      p.name as peptide_name
    FROM peptide_doses d
    JOIN peptides p ON d.peptide_id = p.id
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
      p.name as peptide_name
    FROM peptide_doses d
    JOIN peptides p ON d.peptide_id = p.id
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

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`PeptiFit API server running on port ${PORT}`);
});
