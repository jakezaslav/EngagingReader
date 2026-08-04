window.ER = window.ER || {};
(function (ER) {
'use strict';
function loadVoices() {
    return new Promise((resolve) => {
        const voices = ER.state.speechSynthesis.getVoices();
        if (voices.length > 0) {
            resolve(voices);
        } else {
            ER.state.speechSynthesis.onvoiceschanged = function() {
                const voices = ER.state.speechSynthesis.getVoices();
                resolve(voices);
            };
        }
    });
}

// Get the best English voice available
async function getEnglishVoice() {
    const voices = await loadVoices();
    
    // Detect browser and platform
    const userAgent = navigator.userAgent;
    const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
    const isChrome = /chrome/i.test(userAgent) && !/edg/i.test(userAgent);
    const isWindows = /windows/i.test(userAgent);
    const isMac = /macintosh|mac os x/i.test(userAgent);
    
    // Platform and browser-specific voice preferences
    let preferredVoices = [];
    
    if (isSafari && isMac) {
        // Safari on Mac - prefer Alex, then high-quality Mac voices
        preferredVoices = [
            'Alex',               // Enhanced voice, excellent for Safari
            'Samantha',           // High-quality American voice
            'Aaron',              // Siri male US voice
            'Nicky',              // Siri female US voice
            'Allison'             // Enhanced quality voice
        ];
    } else if (isChrome && isWindows) {
        // Chrome on Windows - prefer Microsoft voices
        preferredVoices = [
            'Microsoft Zira',     // Windows 10/11 female voice
            'Microsoft David',    // Windows 10/11 male voice
            'Microsoft Mark',     // Windows male voice
            'Zira',              // Short name variant
            'David',             // Short name variant
            'Mark',              // Short name variant
            'Google US English', // Google voices in Chrome
            'Chrome OS US English',
            'Samantha',          // If Mac voices are available
            'Alex'               // If Mac voices are available
        ];
    } else if (isChrome && isMac) {
        // Chrome on Mac - prefer Mac voices with Chrome compatibility
        preferredVoices = [
            'Samantha',           // Often works better in Chrome than Alex
            'Alex',               // May work in Chrome on Mac
            'Aaron',              // Siri voices
            'Nicky',
            'Google US English',  // Google voices
            'Chrome OS US English'
        ];
    } else if (isChrome) {
        // Chrome on other platforms (Linux, etc.)
        preferredVoices = [
            'Google US English',
            'Chrome OS US English',
            'English United States',
            'en-US',
            'English',
            'Samantha',
            'Alex'
        ];
    } else {
        // Other browsers - use general preferences
        preferredVoices = [
            'Samantha',
            'Alex',
            'Aaron',
            'Nicky',
            'Microsoft Zira',
            'Microsoft David',
            'Google US English'
        ];
    }
    
    // Look for specific preferred voices by name (case-insensitive, partial matching)
    for (const voiceName of preferredVoices) {
        const voice = voices.find(v => {
            if (!v.name) return false;
            const voiceNameLower = v.name.toLowerCase();
            const preferredLower = voiceName.toLowerCase();
            
            // Check for exact match or if voice name contains the preferred name
            const nameMatch = voiceNameLower === preferredLower || 
                             voiceNameLower.includes(preferredLower) ||
                             preferredLower.includes(voiceNameLower);
            
            // Ensure it's an English voice
            const isEnglish = v.lang && (
                v.lang.startsWith('en-US') || v.lang.startsWith('en_US') ||
                v.lang.startsWith('en-') || v.lang.startsWith('en_') ||
                v.lang.toLowerCase().includes('english') ||
                v.lang.toLowerCase().includes('united states')
            );
            
            return nameMatch && isEnglish;
        });
        
        if (voice) {
                    return voice;
        }
    }
    
    // Fallback to language-based selection for English variants
    const preferredLanguageOrder = [
        'en-US', 'en_US', 'en-US-', 'en_US_',
        'en-GB', 'en_GB', 'en-AU', 'en-CA', 'en-IN',
        'en-US-male', 'en-US-female', 'en-GB-oxendict',
        'english', 'English'
    ];
    
    // Try to find exact matches by language
    for (const lang of preferredLanguageOrder) {
        const voice = voices.find(v => v.lang && v.lang.toLowerCase().includes(lang.toLowerCase()));
        if (voice) {
            return voice;
        }
    }
    
    // Look for any voice with "english" or "united states" in the name or language
    const englishVoice = voices.find(voice => {
        if (!voice.name && !voice.lang) return false;
        const searchText = ((voice.name || '') + ' ' + (voice.lang || '')).toLowerCase();
        return searchText.includes('english') || 
               searchText.includes('united states') ||
               searchText.includes('en-') ||
               searchText.includes('en_');
    });
    
    if (englishVoice) {
        return englishVoice;
    }
    
    // Last resort - first available voice
    return voices[0];
}

// Preferred BCP-47 language tags per UI locale (ordered by preference)
var LOCALE_LANG_TAGS = {
    en: ['en-US', 'en_US', 'en-GB', 'en'],
    es: ['es-ES', 'es_ES', 'es-MX', 'es-US', 'es'],
    fr: ['fr-CA', 'fr_CA', 'fr-FR', 'fr_FR', 'fr'],
    fil: ['fil-PH', 'fil', 'tl-PH', 'tl'],
    pt: ['pt-BR', 'pt_BR', 'pt-PT', 'pt'],
    pa: ['pa-IN', 'pa_IN', 'pa-Guru', 'pa-Arab', 'pa'],
    tr: ['tr-TR', 'tr_TR', 'tr'],
    uk: ['uk-UA', 'uk_UA', 'uk'],
    ru: ['ru-RU', 'ru_RU', 'ru'],
    ht: ['ht-HT', 'ht_HT', 'ht'],
    zh: ['zh-CN', 'zh_CN', 'zh-Hans', 'zh-TW', 'zh-Hant', 'zh']
};

// Voice-name keywords when lang tags are missing or nonstandard
var LOCALE_VOICE_NAME_HINTS = {
    es: ['spanish', 'español', 'espanol'],
    fr: ['french', 'français', 'francais'],
    fil: ['filipino', 'tagalog'],
    pt: ['portuguese', 'português', 'portugues'],
    pa: ['punjabi', 'panjabi', 'gurmukhi', 'ਪੰਜਾਬੀ'],
    tr: ['turkish', 'türkçe', 'turkce'],
    uk: ['ukrainian', 'україн'],
    ru: ['russian', 'русский'],
    ht: ['haitian', 'creole', 'kreyol', 'kreyòl'],
    zh: ['chinese', 'mandarin', 'cantonese', '中文']
};

function normalizeLangTag(tag) {
    return (tag || '').toLowerCase().replace(/_/g, '-');
}

function primaryLang(tag) {
    return normalizeLangTag(tag).split('-')[0];
}

/**
 * Pick the best available TTS voice for a UI locale code.
 * Returns { voice, lang }. When no matching voice is installed, voice is null
 * and lang is still set so the browser can choose (e.g. remote voices).
 * Does NOT fall back to an English voice for non-English locales — that
 * forces English pronunciation of non-English text.
 */
async function getVoiceForLocale(locale) {
    const tags = LOCALE_LANG_TAGS[locale] || [locale || 'en'];
    const preferredLang = normalizeLangTag(tags[0]).replace(/_/g, '-') || 'en-US';

    if (!locale || locale === 'en') {
        const voice = await getEnglishVoice();
        return { voice: voice || null, lang: (voice && voice.lang) || 'en-US' };
    }

    const voices = await loadVoices();

    // Prefer an exact / prefix match on voice.lang
    for (const tag of tags) {
        const tagLower = normalizeLangTag(tag);
        const voice = voices.find(v => {
            if (!v.lang) return false;
            const lang = normalizeLangTag(v.lang);
            return lang === tagLower || lang.startsWith(tagLower + '-') ||
                (tagLower.length >= 2 && lang === tagLower);
        });
        if (voice) return { voice: voice, lang: voice.lang || preferredLang };
    }

    // Broader match: primary language subtag only (e.g. "es" in "es-419")
    const primary = primaryLang(tags[tags.length - 1] || locale);
    const byPrimary = voices.find(v => v.lang && primaryLang(v.lang) === primary);
    if (byPrimary) return { voice: byPrimary, lang: byPrimary.lang || preferredLang };

    // Name-based match (some OS voices omit or misuse lang)
    const hints = LOCALE_VOICE_NAME_HINTS[locale] || [];
    if (hints.length) {
        const byName = voices.find(v => {
            const name = (v.name || '').toLowerCase();
            return hints.some(h => name.indexOf(h.toLowerCase()) !== -1);
        });
        if (byName) return { voice: byName, lang: byName.lang || preferredLang };
    }

    // No local voice — leave voice unset and rely on utterance.lang
    return { voice: null, lang: preferredLang };
}

/**
 * Preload TTS voice/lang for a document locale into ER.state.
 * Voice may be null when no matching system voice is installed; lang is always set.
 */
async function preloadDocumentVoice(locale) {
    const code = locale || ER.state.documentLocale || 'en';
    const { voice, lang } = await getVoiceForLocale(code);
    ER.state.preloadedVoice = voice || null;
    ER.state.preloadedLang = lang || 'en-US';
    ER.state.preloadedLocale = code;
    return { voice: ER.state.preloadedVoice, lang: ER.state.preloadedLang };
}

/**
 * Apply locale voice/lang to an utterance. Uses preload cache when it matches
 * the requested locale; otherwise resolves via getVoiceForLocale.
 */
async function applyVoiceForLocale(utterance, locale) {
    const code = locale || ER.state.documentLocale || 'en';
    let voice = null;
    let lang = null;

    if (code === ER.state.preloadedLocale && ER.state.preloadedLang) {
        voice = ER.state.preloadedVoice;
        lang = ER.state.preloadedLang;
    } else {
        const result = await getVoiceForLocale(code);
        voice = result.voice;
        lang = result.lang;
        ER.state.preloadedVoice = voice || null;
        ER.state.preloadedLang = lang || 'en-US';
        ER.state.preloadedLocale = code;
    }

    if (voice) {
        utterance.voice = voice;
    }
    utterance.lang = lang || 'en-US';
    return { voice: voice || null, lang: utterance.lang };
}

  ER.loadVoices = loadVoices;
  ER.getEnglishVoice = getEnglishVoice;
  ER.getVoiceForLocale = getVoiceForLocale;
  ER.preloadDocumentVoice = preloadDocumentVoice;
  ER.applyVoiceForLocale = applyVoiceForLocale;
})(window.ER);
