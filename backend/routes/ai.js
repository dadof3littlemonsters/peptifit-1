const express = require('express');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const DASHSCOPE_URL = 'https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 120000;
const MAX_BLOOD_PANEL_PAGES = 12;
const MAX_FULL_TEXT_DOC_CHARS = 18000;
const MAX_TEXT_CHARS_PER_CHUNK = 4500;
const execFileAsync = promisify(execFile);

function getResponseText(content) {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (part && typeof part.text === 'string') {
          return part.text;
        }

        return '';
      })
      .join('\n')
      .trim();
  }

  return '';
}

function stripMarkdownFences(value) {
  const text = String(value || '').trim();

  if (!text.startsWith('```')) {
    return text;
  }

  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function parseJsonContent(content) {
  const cleaned = stripMarkdownFences(content);
  const toIncompleteJsonError = () => Object.assign(new Error('AI returned incomplete JSON'), {
    statusCode: 502,
    code: 'INCOMPLETE_JSON'
  });

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      } catch (sliceError) {
        if (sliceError instanceof SyntaxError) {
          throw toIncompleteJsonError();
        }

        throw sliceError;
      }
    }

    if (error instanceof SyntaxError) {
      throw toIncompleteJsonError();
    }

    throw error;
  }
}

function parseNullableNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoDate(value) {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) {
    return String(value).trim();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
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

function getRequestBuffer(req, limitBytes = 30 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    req.on('data', (chunk) => {
      totalBytes += chunk.length;

      if (totalBytes > limitBytes) {
        reject(Object.assign(new Error('Uploaded file is too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (error) => reject(error));
  });
}

function normalizeBloodMarker(marker, index = 0) {
  const name = typeof marker?.name === 'string' ? marker.name.trim() : '';
  const value = parseNullableNumber(marker?.value);

  if (!name || value === null) {
    return null;
  }

  return {
    id: `${Date.now()}-${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    value,
    unit: typeof marker?.unit === 'string' ? marker.unit.trim() : '',
    reference_range_low: parseNullableNumber(marker?.reference_range_low),
    reference_range_high: parseNullableNumber(marker?.reference_range_high),
    status: typeof marker?.status === 'string' ? marker.status.trim().toLowerCase() : null,
    panel: typeof marker?.panel === 'string' ? marker.panel.trim() : null
  };
}

function dedupeBloodMarkers(markers) {
  const seen = new Set();

  return markers.filter((marker) => {
    const key = [
      String(marker.name || '').toLowerCase(),
      String(marker.unit || '').toLowerCase(),
      String(marker.value ?? '')
    ].join('::');

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizeBloodPanelExtraction(data) {
  const markers = Array.isArray(data?.markers)
    ? dedupeBloodMarkers(data.markers.map(normalizeBloodMarker).filter(Boolean))
    : [];

  return {
    lab_name: typeof data?.lab_name === 'string' ? data.lab_name.trim() : '',
    test_date: toIsoDate(data?.test_date),
    notes: typeof data?.notes === 'string' ? data.notes.trim() : '',
    markers
  };
}

function mergeBloodPanelExtractions(extractions) {
  const merged = extractions.reduce(
    (accumulator, item) => {
      if (!accumulator.lab_name && item.lab_name) {
        accumulator.lab_name = item.lab_name;
      }

      if (!accumulator.test_date && item.test_date) {
        accumulator.test_date = item.test_date;
      }

      if (!accumulator.notes && item.notes) {
        accumulator.notes = item.notes;
      }

      accumulator.markers.push(...(item.markers || []));
      return accumulator;
    },
    {
      lab_name: '',
      test_date: null,
      notes: '',
      markers: []
    }
  );

  return normalizeBloodPanelExtraction(merged);
}

function sanitizeCoachMessages(messages = []) {
  return messages
    .filter((message) => message && (message.role === 'assistant' || message.role === 'user'))
    .map((message) => ({
      role: message.role,
      content: String(message.content || '').trim()
    }))
    .filter((message) => message.content);
}

function splitPdfTextIntoPages(text) {
  return String(text || '')
    .split('\f')
    .map((page) => page.trim())
    .filter(Boolean)
    .slice(0, MAX_BLOOD_PANEL_PAGES);
}

function splitTextIntoChunks(text, maxChars = MAX_TEXT_CHARS_PER_CHUNK) {
  const lines = String(text || '')
    .split('\n')
    .map((line) => line.trimEnd());

  const chunks = [];
  let currentChunk = '';

  for (const line of lines) {
    const candidate = currentChunk ? `${currentChunk}\n${line}` : line;

    if (candidate.length <= maxChars) {
      currentChunk = candidate;
      continue;
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    if (line.length <= maxChars) {
      currentChunk = line;
      continue;
    }

    for (let offset = 0; offset < line.length; offset += maxChars) {
      chunks.push(line.slice(offset, offset + maxChars).trim());
    }
    currentChunk = '';
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter(Boolean);
}

function normalizeNutritionScanResult(data) {
  const result = {
    name: typeof data?.name === 'string' ? data.name.trim() : '',
    brand: typeof data?.brand === 'string' ? data.brand.trim() : null,
    serving_size_g: parseNullableNumber(data?.serving_size_g),
    calories_per_100g: parseNullableNumber(data?.calories_per_100g),
    protein_per_100g: parseNullableNumber(data?.protein_per_100g),
    carbs_per_100g: parseNullableNumber(data?.carbs_per_100g),
    fat_per_100g: parseNullableNumber(data?.fat_per_100g),
    fibre_per_100g: parseNullableNumber(data?.fibre_per_100g),
    calories_per_serving: parseNullableNumber(data?.calories_per_serving),
    protein_per_serving: parseNullableNumber(data?.protein_per_serving),
    carbs_per_serving: parseNullableNumber(data?.carbs_per_serving),
    fat_per_serving: parseNullableNumber(data?.fat_per_serving),
    fibre_per_serving: parseNullableNumber(data?.fibre_per_serving)
  };

  if (!result.name) {
    if (result.brand) {
      result.name = result.brand;
    } else if (
      result.calories_per_100g !== null ||
      result.protein_per_100g !== null ||
      result.carbs_per_100g !== null ||
      result.fat_per_100g !== null ||
      result.calories_per_serving !== null
    ) {
      result.name = 'Scanned food';
    }
  }

  return result;
}

function getAiProviderConfig(scope = 'default') {
  const prefix = scope === 'coach' ? 'COACH_' : '';
  const provider = String(process.env[`${prefix}AI_PROVIDER`] || process.env.AI_PROVIDER || 'dashscope').trim().toLowerCase();

  if (provider === 'deepseek') {
    return {
      provider,
      apiKey: process.env[`${prefix}DEEPSEEK_API_KEY`] || process.env.DEEPSEEK_API_KEY,
      url: process.env[`${prefix}DEEPSEEK_API_URL`] || process.env.DEEPSEEK_API_URL || DEEPSEEK_URL,
      model: process.env[`${prefix}DEEPSEEK_MODEL`] || process.env.DEEPSEEK_MODEL || 'deepseek-chat'
    };
  }

  if (provider === 'groq') {
    return {
      provider,
      apiKey: process.env[`${prefix}GROQ_API_KEY`] || process.env.GROQ_API_KEY,
      url: process.env[`${prefix}GROQ_API_URL`] || process.env.GROQ_API_URL || GROQ_URL,
      model: process.env[`${prefix}GROQ_MODEL`] || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
    };
  }

  if (provider === 'openrouter') {
    return {
      provider,
      apiKey: process.env[`${prefix}OPENROUTER_API_KEY`] || process.env.OPENROUTER_API_KEY,
      url: process.env[`${prefix}OPENROUTER_API_URL`] || process.env.OPENROUTER_API_URL || OPENROUTER_URL,
      model: process.env[`${prefix}OPENROUTER_MODEL`] || process.env.OPENROUTER_MODEL || 'x-ai/grok-4.1-fast',
      referer: process.env[`${prefix}OPENROUTER_REFERER`] || process.env.OPENROUTER_REFERER || process.env.APP_BASE_URL || 'https://trax.delboysden.uk',
      title: process.env[`${prefix}OPENROUTER_TITLE`] || process.env.OPENROUTER_TITLE || 'PeptiFit'
    };
  }

  return {
    provider: 'dashscope',
    apiKey: process.env[`${prefix}DASHSCOPE_API_KEY`] || process.env.DASHSCOPE_API_KEY,
    url: process.env[`${prefix}DASHSCOPE_API_URL`] || process.env.DASHSCOPE_API_URL || DASHSCOPE_URL,
    model: process.env[`${prefix}DASHSCOPE_MODEL`] || process.env.DASHSCOPE_MODEL || 'qwen3.5-plus'
  };
}

async function callAiProvider(images, systemPrompt, userPrompt, options = {}) {
  const { maxTokens = 1000, extraText = '', temperature = 0.1, providerScope = 'default' } = options;
  const providerConfig = getAiProviderConfig(providerScope);
  const { apiKey, url, model, provider, referer, title } = providerConfig;

  if (!apiKey) {
    throw Object.assign(new Error(`${provider.toUpperCase()} API key is not configured`), {
      statusCode: 500
    });
  }

  const imageList = Array.isArray(images) ? images : [images];
  const normalizedImages = imageList
    .map((image) => String(image || '').trim())
    .filter(Boolean);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const combinedText = [userPrompt, extraText].filter(Boolean).join('\n\n');

    if (!normalizedImages.length && !combinedText) {
      throw Object.assign(new Error('At least one image or text prompt is required'), { statusCode: 400 });
    }

    let messages;
    let requestBody;

    if (provider === 'groq') {
      messages = [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: normalizedImages.length
            ? [
                ...normalizedImages.map((image) => ({
                  type: 'image_url',
                  image_url: {
                    url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${stripDataUrlPrefix(image)}`
                  }
                })),
                {
                  type: 'text',
                  text: combinedText
                }
              ]
            : combinedText
        }
      ];

      requestBody = {
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        response_format: { type: 'json_object' }
      };
    } else if (provider === 'openrouter') {
      messages = [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: normalizedImages.length
            ? [
                ...normalizedImages.map((image) => ({
                  type: 'image_url',
                  image_url: {
                    url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${stripDataUrlPrefix(image)}`
                  }
                })),
                {
                  type: 'text',
                  text: combinedText
                }
              ]
            : combinedText
        }
      ];

      requestBody = {
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        response_format: { type: 'json_object' }
      };
    } else {
      const userContent = normalizedImages.map((image) => ({
        type: 'image_url',
        image_url: {
          url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${stripDataUrlPrefix(image)}`
        }
      }));
      userContent.push({
        type: 'text',
        text: combinedText
      });

      messages = [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userContent
        }
      ];

      requestBody = {
        model,
        max_tokens: maxTokens,
        messages
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(provider === 'openrouter' && referer ? { 'HTTP-Referer': referer } : {}),
        ...(provider === 'openrouter' && title ? { 'X-OpenRouter-Title': title } : {})
      },
      signal: controller.signal,
      body: JSON.stringify(requestBody)
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw Object.assign(
        new Error(payload?.error?.message || `AI request failed with status ${response.status}`),
        { statusCode: response.status >= 500 ? 502 : response.status }
      );
    }

    const messageContent = getResponseText(payload?.choices?.[0]?.message?.content);

    if (!messageContent) {
      throw Object.assign(new Error('AI response did not contain structured content'), {
        statusCode: 502
      });
    }

    return parseJsonContent(messageContent);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw Object.assign(new Error('AI request timed out while processing this report. Try a smaller PDF or a screenshot of the marker pages.'), { statusCode: 504 });
    }

    if (!error.statusCode) {
      error.statusCode = 502;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function pdfToImageDataUrls(pdfBuffer) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'peptifit-blood-panel-'));
  const pdfPath = path.join(tempDir, 'document.pdf');
  const outputPrefix = path.join(tempDir, 'page');

  try {
    await fs.writeFile(pdfPath, pdfBuffer);
    await execFileAsync('pdftoppm', [
      '-png',
      '-f',
      '1',
      '-l',
      String(MAX_BLOOD_PANEL_PAGES),
      '-r',
      '110',
      pdfPath,
      outputPrefix
    ]);

    const files = (await fs.readdir(tempDir))
      .filter((file) => /^page-\d+\.png$/i.test(file))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

    const images = [];
    for (const file of files) {
      const imageBuffer = await fs.readFile(path.join(tempDir, file));
      images.push(`data:image/png;base64,${imageBuffer.toString('base64')}`);
    }

    if (images.length === 0) {
      throw Object.assign(new Error('The PDF could not be converted into images'), { statusCode: 422 });
    }

    return images;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function pdfToTextPages(pdfBuffer) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'peptifit-blood-panel-text-'));
  const pdfPath = path.join(tempDir, 'document.pdf');

  try {
    await fs.writeFile(pdfPath, pdfBuffer);
    const { stdout } = await execFileAsync('pdftotext', [
      '-f',
      '1',
      '-l',
      String(MAX_BLOOD_PANEL_PAGES),
      '-layout',
      pdfPath,
      '-'
    ]);

    return splitPdfTextIntoPages(stdout);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function imageToText(imageBuffer, extension = 'png') {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'peptifit-blood-panel-ocr-'));
  const imagePath = path.join(tempDir, `image.${extension}`);
  const outputBase = path.join(tempDir, 'ocr');

  try {
    await fs.writeFile(imagePath, imageBuffer);
    await execFileAsync('tesseract', [
      imagePath,
      outputBase,
      '-l',
      'eng',
      '--psm',
      '6'
    ]);

    return (await fs.readFile(`${outputBase}.txt`, 'utf8')).trim();
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function dataUrlToBuffer(dataUrl) {
  const base64 = stripDataUrlPrefix(dataUrl);
  return Buffer.from(base64, 'base64');
}

async function extractDocumentImages(document) {
  const content = stripDataUrlPrefix(document?.data);
  const mimeType = String(document?.mime_type || getMimeTypeFromDataUrl(document?.data)).toLowerCase();
  const fileBuffer = Buffer.from(content, 'base64');

  if (!fileBuffer.length) {
    throw Object.assign(new Error('Document data is required'), { statusCode: 400 });
  }

  if (mimeType === 'application/pdf' || /\.pdf$/i.test(String(document?.file_name || ''))) {
    return pdfToImageDataUrls(fileBuffer);
  }

  if (mimeType.startsWith('image/')) {
    return [`data:${mimeType};base64,${content}`];
  }

  throw Object.assign(new Error('Only PDF and image uploads are supported'), { statusCode: 400 });
}

async function extractDocumentImagesFromUpload({ buffer, mimeType, fileName }) {
  if (!buffer?.length) {
    throw Object.assign(new Error('Document data is required'), { statusCode: 400 });
  }

  if (mimeType === 'application/pdf' || /\.pdf$/i.test(String(fileName || ''))) {
    return pdfToImageDataUrls(buffer);
  }

  if (String(mimeType || '').startsWith('image/')) {
    return [`data:${mimeType};base64,${buffer.toString('base64')}`];
  }

  throw Object.assign(new Error('Only PDF and image uploads are supported'), { statusCode: 400 });
}

async function extractDocumentTextFromUpload({ buffer, mimeType, fileName }) {
  if (!buffer?.length) {
    throw Object.assign(new Error('Document data is required'), { statusCode: 400 });
  }

  if (mimeType === 'application/pdf' || /\.pdf$/i.test(String(fileName || ''))) {
    return buildPdfTextPages(buffer);
  }

  if (String(mimeType || '').startsWith('image/')) {
    const extension = String(fileName || '')
      .split('.')
      .pop()
      .toLowerCase() || 'png';
    const text = await imageToText(buffer, extension);
    return text ? [text] : [];
  }

  return [];
}

async function buildPdfTextPages(buffer) {
  const [textPages, imagePages] = await Promise.all([
    pdfToTextPages(buffer),
    pdfToImageDataUrls(buffer)
  ]);

  const pageCount = Math.max(textPages.length, imagePages.length);
  const combinedPages = [];

  for (let index = 0; index < pageCount; index += 1) {
    const extractedText = String(textPages[index] || '').trim();

    if (extractedText.length > 150) {
      combinedPages.push(extractedText);
      continue;
    }

    const imageDataUrl = imagePages[index];
    if (!imageDataUrl) {
      continue;
    }

    try {
      const ocrText = await imageToText(dataUrlToBuffer(imageDataUrl), 'png');
      combinedPages.push(ocrText || extractedText);
    } catch (error) {
      combinedPages.push(extractedText);
    }
  }

  return combinedPages.map((page) => String(page || '').trim()).filter(Boolean);
}

async function extractBloodPanelPage(image, pageNumber, totalPages) {
  const data = await callAiProvider(
    [image],
    'You are a clinical lab report extraction assistant. You extract structured biomarker results from one page of a blood panel and return ONLY valid JSON with no markdown or explanation.',
    `This is page ${pageNumber} of ${totalPages} from a blood test report. Extract this single page into JSON with exactly this shape: { "lab_name": "string or empty string", "test_date": "YYYY-MM-DD or null", "notes": "short optional context or empty string", "markers": [ { "name": "marker name", "value": number, "unit": "unit or empty string", "reference_range_low": number or null, "reference_range_high": number or null, "status": "low" | "high" | "borderline" | "critical" | "normal" | null, "panel": "panel/group name or empty string" } ] }. Include only markers clearly visible on this page. Keep notes very short. Do not invent results. Use numeric values only. If a reference range is not shown, return null. If status is not shown, infer only when the value is clearly outside the stated range; otherwise use null.`,
    { maxTokens: 1400 }
  );

  return normalizeBloodPanelExtraction(data);
}

async function extractBloodPanelTextPage(pageText, pageNumber, totalPages) {
  const data = await callAiProvider(
    [],
    'You are a medical data extraction specialist. Extract every single value from this blood test report text. Include patient details, all categories, every test name, value, unit, and reference range. Return only valid JSON.',
    `This is page ${pageNumber} of ${totalPages} from a blood test report. Extract this text into JSON with exactly this shape: { "lab_name": "string or empty string", "test_date": "YYYY-MM-DD or null", "notes": "short optional context or empty string", "markers": [ { "name": "marker name", "value": number, "unit": "unit or empty string", "reference_range_low": number or null, "reference_range_high": number or null, "status": "low" | "high" | "borderline" | "critical" | "normal" | null, "panel": "panel/group name or empty string" } ] }. Do not skip rows. Do not invent results. Use numeric values only. If a reference range is not shown, return null.`,
    { maxTokens: 2400, extraText: `Page text:\n${pageText.slice(0, 15000)}`, temperature: 0.1 }
  );

  return normalizeBloodPanelExtraction(data);
}

async function extractBloodPanelFullTextDocument(documentText, totalPages) {
  const data = await callAiProvider(
    [],
    'You are a medical data extraction specialist. Extract every single value from this blood test report text. Include all patient details, all categories, every test name with value, unit, and reference range. Do not skip anything. Return only valid JSON.',
    'Extract this full blood test report into JSON with exactly this shape: { "lab_name": "string or empty string", "test_date": "YYYY-MM-DD or null", "notes": "short optional context or empty string", "markers": [ { "name": "marker name", "value": number, "unit": "unit or empty string", "reference_range_low": number or null, "reference_range_high": number or null, "status": "low" | "high" | "borderline" | "critical" | "normal" | null, "panel": "panel/group name or empty string" } ] }. Include every marker from all pages. Do not skip anything. Do not invent results. Use numeric values only. If a reference range is not shown, return null.',
    { maxTokens: 4096, extraText: `Report text from ${totalPages} pages:\n${documentText.slice(0, MAX_FULL_TEXT_DOC_CHARS)}`, temperature: 0.1 }
  );

  return normalizeBloodPanelExtraction(data);
}

async function extractBloodPanelTextDocument(pages) {
  const fullText = pages.join('\n\n--- PAGE BREAK ---\n\n').trim();

  if (fullText && fullText.length <= MAX_FULL_TEXT_DOC_CHARS) {
    try {
      return await extractBloodPanelFullTextDocument(fullText, pages.length);
    } catch (error) {
      if (error.code !== 'INCOMPLETE_JSON' && error.statusCode !== 504) {
        throw error;
      }
    }
  }

  const results = [];

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const chunks = splitTextIntoChunks(pages[pageIndex]);

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const header = chunks.length > 1
        ? `This is chunk ${chunkIndex + 1} of ${chunks.length} for page ${pageIndex + 1} of ${pages.length}.`
        : `This is page ${pageIndex + 1} of ${pages.length}.`;

      results.push(await extractBloodPanelTextPage(
        `${header}\n\n${chunks[chunkIndex]}`,
        pageIndex + 1,
        pages.length
      ));
    }
  }

  return mergeBloodPanelExtractions(results);
}

async function scanNutritionLabel({ image, productNameHint = '' }) {
  if (!image) {
    throw Object.assign(new Error('Image is required'), { statusCode: 400 });
  }

  const data = await callAiProvider(
    [image],
    'You are a nutrition data extraction assistant. You extract nutritional information from food product labels and return ONLY valid JSON, no markdown, no explanation.',
    [
      'Extract the nutritional information from this food label image.',
      'Return a JSON object with exactly these fields:',
      '{ "name": "product name", "brand": "brand name or null", "serving_size_g": number or null, "calories_per_100g": number or null, "protein_per_100g": number or null, "carbs_per_100g": number or null, "fat_per_100g": number or null, "fibre_per_100g": number or null, "calories_per_serving": number or null, "protein_per_serving": number or null, "carbs_per_serving": number or null, "fat_per_serving": number or null, "fibre_per_serving": number or null }.',
      'If the exact product name is unclear, use the best short guess from the pack front or use the brand name instead of null.',
      'If values are given per serving, calculate per_100g values if serving size is known.',
      'If values are per 100g, calculate per_serving if serving size is known.',
      'Return null for any field you cannot determine.',
      productNameHint ? `Product name hint: ${productNameHint}` : ''
    ].filter(Boolean).join(' ')
  );

  return normalizeNutritionScanResult(data);
}

module.exports = function createAiRouter({ authenticateToken }) {
  const router = express.Router();

  router.post('/scan-nutrition-label', authenticateToken, async (req, res) => {
    const { image } = req.body || {};

    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }

    try {
      res.json(await scanNutritionLabel({ image }));
    } catch (error) {
      console.error('Nutrition label scan failed:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Failed to scan nutrition label'
      });
    }
  });

  router.post('/scan-supplement-label', authenticateToken, async (req, res) => {
    const { image } = req.body || {};

    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }

    try {
      const data = await callAiProvider(
        [image],
        'You are a supplement label extraction assistant. You extract supplement information from product labels and return ONLY valid JSON, no markdown, no explanation.',
        'Extract the supplement information from this label image. Return a JSON object with exactly these fields: { "name": "supplement name", "brand": "brand name or null", "dose_amount": number (per serving), "dose_unit": "capsules" or "tablets" or "softgels" or "scoops" or "ml" or "drops", "servings_per_container": number or null, "ingredients": "key active ingredients as a brief string or null", "directions": "brief usage directions or null" }. Return null for any field you cannot determine.'
      );

      res.json(data);
    } catch (error) {
      console.error('Supplement label scan failed:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Failed to scan supplement label'
      });
    }
  });

  router.post('/extract-blood-panel', authenticateToken, async (req, res) => {
    try {
      const contentType = String(req.headers['content-type'] || '').toLowerCase();
      const fileNameHeader = req.headers['x-file-name'];
      const fileName = Array.isArray(fileNameHeader) ? fileNameHeader[0] : fileNameHeader;

      let images;
      let textPages = [];

      if (contentType.includes('application/json')) {
        const { document } = req.body || {};

        if (!document?.data) {
          return res.status(400).json({ error: 'Document is required' });
        }

        images = await extractDocumentImages(document);
      } else {
        const buffer = await getRequestBuffer(req);

        if (!buffer.length) {
          return res.status(400).json({ error: 'Document is required' });
        }

        const upload = {
          buffer,
          mimeType: contentType || 'application/octet-stream',
          fileName: fileName ? decodeURIComponent(fileName) : ''
        };

        textPages = await extractDocumentTextFromUpload(upload);

        if (textPages.length > 0 && textPages.some((page) => page.length > 100)) {
          return res.json(await extractBloodPanelTextDocument(textPages));
        }

        images = await extractDocumentImagesFromUpload(upload);
      }

      const pageResults = [];

      for (let index = 0; index < images.length; index += 1) {
        pageResults.push(await extractBloodPanelPage(images[index], index + 1, images.length));
      }

      const merged = mergeBloodPanelExtractions(pageResults);
      res.json(merged);
    } catch (error) {
      console.error('Blood panel extraction failed:', error);
      res.status(error.statusCode || 500).json({
        error: error.code === 'INCOMPLETE_JSON'
          ? 'The report returned too much data in one pass. Try a screenshot of the marker pages or a smaller PDF.'
          : error.message || 'Failed to extract blood panel'
      });
    }
  });

  router.post('/blood-results-coach', authenticateToken, async (req, res) => {
    const { context = {}, messages = [] } = req.body || {};
    const conversation = sanitizeCoachMessages(messages).slice(-8);

    if (!conversation.length) {
      return res.status(400).json({ error: 'A user question is required' });
    }

    try {
      const latestQuestion = conversation.filter((message) => message.role === 'user').slice(-1)[0]?.content || '';
      const transcript = conversation
        .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
        .join('\n\n')
        .slice(0, 12000);

      const response = await callAiProvider(
        [],
        'You are a direct blood test and hormone panel coach. Explain results clearly, tie your answer to the provided context, discuss TRT, peptides, biomarkers, and protocol-related factors in a practical way, avoid moralizing disclaimers, avoid definitive diagnosis, do not give explicit dosing or prescribing instructions, and return ONLY valid JSON with the shape { "reply": string, "follow_ups": string[] }.',
        [
          'Use the supplied blood result context to answer the user.',
          'Prioritize trend interpretation, out-of-range markers, and related markers when relevant.',
          'Keep the tone direct, practical, and medically literate.',
          'It is acceptable to discuss plausible causes, tradeoffs, monitoring strategies, and questions the user should think through with a clinician.',
          'If the user asks about TRT, peptides, or performance-enhancing context, answer the biochemical and monitoring side of the question directly.',
          'Do not refuse just because a topic involves hormones, TRT, or peptides. Only avoid unsafe certainty or explicit prescribing.',
          '',
          `CONTEXT_JSON:\n${JSON.stringify(context || {}).slice(0, 12000)}`,
          '',
          `CONVERSATION:\n${transcript}`,
          '',
          `LATEST_USER_QUESTION:\n${latestQuestion}`
        ].join('\n'),
        {
          maxTokens: 900,
          temperature: 0.2,
          providerScope: 'coach'
        }
      );

      res.json({
        reply: typeof response?.reply === 'string' ? response.reply.trim() : '',
        follow_ups: Array.isArray(response?.follow_ups)
          ? response.follow_ups.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3)
          : []
      });
    } catch (error) {
      console.error('Blood results coach failed:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Failed to get coach response'
      });
    }
  });

  return router;
};

module.exports.helpers = {
  callAiProvider,
  normalizeNutritionScanResult,
  scanNutritionLabel
};
