const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DATASET_SOURCES = [
  {
    name: 'CoFID 2021',
    url: 'https://assets.publishing.service.gov.uk/media/60538b91e90e07527df82ae4/McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021..xlsx',
    xlsxFile: 'CoFID_2021.xlsx',
    jsonFile: 'CoFID_2021.proximates.json',
    append: false
  },
  {
    name: 'CoFID old foods',
    url: 'https://assets.publishing.service.gov.uk/media/60538ba4e90e07527f645f88/CoFID_oldFoods.xlsx',
    xlsxFile: 'CoFID_oldFoods.xlsx',
    jsonFile: 'CoFID_oldFoods.proximates.json',
    append: true
  }
];

function resolveDataDir() {
  const candidates = [
    path.join(__dirname, '..', '..', 'data'),
    path.join(__dirname, '..', 'data')
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Download failed for ${url}: HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destinationPath, buffer);
}

async function main() {
  const args = process.argv.slice(2);
  const skipDownload = args.includes('--skip-download');
  const dataDir = resolveDataDir();

  fs.mkdirSync(dataDir, { recursive: true });

  for (const dataset of DATASET_SOURCES) {
    const xlsxPath = path.join(dataDir, dataset.xlsxFile);
    const jsonPath = path.join(dataDir, dataset.jsonFile);

    if (!skipDownload) {
      console.log(`Downloading ${dataset.name}...`);
      await downloadFile(dataset.url, xlsxPath);
    } else if (!fs.existsSync(xlsxPath)) {
      throw new Error(`Missing ${xlsxPath}; remove --skip-download or place the workbook there first.`);
    }

    console.log(`Converting ${dataset.name}...`);
    runCommand('python3', [path.join(__dirname, 'convert-cofid-xlsx.py'), xlsxPath, jsonPath]);

    console.log(`Importing ${dataset.name}...`);
    const importArgs = [path.join(__dirname, 'import-cofid.js'), jsonPath];

    if (dataset.append) {
      importArgs.push('--append');
    }

    runCommand('node', importArgs, {
      cwd: path.join(__dirname, '..')
    });
  }

  console.log('CoFID refresh complete.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
