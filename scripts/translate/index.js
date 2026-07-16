#!/usr/bin/env node
/**
 * Build-time i18n translator.
 * Reads i18n/en.json, incrementally translates new/changed keys into target locales
 * via DeepL.
 *
 * Usage:
 *   npm run translate
 *   bash scripts/build.sh   (deploy build: pip + translate; used by render.yaml)
 * Env:
 *   DEEPL_API_KEY — required (Free keys end with :fx → api-free.deepl.com)
 *   SKIP_I18N_TRANSLATE=1 | TRANSLATE_I18N=0  — exit without work
 *   FORCE_I18N_RETRANSLATE=1 — retranslate all keys even if unchanged
 *   I18N_DIR — override path to i18n folder
 */

const fs = require('fs');
const path = require('path');

const TARGET_LANGS = ['es', 'fr', 'uk', 'fil', 'tr', 'pt', 'pa', 'zh'];
const SOURCE_KEY = '__source__';

/** Keys that must stay identical to English (brand names, etc.). */
const DO_NOT_TRANSLATE = new Set(['app.title']);

/** DeepL target codes. Languages omitted here are skipped. */
const DEEPL_TARGETS = {
  es: 'ES',
  fr: 'FR',
  uk: 'UK',
  pt: 'PT-PT',
  tr: 'TR',
  fil: 'TL', // Tagalog
  pa: 'PA', // Punjabi
  zh: 'ZH', // Simplified Chinese
};

const I18N_DIR = process.env.I18N_DIR
  ? path.resolve(process.env.I18N_DIR)
  : path.join(__dirname, '../../i18n');

function loadDotEnv() {
  const envPath = path.join(__dirname, '../../.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

function shouldSkip() {
  if (process.env.SKIP_I18N_TRANSLATE === '1') return true;
  if (process.env.TRANSLATE_I18N === '0') return true;
  return false;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function translateDeepL(text, target) {
  const key = process.env.DEEPL_API_KEY;
  if (!key) throw new Error('DEEPL_API_KEY is required');

  const apiTarget = DEEPL_TARGETS[target];
  if (!apiTarget) {
    throw new Error(`DeepL does not support target language: ${target}`);
  }

  const endpoint = key.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';

  const params = new URLSearchParams();
  params.append('text', text);
  params.append('source_lang', 'EN');
  params.append('target_lang', apiTarget);

  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (res.ok) {
      const data = await res.json();
      return data.translations[0].text;
    }

    const errText = await res.text().catch(() => '');
    if (res.status === 429 && attempt < maxAttempts) {
      const waitMs = Math.min(30000, 2000 * attempt * attempt);
      process.stdout.write(`rate-limited, retry in ${Math.round(waitMs / 1000)}s... `);
      await sleep(waitMs);
      continue;
    }
    throw new Error(`DeepL ${res.status}: ${errText || res.statusText}`);
  }

  throw new Error('DeepL: exhausted retries');
}

function isDeepLUnsupported(lang) {
  return !DEEPL_TARGETS[lang];
}

function keysNeedingTranslation(en, existing) {
  const force = process.env.FORCE_I18N_RETRANSLATE === '1';
  const source = existing[SOURCE_KEY] && typeof existing[SOURCE_KEY] === 'object'
    ? existing[SOURCE_KEY]
    : {};
  const needed = [];
  for (const [key, value] of Object.entries(en)) {
    if (key === SOURCE_KEY) continue;
    if (force) {
      needed.push(key);
      continue;
    }
    const missing = !(key in existing) || existing[key] === '' || existing[key] == null;
    const enChanged = source[key] !== value;
    if (missing || enChanged) {
      needed.push(key);
    }
  }
  return needed;
}

async function translateLocale(lang, en) {
  if (isDeepLUnsupported(lang)) {
    console.log(
      `  [${lang}] skipped — DeepL does not support this language; keeping existing file.`
    );
    return { lang, translated: 0, wrote: false, skipped: true };
  }

  const outPath = path.join(I18N_DIR, `${lang}.json`);
  let existing = {};
  if (fs.existsSync(outPath)) {
    try {
      existing = readJson(outPath);
    } catch (err) {
      console.warn(`Warning: could not parse ${outPath}, starting fresh:`, err.message);
      existing = {};
    }
  }

  const needed = keysNeedingTranslation(en, existing);
  if (needed.length === 0) {
    return { lang, translated: 0, wrote: false };
  }

  const source = { ...(existing[SOURCE_KEY] || {}) };
  const next = { ...existing };
  delete next[SOURCE_KEY];

  function persist() {
    const ordered = {};
    for (const key of Object.keys(en)) {
      if (key === SOURCE_KEY) continue;
      ordered[key] = key in next ? next[key] : en[key];
      if (!(key in source)) source[key] = en[key];
    }
    ordered[SOURCE_KEY] = source;
    writeJson(outPath, ordered);
  }

  for (const key of needed) {
    const enText = en[key];
    process.stdout.write(`  [${lang}] ${key}... `);
    try {
      if (DO_NOT_TRANSLATE.has(key)) {
        next[key] = enText;
        source[key] = enText;
        persist();
        console.log('kept English');
        continue;
      }
      const translated = await translateDeepL(enText, lang);
      next[key] = translated;
      source[key] = enText;
      persist();
      console.log('ok');
      await sleep(400);
    } catch (err) {
      console.log('failed');
      // Do not persist a failed key into __source__ — that would skip retries on the next build.
      throw new Error(`${lang}/${key}: ${err.message}`);
    }
  }

  return { lang, translated: needed.length, wrote: true };
}

async function main() {
  if (shouldSkip()) {
    console.log('SKIP_I18N_TRANSLATE set; skipping translation.');
    process.exit(0);
  }

  if (!process.env.DEEPL_API_KEY) {
    console.error('DEEPL_API_KEY is required for i18n translation.');
    process.exit(1);
  }

  const enPath = path.join(I18N_DIR, 'en.json');
  if (!fs.existsSync(enPath)) {
    console.error(`Missing source file: ${enPath}`);
    process.exit(1);
  }

  const en = readJson(enPath);
  const key = process.env.DEEPL_API_KEY || '';
  console.log(`Source: ${enPath} (${Object.keys(en).length} keys)`);
  console.log('Provider: deepl');
  console.log(
    `DeepL endpoint: ${key.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com'}`
  );
  if (process.env.FORCE_I18N_RETRANSLATE === '1') {
    console.log('FORCE_I18N_RETRANSLATE=1 — retranslating all keys.');
  }

  let total = 0;
  const updated = [];
  const skipped = [];

  for (const lang of TARGET_LANGS) {
    const result = await translateLocale(lang, en);
    total += result.translated;
    if (result.wrote) updated.push(`${lang}(${result.translated})`);
    if (result.skipped) skipped.push(lang);
  }

  if (skipped.length) {
    console.log(`Skipped (unsupported by DeepL): ${skipped.join(', ')}`);
  }

  if (total === 0) {
    console.log('No i18n changes; skipping translation.');
    process.exit(0);
  }

  console.log(`Updated: ${updated.join(', ')} — ${total} string(s) translated.`);
}

main().catch((err) => {
  console.error('Translation failed:', err.message);
  process.exit(1);
});
