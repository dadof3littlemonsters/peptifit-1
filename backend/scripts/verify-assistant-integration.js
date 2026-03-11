const baseUrl = (process.env.PEPTIFIT_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const assistantKey = process.env.ASSISTANT_API_KEY;
const assistantUserId = process.env.ASSISTANT_USER_ID || '';
const runTag = `assistant-test-${Date.now()}`;

if (!assistantKey) {
  console.error('ASSISTANT_API_KEY is required');
  process.exit(1);
}

function headers() {
  return {
    Authorization: `Bearer ${assistantKey}`,
    'Content-Type': 'application/json',
    ...(assistantUserId ? { 'X-Assistant-User-Id': assistantUserId } : {})
  };
}

async function call(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch (error) {
    json = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(`${method} ${path} failed with ${response.status}`);
    error.status = response.status;
    error.payload = json;
    throw error;
  }

  return json;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const created = {};

  console.log(`Verifying assistant integration against ${baseUrl}`);

  const dailySummary = await call('GET', `/assistant/daily-summary?date=${today}`);
  console.log('1. daily summary ok');
  created.dailySummaryDate = dailySummary?.data?.date;

  const food = await call('POST', '/assistant/log-food', {
    name: `${runTag} oats`,
    quantity_g: 80,
    meal_type: 'breakfast',
    calories: 300,
    protein: 10,
    carbs: 48,
    fat: 6,
    fibre: 8
  });
  console.log('2. food log ok');
  created.foodLogId = food?.ids?.food_log_id;

  const supplement = await call('POST', '/assistant/supplements', {
    name: `${runTag} magnesium`,
    brand: 'Codex QA',
    dose_amount: 200,
    dose_unit: 'mg',
    frequency: 'daily',
    time_of_day: 'evening',
    notes: runTag
  });
  created.supplementId = supplement?.ids?.supplement_id;
  console.log('3. supplement create ok');

  const updatedSupplement = await call('PUT', `/assistant/supplements/${created.supplementId}`, {
    notes: `${runTag} updated`,
    time_of_day: 'night'
  });
  console.log('4. supplement update ok');
  created.updatedSupplementName = updatedSupplement?.data?.supplement?.name;

  const supplementLog = await call('POST', '/assistant/log-supplement', {
    supplement_id: created.supplementId,
    notes: runTag
  });
  created.supplementLogId = supplementLog?.ids?.supplement_log_id;
  console.log('5. supplement log ok');

  const vital = await call('POST', '/assistant/log-vital', {
    vital_type: 'weight',
    value: '99.1',
    unit: 'kg',
    notes: runTag
  });
  created.vitalId = vital?.ids?.vital_id;
  console.log('6. vital log ok');

  const blood = await call('POST', '/assistant/blood-results', {
    test_date: today,
    lab_name: 'Assistant QA',
    markers: {
      vitamin_d: { value: 42, unit: 'ng/mL' }
    },
    notes: runTag
  });
  created.bloodResultId = blood?.ids?.blood_result_id;
  console.log('7. blood result create ok');

  const peptide = await call('POST', '/assistant/peptides', {
    name: `${runTag} peptide`,
    description: runTag,
    dosage_range: '100mcg-200mcg',
    frequency: 'daily',
    administration_route: 'Subcutaneous injection',
    storage_requirements: 'Refrigerate'
  });
  created.peptideId = peptide?.ids?.peptide_id;
  console.log('8. peptide create ok');

  await call('PUT', `/assistant/peptides/${created.peptideId}`, {
    description: `${runTag} updated`
  });
  console.log('9. peptide update ok');

  const peptideConfig = await call('POST', '/assistant/peptide-configs', {
    peptide_id: created.peptideId,
    frequency: 'daily',
    doses: [{ amount: 100, unit: 'mcg', time: '08:00' }],
    notes: runTag
  });
  created.configId = peptideConfig?.ids?.config_id;
  console.log('10. peptide config create ok');

  await call('PUT', `/assistant/peptide-configs/${created.configId}`, {
    notes: `${runTag} updated`,
    doses: [{ amount: 125, unit: 'mcg', time: '09:00' }]
  });
  console.log('11. peptide config update ok');

  const peptideDose = await call('POST', '/assistant/log-peptide-dose', {
    config_id: created.configId,
    dose_amount: 125,
    dose_unit: 'mcg',
    administration_time: new Date().toISOString(),
    notes: runTag
  });
  created.doseId = peptideDose?.ids?.dose_id;
  console.log('12. peptide dose log ok');

  await call('PUT', `/assistant/supplements/${created.supplementId}`, {
    is_active: false,
    notes: `${runTag} archived`
  });

  await call('PUT', `/assistant/peptide-configs/${created.configId}`, {
    is_active: false,
    notes: `${runTag} archived`
  });

  console.log('Verification succeeded');
  console.log(JSON.stringify(created, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  if (error.payload) {
    console.error(JSON.stringify(error.payload, null, 2));
  }
  process.exit(1);
});
