window.ER = window.ER || {};
(function (ER) {
'use strict';

/**
 * Map app locale codes to BCP 47 tags that Intl.Segmenter handles well.
 */
function resolveSegmenterLocale(locale) {
    const code = String(locale || 'en').toLowerCase().replace(/_/g, '-');
    const primary = code.split('-')[0] || 'en';
    if (primary === 'zh') {
        if (code.includes('hant') || code.includes('tw') || code.includes('hk')) {
            return 'zh-Hant';
        }
        return 'zh-Hans';
    }
    return code || 'en';
}

/**
 * Prefer a Chinese segmenter when text contains CJK, even if documentLocale is en
 * (e.g. Chinese OCR with translate off).
 */
function localeForSegmentation(text, locale) {
    const preferred = resolveSegmenterLocale(locale);
    if (/[\u3400-\u9fff\uf900-\ufaff]/.test(text || '')) {
        const primary = preferred.split('-')[0];
        if (primary === 'zh' || primary === 'ja' || primary === 'ko') {
            return preferred;
        }
        return 'zh-Hans';
    }
    return preferred;
}

/**
 * lang attribute value for content containers.
 */
function resolveContentLang(locale) {
    return resolveSegmenterLocale(locale);
}

/**
 * Best-guess app locale for text whose language is not known up front
 * (untranslated OCR output). Only non-Latin scripts are identified here;
 * Latin-script text is ambiguous between supported locales, so it keeps the
 * caller's fallback.
 */
function detectTextLocale(text, fallbackLocale) {
    const sample = String(text || '');
    if (/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/.test(sample)) {
        return 'ar';
    }
    if (/[\u3400-\u9fff\uf900-\ufaff]/.test(sample)) {
        return 'zh';
    }
    if (/[\u0a00-\u0a7f]/.test(sample)) {
        return 'pa';
    }
    if (/[\u0400-\u04ff]/.test(sample)) {
        // Letters present in Ukrainian but not Russian
        return /[\u0404\u0406\u0407\u0454\u0456\u0457\u0490\u0491]/.test(sample) ? 'uk' : 'ru';
    }
    return fallbackLocale || 'en';
}

/**
 * Locale-aware word segmentation.
 * Returns { text, isWordLike, start, end }[].
 * Falls back to whitespace splitting when Intl.Segmenter is unavailable.
 */
function segmentTextIntoWords(text, locale) {
    if (text == null || text === '') {
        return [];
    }

    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
        try {
            const segmenter = new Intl.Segmenter(localeForSegmentation(text, locale), {
                granularity: 'word'
            });
            const segments = [];
            for (const part of segmenter.segment(text)) {
                const isWordLike = typeof part.isWordLike === 'boolean'
                    ? part.isWordLike
                    : /\S/.test(part.segment);
                segments.push({
                    text: part.segment,
                    isWordLike: isWordLike,
                    start: part.index,
                    end: part.index + part.segment.length
                });
            }
            return segments;
        } catch (err) {
            console.warn('Intl.Segmenter failed; falling back to whitespace split', err);
        }
    }

    return segmentByWhitespace(text);
}

function segmentByWhitespace(text) {
    const segments = [];
    const re = /\S+/g;
    let match;
    let lastIndex = 0;
    while ((match = re.exec(text)) !== null) {
        if (match.index > lastIndex) {
            segments.push({
                text: text.slice(lastIndex, match.index),
                isWordLike: false,
                start: lastIndex,
                end: match.index
            });
        }
        segments.push({
            text: match[0],
            isWordLike: true,
            start: match.index,
            end: match.index + match[0].length
        });
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
        segments.push({
            text: text.slice(lastIndex),
            isWordLike: false,
            start: lastIndex,
            end: text.length
        });
    }
    return segments;
}

/**
 * True when trimmed text is exactly one word-like segment.
 */
function isSingleSegmenterWord(text, locale) {
    const trimmed = String(text || '').trim();
    if (!trimmed) {
        return false;
    }
    const words = segmentTextIntoWords(trimmed, locale).filter(function (s) {
        return s.isWordLike;
    });
    return words.length === 1 && words[0].text === trimmed;
}

/**
 * Char offset of a node within container.textContent (via Range).
 */
function getCharOffsetBefore(container, node) {
    const range = document.createRange();
    range.selectNodeContents(container);
    range.setEndBefore(node);
    return range.toString().length;
}

/**
 * Spoken substring from a word span through the end of the container,
 * preserving original separators (no invented spaces between CJK words).
 */
function getTextFromSpanToEnd(container, span) {
    if (!container || !span) {
        return '';
    }
    const range = document.createRange();
    range.selectNodeContents(container);
    range.setStartBefore(span);
    return range.toString();
}

/**
 * Build [start, end) offsets for word spans relative to spoken text.
 * If baseSpan is set, offsets are relative to text starting at that span.
 */
function computeWordOffsetsFromDom(container, wordSpans, baseSpan) {
    if (!container || !wordSpans || wordSpans.length === 0) {
        return [];
    }
    const base = baseSpan ? getCharOffsetBefore(container, baseSpan) : 0;
    return wordSpans.map(function (span) {
        const start = getCharOffsetBefore(container, span) - base;
        return { start: start, end: start + (span.textContent || '').length };
    });
}

/**
 * Map a SpeechSynthesis boundary charIndex to a word offset index.
 */
function findWordIndexAtChar(charIndex, offsets) {
    if (!offsets || offsets.length === 0) {
        return -1;
    }
    for (let i = 0; i < offsets.length; i++) {
        if (charIndex >= offsets[i].start && charIndex < offsets[i].end) {
            return i;
        }
    }
    // Gap / punctuation between words: stick with the preceding word
    let preceding = -1;
    for (let i = 0; i < offsets.length; i++) {
        if (offsets[i].start <= charIndex) {
            preceding = i;
        } else {
            break;
        }
    }
    if (preceding >= 0) {
        return preceding;
    }
    return 0;
}

ER.resolveSegmenterLocale = resolveSegmenterLocale;
ER.resolveContentLang = resolveContentLang;
ER.detectTextLocale = detectTextLocale;
ER.segmentTextIntoWords = segmentTextIntoWords;
ER.isSingleSegmenterWord = isSingleSegmenterWord;
ER.getTextFromSpanToEnd = getTextFromSpanToEnd;
ER.computeWordOffsetsFromDom = computeWordOffsetsFromDom;
ER.findWordIndexAtChar = findWordIndexAtChar;
})(window.ER);
