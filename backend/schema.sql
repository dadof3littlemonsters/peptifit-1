-- PeptiFit Unified Database Schema
-- Supports: Peptides, Supplements, Vitals, Blood Results
-- SQLite with JSON1 extension support

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- ============================================
-- CORE TABLES
-- ============================================

-- Users table (extended from existing)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    profile JSON DEFAULT '{}', -- {first_name, last_name, date_ofbirth, gender, height_cm, target_weight_kg}
    preferences JSON DEFAULT '{}', -- {timezone, date_format, units_system}
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- PEPTIDES MODULE
-- ============================================

-- Master peptide library (enhanced from existing)
CREATE TABLE IF NOT EXISTS peptides (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    
    -- Standardized dosing info
    typical_dose_min REAL,
    typical_dose_max REAL,
    dose_unit TEXT NOT NULL, -- mg, mcg, IU, ml
    
    -- Administration
    administration_route TEXT NOT NULL, -- subcutaneous, intramuscular, nasal, topical
    administration_sites JSON, -- ["abdomen", "thigh", "upper_arm"]
    
    -- Schedule patterns supported
    frequency_options JSON, -- ["daily", "eod", "weekly", "biweekly", "custom"]
    half_life_hours REAL, -- for pharmacokinetic calculations
    
    -- Storage
    storage_requirements TEXT,
    reconstitution_stable_days INTEGER, -- null if not applicable
    
    -- Research/category
    category TEXT, -- weight_management, cognitive, immune, tissue_repair, etc.
    mechanism TEXT, -- brief mechanism of action
    research_status TEXT, -- fda_approved, clinical_trials, research_only
    
    -- Links
    reference_links JSON, -- [{title, url}]
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User's peptide prescriptions/regimens
CREATE TABLE IF NOT EXISTS peptide_regimens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    peptide_id TEXT NOT NULL,
    
    -- Dosing
    dose_amount REAL NOT NULL,
    dose_unit TEXT NOT NULL,
    
    -- Complex schedule (stored as JSON for flexibility)
    schedule_config JSON NOT NULL, -- see examples below
    
    -- Schedule types supported:
    -- {
    --   "type": "daily" | "weekly" | "custom_days" | "cycling" | "prn",
    --   
    --   -- For daily:
    --   "times": ["08:00", "20:00"], -- BID example
    --   
    --   -- For weekly:
    --   "day_time": [{"day": 1, "time": "08:00"}], -- Monday
    --   
    --   -- For custom_days:
    --   "days": [1, 3, 5], -- Mon, Wed, Fri
    --   "time": "08:00",
    --   
    --   -- For cycling:
    --   "cycle_days_on": 5,
    --   "cycle_days_off": 2,
    --   "time": "08:00",
    --   
    --   -- For prn (as needed):
    --   "max_daily": 3,
    --   "min_hours_between": 4
    -- }
    
    -- Status
    status TEXT DEFAULT 'active', -- active, paused, completed, discontinued
    start_date DATE NOT NULL,
    end_date DATE, -- null for ongoing
    
    -- Context
    prescribed_by TEXT, -- doctor name or "self"
    purpose TEXT, -- why taking this
    notes TEXT,
    
    -- Reminders
    reminder_enabled BOOLEAN DEFAULT 1,
    reminder_minutes_before INTEGER DEFAULT 15,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (peptide_id) REFERENCES peptides (id) ON DELETE RESTRICT
);

-- Individual dose logging
CREATE TABLE IF NOT EXISTS peptide_doses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    regimen_id TEXT, -- optional link to regimen
    peptide_id TEXT NOT NULL,
    
    -- Dose details
    dose_amount REAL NOT NULL,
    dose_unit TEXT NOT NULL,
    batch_lot TEXT, -- for tracking specific vials
    
    -- Administration
    administered_at DATETIME NOT NULL,
    scheduled_for DATETIME, -- when it was scheduled (if tracking adherence)
    injection_site TEXT, -- abdomen_left, abdomen_right, thigh_left, etc.
    
    -- Context
    notes TEXT,
    mood_energy INTEGER CHECK (mood_energy BETWEEN 1 AND 5), -- subjective rating
    side_effects JSON, -- ["redness", "mild_nausea"]
    
    -- Source
    logged_via TEXT DEFAULT 'manual', -- manual, reminder, import
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (regimen_id) REFERENCES peptide_regimens (id) ON DELETE SET NULL,
    FOREIGN KEY (peptide_id) REFERENCES peptides (id) ON DELETE RESTRICT
);

-- ============================================
-- SUPPLEMENTS MODULE
-- ============================================

-- Master supplement library
CREATE TABLE IF NOT EXISTS supplements (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    brand TEXT,
    form TEXT NOT NULL, -- capsule, tablet, powder, liquid, gummy
    
    -- Standard dosing info
    serving_size REAL,
    serving_unit TEXT, -- mg, g, IU, ml, capsule, scoop
    servings_per_container INTEGER,
    
    -- Nutritional info (flexible)
    ingredients JSON, -- [{"name": "Vitamin D3", "amount": 2000, "unit": "IU"}]
    
    -- Categories
    category TEXT, -- vitamin, mineral, herb, amino_acid, protein, probiotic
    subcategory TEXT, -- e.g., "b_complex", "omega_3"
    
    -- Quality
    certifications JSON, -- ["USP", "NSF", "GMP"]
    allergens JSON, -- ["soy", "dairy"]
    
    -- Storage
    storage_requirements TEXT,
    
    -- Reference
    barcode TEXT UNIQUE,
    reference_links JSON,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User's supplement regimens
CREATE TABLE IF NOT EXISTS supplement_regimens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    supplement_id TEXT NOT NULL,
    
    -- Dosing
    servings_per_dose REAL NOT NULL DEFAULT 1,
    dose_unit TEXT, -- serving, capsule, scoop, etc.
    
    -- Schedule
    schedule_config JSON NOT NULL, -- similar to peptide schedules
    take_with_food BOOLEAN,
    
    -- Status
    status TEXT DEFAULT 'active',
    start_date DATE NOT NULL,
    end_date DATE,
    
    -- Purpose
    purpose TEXT,
    notes TEXT,
    
    -- Reminders
    reminder_enabled BOOLEAN DEFAULT 1,
    reminder_minutes_before INTEGER DEFAULT 15,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (supplement_id) REFERENCES supplements (id) ON DELETE RESTRICT
);

-- Inventory tracking per container/bottle
CREATE TABLE IF NOT EXISTS supplement_inventory (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    supplement_id TEXT NOT NULL,
    regimen_id TEXT, -- optional link
    
    -- Container details
    container_name TEXT, -- e.g., "Bottle from Costco, March 2025"
    purchase_date DATE,
    expiry_date DATE,
    batch_lot TEXT,
    
    -- Quantity tracking
    initial_servings REAL NOT NULL,
    current_servings REAL NOT NULL,
    servings_unit TEXT, -- capsules, scoops, ml
    
    -- Reorder alerts
    reorder_threshold REAL DEFAULT 7, -- days worth remaining
    reorder_alert_sent BOOLEAN DEFAULT 0,
    reorder_url TEXT, -- where to buy
    
    -- Cost tracking (optional)
    purchase_price REAL,
    currency TEXT DEFAULT 'USD',
    
    -- Status
    status TEXT DEFAULT 'active', -- active, empty, expired, discarded
    finished_date DATE,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (supplement_id) REFERENCES supplements (id) ON DELETE RESTRICT,
    FOREIGN KEY (regimen_id) REFERENCES supplement_regimens (id) ON DELETE SET NULL
);

-- Individual dose logging
CREATE TABLE IF NOT EXISTS supplement_doses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    regimen_id TEXT,
    inventory_id TEXT, -- which bottle it came from
    supplement_id TEXT NOT NULL,
    
    -- Dose details
    servings_taken REAL NOT NULL,
    dose_unit TEXT,
    
    -- Timing
    taken_at DATETIME NOT NULL,
    scheduled_for DATETIME,
    
    -- Context
    taken_with_food BOOLEAN,
    notes TEXT,
    
    -- Inventory was auto-deducted
    inventory_deducted BOOLEAN DEFAULT 0,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (regimen_id) REFERENCES supplement_regimens (id) ON DELETE SET NULL,
    FOREIGN KEY (inventory_id) REFERENCES supplement_inventory (id) ON DELETE SET NULL,
    FOREIGN KEY (supplement_id) REFERENCES supplements (id) ON DELETE RESTRICT
);

-- ============================================
-- VITALS MODULE (Time-series data)
-- ============================================

-- Vital sign types lookup (extensible)
CREATE TABLE IF NOT EXISTS vital_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE, -- weight, blood_pressure_systolic, blood_glucose, etc.
    display_name TEXT NOT NULL,
    unit TEXT NOT NULL,
    unit_alt TEXT, -- alternative unit (e.g., kg for lbs)
    category TEXT NOT NULL, -- body_composition, cardiovascular, metabolic, sleep
    
    -- Validation rules
    normal_min REAL,
    normal_max REAL,
    critical_low REAL,
    critical_high REAL,
    
    -- Display
    decimals INTEGER DEFAULT 1,
    icon TEXT, -- emoji or icon name
    color TEXT, -- hex color for charts
    
    description TEXT,
    measurement_instructions TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Populate default vital types
INSERT OR IGNORE INTO vital_types (id, name, display_name, unit, category, normal_min, normal_max, decimals, icon, color) VALUES
('vt_weight', 'weight', 'Weight', 'kg', 'body_composition', NULL, NULL, 1, '⚖️', '#4CAF50'),
('vt_body_fat', 'body_fat_percent', 'Body Fat %', '%', 'body_composition', 10, 35, 1, '📊', '#FF9800'),
('vt_muscle_mass', 'muscle_mass', 'Muscle Mass', 'kg', 'body_composition', NULL, NULL, 1, '💪', '#2196F3'),
('vt_bp_sys', 'blood_pressure_systolic', 'Systolic BP', 'mmHg', 'cardiovascular', 90, 120, 0, '❤️', '#F44336'),
('vt_bp_dia', 'blood_pressure_diastolic', 'Diastolic BP', 'mmHg', 'cardiovascular', 60, 80, 0, '💓', '#E91E63'),
('vt_heart_rate', 'heart_rate', 'Heart Rate', 'bpm', 'cardiovascular', 60, 100, 0, '💗', '#9C27B0'),
('vt_glucose', 'blood_glucose', 'Blood Glucose', 'mg/dL', 'metabolic', 70, 100, 0, '🩸', '#00BCD4'),
('vt_hba1c', 'hba1c', 'HbA1c', '%', 'metabolic', 4, 5.7, 1, '📈', '#009688'),
('vt_calories_in', 'calories_consumed', 'Calories In', 'kcal', 'metabolic', NULL, NULL, 0, '🍽️', '#8BC34A'),
('vt_calories_out', 'calories_burned', 'Calories Out', 'kcal', 'metabolic', NULL, NULL, 0, '🔥', '#FF5722'),
('vt_sleep_hours', 'sleep_hours', 'Sleep Duration', 'hours', 'sleep', 7, 9, 1, '😴', '#3F51B5'),
('vt_sleep_score', 'sleep_score', 'Sleep Score', 'points', 'sleep', 70, 100, 0, '⭐', '#673AB8'),
('vt_o2_sat', 'oxygen_saturation', 'O2 Saturation', '%', 'cardiovascular', 95, 100, 0, '🫁', '#03A9F4'),
('vt_temp', 'body_temperature', 'Body Temperature', '°C', 'body_composition', 36.1, 37.2, 1, '🌡️', '#FFC107'),
('vt_water', 'water_intake', 'Water Intake', 'ml', 'metabolic', NULL, NULL, 0, '💧', '#2196F3');

-- Actual vital measurements (time-series)
CREATE TABLE IF NOT EXISTS vital_measurements (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    vital_type_id TEXT NOT NULL,
    
    -- Measurement value
    value_real REAL, -- for numeric values
    value_int INTEGER, -- for integers
    value_text TEXT, -- for categorical (e.g., sleep_quality: good/bad)
    
    -- Context
    measured_at DATETIME NOT NULL,
    measurement_context TEXT, -- fasting, post_workout, before_bed, morning, evening
    
    -- Device/source
    device_id TEXT, -- linked fitness device
    source TEXT DEFAULT 'manual', -- manual, apple_health, google_fit, fitbit, oura, etc.
    source_id TEXT, -- external ID for syncing
    
    -- Metadata
    notes TEXT,
    tags JSON, -- ["sick", "travel", "high_stress"]
    
    -- Location (optional)
    location_lat REAL,
    location_lon REAL,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (vital_type_id) REFERENCES vital_types (id) ON DELETE RESTRICT
);

-- Blood pressure needs special handling (systolic/diastolic pair)
CREATE TABLE IF NOT EXISTS blood_pressure_readings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    measurement_id TEXT UNIQUE, -- links to vital_measurements for systolic
    
    systolic INTEGER NOT NULL,
    diastolic INTEGER NOT NULL,
    pulse INTEGER, -- optional heart rate at time of reading
    
    position TEXT, -- sitting, standing, lying, after_exercise
    arm TEXT, -- left, right
    
    -- Irregular heartbeat detection
    irregular_heartbeat_detected BOOLEAN,
    
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (measurement_id) REFERENCES vital_measurements (id) ON DELETE CASCADE
);

-- User goals/targets for vitals
CREATE TABLE IF NOT EXISTS vital_goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    vital_type_id TEXT NOT NULL,
    
    -- Target
    target_value REAL,
    target_range_min REAL,
    target_range_max REAL,
    
    -- Timeframe
    goal_type TEXT, -- fixed_value, trend, maintenance
    deadline DATE,
    
    -- Status
    status TEXT DEFAULT 'active', -- active, achieved, abandoned
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (vital_type_id) REFERENCES vital_types (id) ON DELETE RESTRICT
);

-- ============================================
-- BLOOD RESULTS MODULE
-- ============================================

-- Lab/test panels (groups of markers)
CREATE TABLE IF NOT EXISTS lab_panels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL, -- "Comprehensive Metabolic Panel", "Hormone Panel"
    category TEXT NOT NULL, -- metabolic, hormonal, lipid, complete_blood_count, etc.
    description TEXT,
    common_markers JSON, -- ["glucose", "bun", "creatinine", ...]
    
    -- Typical frequency
    recommended_frequency_months INTEGER,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Populate common panels
INSERT OR IGNORE INTO lab_panels (id, name, category, description, common_markers) VALUES
('lp_cbc', 'Complete Blood Count', 'hematology', 'Basic blood cell counts', '["wbc", "rbc", "hemoglobin", "hematocrit", "platelets", "mcv", "mch", "mchc"]'),
('lp_cmp', 'Comprehensive Metabolic Panel', 'metabolic', 'Kidney, liver, electrolyte function', '["glucose", "bun", "creatinine", "sodium", "potassium", "chloride", "co2", "calcium", "protein", "albumin", "bilirubin", "alk_phos", "ast", "alt"]'),
('lp_lipid', 'Lipid Panel', 'lipid', 'Cholesterol and triglycerides', '["total_cholesterol", "ldl", "hdl", "triglycerides", "vldl"]'),
('lp_thyroid', 'Thyroid Panel', 'hormonal', 'Thyroid function tests', '["tsh", "t3", "t4", "free_t3", "free_t4", "reverse_t3", "tpo_antibodies"]'),
('lp_hormone_m', 'Male Hormone Panel', 'hormonal', 'Testosterone and related hormones', '["total_testosterone", "free_testosterone", "shbg", "estradiol", "lh", "fsh", "psa"]'),
('lp_hormone_f', 'Female Hormone Panel', 'hormonal', 'Estrogen, progesterone, and related', '["estradiol", "progesterone", "total_testosterone", "free_testosterone", "shbg", "lh", "fsh", "dhea_s"]'),
('lp_inflammation', 'Inflammation Markers', 'inflammatory', 'Systemic inflammation indicators', '["crp", "hs_crp", "esr", "ferritin", "homocysteine"]'),
('lp_diabetes', 'Diabetes Panel', 'metabolic', 'Blood sugar control markers', '["glucose", "hba1c", "insulin", "c_peptide"]'),
('lp_nutrient', 'Nutrient Panel', 'nutritional', 'Vitamin and mineral levels', '["vitamin_d", "b12", "folate", "iron", "ferritin", "magnesium", "zinc"]');

-- Master marker reference (comprehensive list)
CREATE TABLE IF NOT EXISTS lab_markers (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE, -- short code like "GLU", "TSH"
    name TEXT NOT NULL,
    alternate_names JSON, -- ["Glucose", "Blood Sugar"]
    
    category TEXT NOT NULL, -- metabolic, hormonal, lipid, etc.
    
    -- Reference ranges (adult male/female)
    unit TEXT NOT NULL,
    ref_range_low_m REAL,
    ref_range_high_m REAL,
    ref_range_low_f REAL,
    ref_range_high_f REAL,
    ref_range_text TEXT, -- for complex ranges
    
    -- Critical values
    critical_low REAL,
    critical_high REAL,
    
    -- Optimal ranges (different from reference)
    optimal_low REAL,
    optimal_high REAL,
    
    -- Display
    decimals INTEGER DEFAULT 1,
    description TEXT,
    clinical_significance TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User's blood test records
CREATE TABLE IF NOT EXISTS blood_tests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    
    -- Test metadata
    test_date DATE NOT NULL,
    lab_name TEXT, -- "Quest Diagnostics", "LabCorp"
    provider_name TEXT, -- ordering physician
    
    -- Panels included
    panels_tested JSON, -- ["lp_cmp", "lp_lipid"]
    
    -- Document
    document_url TEXT, -- path to uploaded PDF/image
    document_type TEXT, -- pdf, image
    ocr_text TEXT, -- extracted text from document
    
    -- AI Analysis
    ai_analysis_status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    ai_summary TEXT, -- generated summary
    ai_findings JSON, -- [{"marker": "glucose", "finding": "elevated", "recommendation": "..."}]
    ai_confidence REAL, -- 0-1 confidence score
    ai_processed_at DATETIME,
    
    -- Fasting status
    fasting_hours INTEGER,
    was_fasting BOOLEAN,
    
    -- Notes
    notes TEXT,
    symptoms_at_time TEXT,
    medications_at_time TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Individual marker results from tests
CREATE TABLE IF NOT EXISTS blood_marker_results (
    id TEXT PRIMARY KEY,
    test_id TEXT NOT NULL,
    marker_id TEXT NOT NULL,
    
    -- Value
    value_real REAL,
    value_text TEXT, -- for qualitative results like "Negative", "Positive"
    
    -- Interpretation at time of test
    unit TEXT NOT NULL,
    reference_range_low REAL,
    reference_range_high REAL,
    
    -- Flag
    flag TEXT, -- normal, low, high, critical_low, critical_high, borderline
    
    -- Previous comparison
    previous_value REAL,
    trend TEXT, -- improving, worsening, stable, new
    change_percent REAL,
    
    -- Source extraction
    extracted_from_ocr BOOLEAN DEFAULT 0,
    ocr_confidence REAL,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (test_id) REFERENCES blood_tests (id) ON DELETE CASCADE,
    FOREIGN KEY (marker_id) REFERENCES lab_markers (id) ON DELETE RESTRICT
);

-- AI analysis history/versions
CREATE TABLE IF NOT EXISTS blood_test_ai_analysis (
    id TEXT PRIMARY KEY,
    test_id TEXT NOT NULL,
    
    model_version TEXT, -- which AI model version
    analysis_type TEXT, -- summary, trends, recommendations, full_review
    
    input_tokens INTEGER,
    output_tokens INTEGER,
    
    raw_response TEXT, -- full AI response
    structured_findings JSON,
    
    user_feedback TEXT, -- thumbs up/down, corrections
    corrected_findings JSON, -- user-corrected data
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (test_id) REFERENCES blood_tests (id) ON DELETE CASCADE
);

-- ============================================
-- CROSS-MODULE FEATURES
-- ============================================

-- Correlations/cross-analysis cache
CREATE TABLE IF NOT EXISTS health_correlations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    
    -- What we're correlating
    factor_a_type TEXT NOT NULL, -- peptide, supplement, vital
    factor_a_id TEXT NOT NULL,
    factor_b_type TEXT NOT NULL, -- vital, marker
    factor_b_id TEXT NOT NULL,
    
    -- Analysis results
    correlation_coefficient REAL,
    confidence_score REAL,
    time_lag_days INTEGER, -- e.g., peptide takes 7 days to affect marker
    
    -- Calculated from data range
    data_points INTEGER,
    date_range_start DATE,
    date_range_end DATE,
    
    -- Human interpretation
    interpretation TEXT,
    is_significant BOOLEAN,
    
    calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- User notes/journal (can reference any module)
CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    
    entry_date DATE NOT NULL,
    entry_type TEXT DEFAULT 'general', -- general, protocol_start, side_effect, milestone
    
    title TEXT,
    content TEXT NOT NULL,
    
    -- Links to related records
    related_peptide_regimen_id TEXT,
    related_supplement_regimen_id TEXT,
    related_blood_test_id TEXT,
    
    -- Tags
    tags JSON, -- ["energy", "sleep", "mood"]
    
    -- Mood tracking
    mood_score INTEGER CHECK (mood_score BETWEEN 1 AND 10),
    energy_score INTEGER CHECK (energy_score BETWEEN 1 AND 10),
    sleep_quality INTEGER CHECK (sleep_quality BETWEEN 1 AND 10),
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (related_peptide_regimen_id) REFERENCES peptide_regimens (id) ON DELETE SET NULL,
    FOREIGN KEY (related_supplement_regimen_id) REFERENCES supplement_regimens (id) ON DELETE SET NULL,
    FOREIGN KEY (related_blood_test_id) REFERENCES blood_tests (id) ON DELETE SET NULL
);

-- Notifications/reminders queue
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    
    -- What triggered this
    source_type TEXT NOT NULL, -- peptide_dose, supplement_dose, vital_goal, inventory, system
    source_id TEXT,
    
    -- Content
    notification_type TEXT NOT NULL, -- reminder, alert, achievement, info
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    
    -- Timing
    scheduled_for DATETIME NOT NULL,
    sent_at DATETIME,
    read_at DATETIME,
    
    -- Delivery
    channels JSON DEFAULT '["push", "email"]', -- push, email, sms
    delivery_status TEXT DEFAULT 'pending', -- pending, sent, failed, delivered, read
    
    -- Actions
    action_url TEXT,
    action_taken BOOLEAN DEFAULT 0,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- User-scoped queries
CREATE INDEX IF NOT EXISTS idx_peptide_regimens_user ON peptide_regimens(user_id, status);
CREATE INDEX IF NOT EXISTS idx_peptide_doses_user_time ON peptide_doses(user_id, administered_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplement_regimens_user ON supplement_regimens(user_id, status);
CREATE INDEX IF NOT EXISTS idx_supplement_doses_user_time ON supplement_doses(user_id, taken_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplement_inventory_user ON supplement_inventory(user_id, status);
CREATE INDEX IF NOT EXISTS idx_vitals_user_type_time ON vital_measurements(user_id, vital_type_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_blood_tests_user_date ON blood_tests(user_id, test_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_user_date ON journal_entries(user_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_scheduled ON notifications(user_id, scheduled_for, delivery_status);

-- Lookups
CREATE INDEX IF NOT EXISTS idx_peptide_doses_regimen ON peptide_doses(regimen_id);
CREATE INDEX IF NOT EXISTS idx_supplement_doses_regimen ON supplement_doses(regimen_id);
CREATE INDEX IF NOT EXISTS idx_supplement_doses_inventory ON supplement_doses(inventory_id);
CREATE INDEX IF NOT EXISTS idx_marker_results_test ON blood_marker_results(test_id);
CREATE INDEX IF NOT EXISTS idx_bp_readings_measurement ON blood_pressure_readings(measurement_id);

-- Time-series range queries
CREATE INDEX IF NOT EXISTS idx_peptide_doses_time ON peptide_doses(administered_at);
CREATE INDEX IF NOT EXISTS idx_vitals_time ON vital_measurements(measured_at);
CREATE INDEX IF NOT EXISTS idx_supplement_doses_time ON supplement_doses(taken_at);

-- JSON queries (SQLite JSON1 extension)
CREATE INDEX IF NOT EXISTS idx_peptide_regimens_schedule ON peptide_regimens(json_extract(schedule_config, '$.type'));
CREATE INDEX IF NOT EXISTS idx_supplement_regimens_schedule ON supplement_regimens(json_extract(schedule_config, '$.type'));

-- Foreign key indexes (for joins)
CREATE INDEX IF NOT EXISTS idx_peptide_doses_peptide ON peptide_doses(peptide_id);
CREATE INDEX IF NOT EXISTS idx_supplement_doses_supplement ON supplement_doses(supplement_id);
CREATE INDEX IF NOT EXISTS idx_blood_tests_panels ON blood_tests(json_each(panels_tested)) 
    WHERE json_array_length(panels_tested) > 0;

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- Daily adherence summary
CREATE VIEW IF NOT EXISTS v_daily_adherence AS
SELECT 
    user_id,
    date(administered_at) as dose_date,
    COUNT(*) as doses_logged,
    COUNT(DISTINCT peptide_id) as unique_peptides,
    SUM(CASE WHEN regimen_id IS NOT NULL THEN 1 ELSE 0 END) as scheduled_doses,
    SUM(CASE WHEN scheduled_for IS NOT NULL THEN 1 ELSE 0 END) as on_time_doses
FROM peptide_doses
GROUP BY user_id, date(administered_at);

-- Current inventory status with days remaining
CREATE VIEW IF NOT EXISTS v_inventory_status AS
SELECT 
    i.*,
    s.name as supplement_name,
    r.servings_per_dose as daily_servings,
    CASE 
        WHEN r.servings_per_dose > 0 THEN ROUND(i.current_servings / r.servings_per_dose, 1)
        ELSE NULL 
    END as days_remaining,
    CASE 
        WHEN r.servings_per_dose > 0 AND (i.current_servings / r.servings_per_dose) <= i.reorder_threshold 
        THEN 1 ELSE 0 
    END as needs_reorder
FROM supplement_inventory i
JOIN supplements s ON i.supplement_id = s.id
LEFT JOIN supplement_regimens r ON i.regimen_id = r.id
WHERE i.status = 'active';

-- Latest vitals snapshot per user
CREATE VIEW IF NOT EXISTS v_latest_vitals AS
SELECT 
    vm.user_id,
    vm.vital_type_id,
    vt.display_name,
    vm.value_real,
    vm.value_int,
    vm.value_text,
    vt.unit,
    vm.measured_at,
    ROW_NUMBER() OVER (PARTITION BY vm.user_id, vm.vital_type_id ORDER BY vm.measured_at DESC) as rn
FROM vital_measurements vm
JOIN vital_types vt ON vm.vital_type_id = vt.id
WHERE rn = 1;

-- ============================================
-- TRIGGERS FOR DATA INTEGRITY
-- ============================================

-- Auto-update timestamp trigger
CREATE TRIGGER IF NOT EXISTS update_users_timestamp 
AFTER UPDATE ON users
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_peptide_regimens_timestamp 
AFTER UPDATE ON peptide_regimens
BEGIN
    UPDATE peptide_regimens SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_supplement_regimens_timestamp 
AFTER UPDATE ON supplement_regimens
BEGIN
    UPDATE supplement_regimens SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Auto-deduct inventory on supplement dose
CREATE TRIGGER IF NOT EXISTS deduct_supplement_inventory
AFTER INSERT ON supplement_doses
WHEN NEW.inventory_id IS NOT NULL
BEGIN
    UPDATE supplement_inventory 
    SET current_servings = MAX(0, current_servings - NEW.servings_taken),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.inventory_id;
    
    -- Mark as deducted
    UPDATE supplement_doses SET inventory_deducted = 1 WHERE id = NEW.id;
END;

-- Insert default peptide library if empty
-- (This would be done in application code for flexibility)
