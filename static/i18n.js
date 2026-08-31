(function () {
    'use strict';

    var SUPPORTED = ['en', 'es', 'fr', 'fil', 'pt', 'pa', 'tr', 'uk', 'ru', 'ht', 'zh', 'ar'];
    var LOCALE_LABELS = {
        en: 'EN',
        es: 'ES',
        fr: 'FR',
        fil: 'FIL',
        pt: 'PT',
        pa: 'PA',
        tr: 'TR',
        uk: 'UK',
        ru: 'RU',
        ht: 'HT',
        zh: 'ZH',
        ar: 'AR'
    };
    var STORAGE_KEY = 'locale';
    var SOURCE_META = '__source__';

    var currentLocale = 'en';
    var translations = {};
    var englishFallback = {};
    var englishReady = null;

    function isSupported(code) {
        return SUPPORTED.indexOf(code) !== -1;
    }

    function isRtlLocale(code) {
        return String(code || '').toLowerCase().replace('_', '-').split('-')[0] === 'ar';
    }

    function mapBrowserLang(tag) {
        if (!tag || typeof tag !== 'string') return null;
        var lower = tag.toLowerCase().replace('_', '-');
        var primary = lower.split('-')[0];

        if (primary === 'tl' || primary === 'fil') return 'fil';
        if (primary === 'zh') return 'zh';
        if (isSupported(primary)) return primary;
        if (isSupported(lower)) return lower;
        return null;
    }

    function resolveLocale() {
        try {
            var stored = localStorage.getItem(STORAGE_KEY);
            if (stored && isSupported(stored)) return stored;
        } catch (e) { /* ignore */ }

        var candidates = [];
        if (navigator.languages && navigator.languages.length) {
            candidates = candidates.concat(Array.prototype.slice.call(navigator.languages));
        }
        if (navigator.language) candidates.push(navigator.language);

        for (var i = 0; i < candidates.length; i++) {
            var mapped = mapBrowserLang(candidates[i]);
            if (mapped) return mapped;
        }
        return 'en';
    }

    function stripMeta(data) {
        var out = {};
        if (!data || typeof data !== 'object') return out;
        Object.keys(data).forEach(function (key) {
            if (key !== SOURCE_META) out[key] = data[key];
        });
        return out;
    }

    function fetchLocale(code) {
        return fetch('/i18n/' + code + '.json', { credentials: 'same-origin' })
            .then(function (res) {
                if (!res.ok) throw new Error('Failed to load locale ' + code);
                return res.json();
            })
            .then(stripMeta);
    }

    function ensureEnglish() {
        if (englishReady) return englishReady;
        englishReady = fetchLocale('en').then(function (data) {
            englishFallback = data;
            return data;
        }).catch(function () {
            englishFallback = {};
            return englishFallback;
        });
        return englishReady;
    }

    function t(key, vars) {
        var value = translations[key];
        if (value == null || value === '') value = englishFallback[key];
        if (value == null || value === '') value = key;
        if (vars && typeof value === 'string') {
            Object.keys(vars).forEach(function (name) {
                value = value.replace(new RegExp('\\{\\{' + name + '\\}\\}', 'g'), String(vars[name]));
            });
        }
        return value;
    }

    function syncLanguageSelector() {
        var label = document.querySelector('#languageBtn .language-btn-label');
        var languageCode = LOCALE_LABELS[currentLocale] || currentLocale.toUpperCase();
        if (label) label.textContent = languageCode;

        var languageBtn = document.getElementById('languageBtn');
        if (languageBtn) {
            languageBtn.setAttribute('aria-label', languageCode + ' — ' + t('lang.change'));
        }

        var options = document.querySelectorAll('.language-option[data-lang]');
        options.forEach(function (option) {
            var code = option.getAttribute('data-lang');
            var nativeName = LOCALE_LABELS[code];
            if (nativeName) option.textContent = nativeName;
            var selected = code === currentLocale;
            option.setAttribute('aria-selected', selected ? 'true' : 'false');
            option.classList.toggle('active', selected);
        });
    }

    function applyUITranslations() {
        // Chrome layout stays LTR for every locale; only document content
        // follows the reading direction of its own language.
        document.documentElement.lang = currentLocale;

        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            // Avoid overwriting the definition word while the modal is open
            if (el.id === 'definitionWord') {
                var modal = document.getElementById('definitionModal');
                if (modal && modal.style.display === 'block') return;
            }
            var key = el.getAttribute('data-i18n');
            if (key) el.textContent = t(key);
        });

        document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
            var key = el.getAttribute('data-i18n-aria');
            if (key) el.setAttribute('aria-label', t(key));
        });

        document.querySelectorAll('[data-i18n-alt]').forEach(function (el) {
            var key = el.getAttribute('data-i18n-alt');
            if (key) el.setAttribute('alt', t(key));
        });

        document.querySelectorAll('[data-home-label]').forEach(function (el) {
            el.setAttribute('aria-label', t('app.title') + ' — ' + t('app.returnHome'));
        });

        document.querySelectorAll('.speed-display').forEach(function (el) {
            var value = el.querySelector('.speed-value');
            el.setAttribute('aria-label', t('playback.speed') + ' ' + (value ? value.textContent.trim() : '1x'));
        });

        document.documentElement.style.setProperty(
            '--define-hover-label',
            JSON.stringify(t('define.hover'))
        );

        syncLanguageSelector();
    }

    function loadLocale(code) {
        var locale = isSupported(code) ? code : 'en';
        return ensureEnglish().then(function () {
            if (locale === 'en') {
                translations = Object.assign({}, englishFallback);
                currentLocale = 'en';
                return translations;
            }
            return fetchLocale(locale).then(function (data) {
                translations = data;
                currentLocale = locale;
                return translations;
            }).catch(function (err) {
                console.warn('i18n: falling back to English', err);
                translations = Object.assign({}, englishFallback);
                currentLocale = 'en';
                return translations;
            });
        });
    }

    function setLocale(code) {
        if (!isSupported(code)) return Promise.resolve();
        try {
            localStorage.setItem(STORAGE_KEY, code);
        } catch (e) { /* ignore */ }

        return loadLocale(code).then(function () {
            applyUITranslations();

            // A translated document follows the selected UI language. Keep its
            // direction and language isolated from the surrounding chrome.
            var toggle = document.getElementById('translateFileToggle');
            var reader = document.getElementById('text-display');
            if (
                toggle && toggle.checked &&
                reader && reader.textContent.trim() &&
                window.ER && window.ER.state
            ) {
                window.ER.state.documentLocale = currentLocale;
                reader.setAttribute('dir', isRtlLocale(currentLocale) ? 'rtl' : 'ltr');
                var contentLang = window.ER.resolveContentLang
                    ? window.ER.resolveContentLang(currentLocale)
                    : currentLocale;
                reader.setAttribute('lang', contentLang);
            }
        });
    }

    function getLocale() {
        return currentLocale;
    }

    var LOCALE_LANGUAGE_NAMES = {
        en: 'English',
        es: 'Spanish',
        fr: 'French',
        fil: 'Filipino',
        pt: 'Portuguese',
        pa: 'Punjabi',
        tr: 'Turkish',
        uk: 'Ukrainian',
        ru: 'Russian',
        ht: 'Haitian Creole',
        zh: 'Chinese',
        ar: 'Arabic'
    };

    function localeToLanguageName(code) {
        return LOCALE_LANGUAGE_NAMES[code] || 'English';
    }

    window.t = t;
    window.setLocale = setLocale;
    window.applyUITranslations = applyUITranslations;
    window.getLocale = getLocale;
    window.localeToLanguageName = localeToLanguageName;
    window.isRtlLocale = isRtlLocale;
    window.__SUPPORTED_LOCALES = SUPPORTED.slice();
    window.__LOCALE_LABELS = Object.assign({}, LOCALE_LABELS);

    var initial = resolveLocale();
    try {
        localStorage.setItem(STORAGE_KEY, initial);
    } catch (e) { /* ignore */ }

    window.i18nReady = loadLocale(initial).then(function () {
        function apply() {
            applyUITranslations();
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', apply);
        } else {
            apply();
        }
    });
})();
