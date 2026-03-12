const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const baseUrl = (process.env.PEPTIFIT_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const assistantKey = process.env.ASSISTANT_API_KEY;
const assistantUserId = process.env.ASSISTANT_USER_ID || '';
const runTag = `assistant-test-${Date.now()}`;
const knownBarcode = process.env.ASSISTANT_TEST_BARCODE || '3017620422003';

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

async function call(method, route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let json;

  try {
    json = text ? JSON.parse(text) : null;
  } catch (error) {
    json = { raw: text };
  }

  if (!response.ok) {
    const failure = new Error(`${method} ${route} failed with ${response.status}`);
    failure.status = response.status;
    failure.payload = json;
    throw failure;
  }

  return json;
}

async function createTestLabelImage() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'peptifit-assistant-label-'));
  const imagePath = path.join(tempDir, 'label.png');
  const script = `
from PIL import Image, ImageDraw, ImageFont
img = Image.new("RGB", (1400, 900), "white")
draw = ImageDraw.Draw(img)
font = ImageFont.load_default()
lines = [
    "Test Protein Yogurt",
    "Serving size 150g",
    "Per serving",
    "Calories 180",
    "Protein 20g",
    "Carbs 12g",
    "Fat 4g",
    "Fibre 1g"
]
y = 60
for line in lines:
    draw.text((60, y), line, fill="black", font=font)
    y += 90
img.save(r"${imagePath}")
`;

  await execFileAsync('python3', ['-c', script]);
  return { tempDir, imagePath };
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const created = {};
  let labelTempDir = null;

  console.log(`Verifying assistant integration against ${baseUrl}`);

  try {
    const search = await call('GET', '/assistant/food/search?query=grenade%20oreo%20bar');
    if (!Array.isArray(search?.data?.candidates) || search.data.candidates.length === 0) {
      throw new Error('Food search returned no candidates');
    }
    console.log('1. food search ok');

    const barcode = await call('GET', `/assistant/food/barcode/${knownBarcode}`);
    if (!barcode?.data?.candidate?.id) {
      throw new Error('Barcode lookup returned no candidate');
    }
    console.log('2. barcode lookup ok');

    const directFood = await call('POST', '/assistant/log-food', {
      name: `${runTag} oats`,
      quantity_g: 80,
      meal_type: 'breakfast',
      calories: 300,
      protein: 10,
      carbs: 48,
      fat: 6,
      fibre: 8
    });
    created.mealId = directFood?.ids?.meal_id;
    created.foodLogId = directFood?.ids?.food_log_id;
    console.log('3. direct food log ok');

    const resolvedFood = await call('POST', '/assistant/log-food', {
      quantity_g: 60,
      meal_type: 'snack',
      resolved_food: barcode.data.candidate
    });
    created.resolvedMealId = resolvedFood?.ids?.meal_id;
    created.resolvedFoodLogId = resolvedFood?.ids?.food_log_id;
    console.log('4. resolved product food log ok');

    const labelImage = await createTestLabelImage();
    labelTempDir = labelImage.tempDir;
    const parsedLabel = await call('POST', '/assistant/food/parse-label', {
      image_path: labelImage.imagePath,
      product_name_hint: 'Test Protein Yogurt'
    });
    if (!parsedLabel?.data?.parsed_label) {
      throw new Error('Label parse returned no parsed_label');
    }
    console.log('5. nutrition label parse ok');

    const supplement = await call('POST', '/assistant/supplements', {
      name: `${runTag} magnesium`,
      brand: 'Codex QA',
      count_per_dose: 2,
      count_unit: 'capsule',
      strength_amount: 100,
      strength_unit: 'mg',
      strength_basis: 'per capsule',
      total_dose_amount: 200,
      total_dose_unit: 'mg',
      frequency: 'daily',
      time_of_day: 'evening',
      notes: runTag
    });
    created.supplementId = supplement?.ids?.supplement_id;
    if (supplement?.data?.supplement?.practical_dose?.count_per_dose !== 2) {
      throw new Error('Supplement create did not return normalized practical dose');
    }
    if (supplement?.data?.supplement?.strength?.amount !== 100) {
      throw new Error('Supplement create did not return normalized strength');
    }

    const supplementList = await call('GET', '/assistant/supplements');
    const listedSupplement = (supplementList?.data?.supplements || []).find((item) => item.id === created.supplementId);
    if (!listedSupplement?.practical_dose?.count_unit || !listedSupplement?.strength?.unit) {
      throw new Error('Assistant supplement list did not expose normalized supplement fields');
    }

    const updatedSupplement = await call('PUT', `/assistant/supplements/${created.supplementId}`, {
      count_per_dose: 1,
      count_unit: 'tablet',
      strength_amount: 200,
      strength_unit: 'mg',
      strength_basis: 'per tablet',
      total_dose_amount: 200,
      total_dose_unit: 'mg',
      time_of_day: 'before_bed'
    });
    if (updatedSupplement?.data?.supplement?.practical_dose?.count_unit !== 'tablet') {
      throw new Error('Supplement update did not persist normalized practical dose');
    }
    if (updatedSupplement?.data?.supplement?.strength?.basis !== 'per tablet') {
      throw new Error('Supplement update did not persist normalized strength');
    }

    const supplementLog = await call('POST', '/assistant/log-supplement', {
      supplement_id: created.supplementId,
      notes: runTag
    });
    created.supplementLogId = supplementLog?.ids?.supplement_log_id;
    if (supplementLog?.data?.supplement_log?.practical_dose?.count_unit !== 'tablet') {
      throw new Error('Supplement log did not expose normalized practical dose');
    }

    const peptide = await call('POST', '/assistant/peptides', {
      name: `${runTag} peptide`,
      description: runTag,
      dosage_range: '100mcg-200mcg',
      frequency: 'daily',
      administration_route: 'Subcutaneous injection',
      storage_requirements: 'Refrigerate'
    });
    created.peptideId = peptide?.ids?.peptide_id;

    const peptideConfig = await call('POST', '/assistant/peptide-configs', {
      peptide_id: created.peptideId,
      frequency: 'daily',
      doses: [{ amount: 100, unit: 'mcg', time: '08:00' }],
      notes: runTag
    });
    created.configId = peptideConfig?.ids?.config_id;

    const peptideDose = await call('POST', '/assistant/log-peptide-dose', {
      config_id: created.configId,
      dose_amount: 100,
      dose_unit: 'mcg',
      administration_time: new Date().toISOString(),
      notes: runTag
    });
    created.doseId = peptideDose?.ids?.dose_id;

    await call('DELETE', `/assistant/meals/${created.mealId}`);
    await call('DELETE', `/assistant/food-logs/${created.foodLogId}`);
    await call('DELETE', `/assistant/meals/${created.resolvedMealId}`);
    await call('DELETE', `/assistant/food-logs/${created.resolvedFoodLogId}`);
    console.log('6. meal and food-log delete ok');

    await call('DELETE', `/assistant/supplement-logs/${created.supplementLogId}`);
    console.log('7. supplement list/create/update/log/delete ok');

    await call('DELETE', `/assistant/peptide-doses/${created.doseId}`);
    console.log('8. peptide-dose delete ok');

    await call('DELETE', `/assistant/peptide-configs/${created.configId}`);
    await call('DELETE', `/assistant/supplements/${created.supplementId}`);

    console.log('Verification succeeded');
    console.log(JSON.stringify(created, null, 2));
  } finally {
    if (labelTempDir) {
      await fs.rm(labelTempDir, { recursive: true, force: true }).catch(() => null);
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  if (error.payload) {
    console.error(JSON.stringify(error.payload, null, 2));
  }
  process.exit(1);
});
