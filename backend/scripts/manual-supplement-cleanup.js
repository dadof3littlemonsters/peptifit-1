const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const databasePath = path.join(__dirname, '..', 'data', 'peptifit.sqlite');
const db = new sqlite3.Database(databasePath);

const updates = [
  {
    name: 'Iron Bisglycinate with Vitamin C',
    values: {
      dosage: '28 mg',
      dose_amount: 1,
      dose_unit: 'tablet',
      count_per_dose: 1,
      count_unit: 'tablet',
      strength_amount: 28,
      strength_unit: 'mg',
      strength_basis: 'per tablet',
      total_dose_amount: 28,
      total_dose_unit: 'mg',
      servings_per_container: 360,
      time_of_day: 'evening',
      notes: 'Iron 28 mg per tablet. Vitamin C 200 mg per tablet.'
    }
  },
  {
    name: 'Omega 3 Fish Oil',
    values: {
      dosage: '4000 mg',
      dose_amount: 2,
      dose_unit: 'softgels',
      count_per_dose: 2,
      count_unit: 'softgel',
      strength_amount: 2000,
      strength_unit: 'mg',
      strength_basis: 'per 2 softgels',
      total_dose_amount: 4000,
      total_dose_unit: 'mg',
      frequency: 'twice_daily',
      time_of_day: 'morning|evening',
      notes: 'Per serving (2 softgels): fish oil 2000 mg; omega-3 total 1100 mg; EPA 660 mg; DHA 440 mg. Full daily total (4 softgels): fish oil 4000 mg; omega-3 total 2200 mg; EPA 1320 mg; DHA 880 mg.'
    }
  },
  {
    name: 'Vitamin E',
    values: {
      dosage: '400 IU',
      dose_amount: 1,
      dose_unit: 'softgel',
      count_per_dose: 1,
      count_unit: 'softgel',
      strength_amount: 400,
      strength_unit: 'IU',
      strength_basis: 'per softgel',
      total_dose_amount: 400,
      total_dose_unit: 'IU',
      time_of_day: 'morning',
      notes: 'Vitamin E 400 IU per softgel (268 mg alpha-TE). Mixed tocopherols 24 mg.'
    }
  }
];

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }

      resolve(this);
    });
  });
}

function all(sql, params = []) {
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

async function main() {
  for (const update of updates) {
    const columns = Object.keys(update.values);
    const assignments = columns.map((column) => `${column} = ?`).join(', ');
    const params = [...columns.map((column) => update.values[column]), update.name];
    const result = await run(`UPDATE supplements SET ${assignments} WHERE name = ? AND is_active = 1`, params);

    if (result.changes !== 1) {
      throw new Error(`Expected to update exactly one active supplement row for ${update.name}, updated ${result.changes}`);
    }
  }

  const rows = await all(
    `SELECT id, name, brand, dosage, dose_amount, dose_unit, count_per_dose, count_unit, strength_amount, strength_unit, strength_basis, total_dose_amount, total_dose_unit, servings_per_container, frequency, time_of_day, notes
     FROM supplements
     WHERE name IN (?, ?, ?)
     ORDER BY lower(name)`,
    updates.map((update) => update.name)
  );

  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
