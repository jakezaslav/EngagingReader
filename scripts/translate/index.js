#!/usr/bin/env node
/**
 * Build-time i18n translator.
 * Reads i18n/en.json, incrementally translates new/changed keys into target locales
 * via LibreTranslate (default), DeepL, or Google (env-selected).
 *
 * Usage: node scripts/translate/index.js
 * Env:
 *   SKIP_I18N_TRANSLATE=1 | TRANSLATE_I18N=0  — exit without work
 *   FORCE_I18N_RETRANSLATE=1 — retranslate all keys even if unchanged
 *   TRANSLATE_API=libre|deepl|google
 *   TRANSLATE_API_URL  — LibreTranslate endpoint
 *   LIBRETRANSLATE_API_KEY
 *   DEEPL_API_KEY — Free keys end with :fx (uses api-free.deepl.com)
 *   GOOGLE_TRANSLATE_API_KEY
 *   I18N_DIR — override path to i18n folder
 */

const fs = require('fs');
const path = require('path');

const TARGET_LANGS = ['es', 'fr', 'uk', 'fil', 'tr', 'pt', 'pa', 'zh'];
const SOURCE_KEY = '__source__';

/** Keys that must stay identical to English (brand names, etc.). */
const DO_NOT_TRANSLATE = new Set(['app.title']);

/** LibreTranslate / common API language codes for our locale ids */
const API_LANG_MAP = {
  es: 'es',
  fr: 'fr',
  uk: 'uk',
  fil: 'tl', // Tagalog
  tr: 'tr',
  pt: 'pt',
  pa: 'pa',
  zh: 'zh',
};

/** DeepL target codes. null = unsupported by DeepL. */
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

async function translateLibre(text, target) {
  const url = process.env.TRANSLATE_API_URL || 'https://libretranslate.com/translate';
  const body = {
    q: text,
    source: 'en',
    target: API_LANG_MAP[target] || target,
    format: 'text',
  };
  if (process.env.LIBRETRANSLATE_API_KEY) {
    body.api_key = process.env.LIBRETRANSLATE_API_KEY;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`LibreTranslate ${res.status}: ${errText || res.statusText}`);
  }

  const data = await res.json();
  if (!data || typeof data.translatedText !== 'string') {
    throw new Error(`LibreTranslate unexpected response: ${JSON.stringify(data)}`);
  }
  return data.translatedText;
}

async function translateDeepL(text, target) {
  const key = process.env.DEEPL_API_KEY;
  if (!key) throw new Error('DEEPL_API_KEY is required for TRANSLATE_API=deepl');

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

async function translateGoogle(text, target) {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) {
    throw new Error(
      'GOOGLE_TRANSLATE_API_KEY is required for TRANSLATE_API=google (REST path)'
    );
  }

  const targetCode = API_LANG_MAP[target] || target;
  const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: text,
      source: 'en',
      target: targetCode,
      format: 'text',
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Google Translate ${res.status}: ${errText || res.statusText}`);
  }

  const data = await res.json();
  return data.data.translations[0].translatedText;
}

function getProvider() {
  return (process.env.TRANSLATE_API || 'libre').toLowerCase();
}

function isDeepLUnsupported(lang) {
  return getProvider() === 'deepl' && !DEEPL_TARGETS[lang];
}

async function translateText(text, target) {
  const provider = getProvider();
  if (provider === 'deepl') return translateDeepL(text, target);
  if (provider === 'google') return translateGoogle(text, target);
  return translateLibre(text, target);
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
      `  [${lang}] skipped — DeepL Free does not support this language; keeping existing file.`
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
      const translated = await translateText(enText, lang);
      next[key] = translated;
      source[key] = enText;
      persist();
      console.log('ok');
      await sleep(getProvider() === 'deepl' ? 400 : 150);
    } catch (err) {
      console.log('failed');
      persist();
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

  const enPath = path.join(I18N_DIR, 'en.json');
  if (!fs.existsSync(enPath)) {
    console.error(`Missing source file: ${enPath}`);
    process.exit(1);
  }

  const en = readJson(enPath);
  const provider = getProvider();
  console.log(`Source: ${enPath} (${Object.keys(en).length} keys)`);
  console.log(`Provider: ${provider}`);
  if (provider === 'deepl') {
    const key = process.env.DEEPL_API_KEY || '';
    console.log(
      `DeepL endpoint: ${key.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com'}`
    );
  }
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
    console.log(`Skipped (unsupported by provider): ${skipped.join(', ')}`);
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
