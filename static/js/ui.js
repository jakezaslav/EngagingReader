window.ER = window.ER || {};
(function (ER) {
'use strict';
function updateButtonStates(isPlaying) {
    if (isPlaying) {
        // When playing: play button selected, pause button available
        ER.state.playBtn.classList.add('playing');
        ER.state.pauseBtn.classList.add('playing');
        ER.state.playBtn.disabled = false; // Can still click to restart
        ER.state.pauseBtn.disabled = false; // Can pause
    } else {
        // When paused/stopped: play button available, pause button selected
        ER.state.playBtn.classList.remove('playing');
        ER.state.pauseBtn.classList.remove('playing');
        ER.state.playBtn.disabled = false; // Can play/resume
        ER.state.pauseBtn.disabled = true; // Can't pause when not playing
    }
}

// Update modal button states and icons based on playing status
function updateModalButtonStates(isPlaying) {
    if (isPlaying) {
        // When playing: play button selected, pause button available
        ER.state.modalPlayBtn.classList.add('playing');
        ER.state.modalPauseBtn.classList.add('playing');
        ER.state.modalPlayBtn.disabled = false; // Can still click to restart
        ER.state.modalPauseBtn.disabled = false; // Can pause
    } else {
        // When paused/stopped: play button available, pause button selected
        ER.state.modalPlayBtn.classList.remove('playing');
        ER.state.modalPauseBtn.classList.remove('playing');
        ER.state.modalPlayBtn.disabled = false; // Can play/resume
        ER.state.modalPauseBtn.disabled = true; // Can't pause when not playing
    }
}

function setupSpeedControl(displayId, context) {
    const speedDisplay = document.getElementById(displayId);
    if (!speedDisplay) return;

    const control = speedDisplay.closest('.speed-control');
    const dropdown = control?.querySelector('.speed-dropdown');
    const speedOptions = Array.from(dropdown?.querySelectorAll('[role="option"]') || []);
    if (!control || !dropdown || speedOptions.length === 0) return;

    function closeDropdown(returnFocus) {
        dropdown.classList.remove('show');
        speedDisplay.classList.remove('active');
        speedDisplay.setAttribute('aria-expanded', 'false');
        if (returnFocus) speedDisplay.focus();
    }

    function openDropdown() {
        document.querySelectorAll('.speed-dropdown.show').forEach(otherDropdown => {
            if (otherDropdown !== dropdown) {
                otherDropdown.classList.remove('show');
                const otherControl = otherDropdown.closest('.speed-control');
                const otherTrigger = otherControl?.querySelector('.speed-display');
                otherTrigger?.classList.remove('active');
                otherTrigger?.setAttribute('aria-expanded', 'false');
            }
        });
        dropdown.classList.add('show');
        speedDisplay.classList.add('active');
        speedDisplay.setAttribute('aria-expanded', 'true');
    }

    function focusOption(index) {
        speedOptions[(index + speedOptions.length) % speedOptions.length].focus();
    }

    function selectOption(option) {
        const speed = parseFloat(option.getAttribute('data-speed'));
        const speedText = option.textContent.trim();

        ER.state.speechRate = speed;

        document.querySelectorAll('.speed-control').forEach(speedControl => {
            const display = speedControl.querySelector('.speed-display');
            const value = speedControl.querySelector('.speed-value');
            const options = speedControl.querySelectorAll('[role="option"]');
            if (value) value.textContent = speedText;
            if (display) display.setAttribute('aria-label', `${t('playback.speed')} ${speedText}`);
            options.forEach(candidate => {
                candidate.setAttribute(
                    'aria-selected',
                    candidate.getAttribute('data-speed') === option.getAttribute('data-speed') ? 'true' : 'false'
                );
            });
        });

        if (context === 'main') {
            const wasPlaying = ER.state.isMainSpeaking && !ER.state.mainSpeechPaused;
            if (wasPlaying && ER.state.mainCurrentWordIndex >= 0) {
                ER.state.definedWordIndex = ER.state.mainCurrentWordIndex;
                ER.state.speechSynthesis.cancel();
                setTimeout(() => ER.resumeFromDefinedWord(), 50);
            }
        } else if (context === 'modal') {
            const wasPlaying = ER.state.isModalSpeaking && !ER.state.modalSpeechPaused;
            const currentWordBeforeChange = ER.state.modalCurrentWordIndex;
            if (wasPlaying && currentWordBeforeChange >= 0) {
                ER.state.speechSynthesis.cancel();
                setTimeout(() => ER.restartModalFromWord(currentWordBeforeChange), 50);
            }
        }

        closeDropdown(true);
    }

    speedDisplay.addEventListener('click', function(event) {
        const isOpen = dropdown.classList.contains('show');
        if (isOpen) closeDropdown(false);
        else openDropdown();
        event.stopPropagation();
    });

    speedDisplay.addEventListener('keydown', function(event) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openDropdown();
            const selectedIndex = Math.max(0, speedOptions.findIndex(option => option.getAttribute('aria-selected') === 'true'));
            focusOption(event.key === 'ArrowDown' ? selectedIndex : selectedIndex - 1);
        } else if (event.key === 'Escape' && dropdown.classList.contains('show')) {
            event.preventDefault();
            closeDropdown(true);
        }
    });

    speedOptions.forEach(option => {
        option.addEventListener('click', function(event) {
            selectOption(this);
            event.stopPropagation();
        });

        option.addEventListener('keydown', function(event) {
            const index = speedOptions.indexOf(this);
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                focusOption(index + 1);
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                focusOption(index - 1);
            } else if (event.key === 'Home') {
                event.preventDefault();
                focusOption(0);
            } else if (event.key === 'End') {
                event.preventDefault();
                focusOption(speedOptions.length - 1);
            } else if (event.key === 'Escape') {
                event.preventDefault();
                closeDropdown(true);
            }
        });
    });
}

function setupLanguageSelector() {
    const selector = document.getElementById('language-selector');
    const languageBtn = document.getElementById('languageBtn');
    const label = languageBtn?.querySelector('.language-btn-label');
    const dropdown = selector?.querySelector('.language-dropdown');
    if (!selector || !languageBtn || !dropdown || !label) return;

    const languageOptions = Array.from(
        dropdown.querySelectorAll('.language-option:not(.language-label)')
    );

    function openDropdown() {
        dropdown.classList.add('show');
        selector.classList.add('open');
        languageBtn.setAttribute('aria-expanded', 'true');
    }

    function focusOption(index) {
        languageOptions[(index + languageOptions.length) % languageOptions.length].focus();
    }

    function selectLanguage(option) {
        const lang = option.getAttribute('data-lang');
        if (lang && typeof window.setLocale === 'function') {
            window.setLocale(lang);
        } else {
            label.textContent = option.textContent.trim();
        }
        closeLanguageDropdown(true);
    }

    languageBtn.addEventListener('click', function(event) {
        event.stopPropagation();
        const isOpen = dropdown.classList.toggle('show');
        selector.classList.toggle('open', isOpen);
        languageBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    languageBtn.addEventListener('keydown', function(event) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openDropdown();
            const selectedIndex = Math.max(
                0,
                languageOptions.findIndex((option) => option.getAttribute('aria-selected') === 'true')
            );
            focusOption(event.key === 'ArrowDown' ? selectedIndex : selectedIndex - 1);
        } else if (event.key === 'Escape' && dropdown.classList.contains('show')) {
            event.preventDefault();
            closeLanguageDropdown(true);
        }
    });

    languageOptions.forEach((option) => {
        option.addEventListener('click', function(event) {
            event.stopPropagation();
            selectLanguage(this);
        });

        option.addEventListener('keydown', function(event) {
            const index = languageOptions.indexOf(this);
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                focusOption(index + 1);
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                focusOption(index - 1);
            } else if (event.key === 'Home') {
                event.preventDefault();
                focusOption(0);
            } else if (event.key === 'End') {
                event.preventDefault();
                focusOption(languageOptions.length - 1);
            } else if (event.key === 'Escape') {
                event.preventDefault();
                closeLanguageDropdown(true);
            } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectLanguage(this);
            }
        });
    });
}

function closeLanguageDropdown(returnFocus) {
    const selector = document.getElementById('language-selector');
    const languageBtn = document.getElementById('languageBtn');
    const dropdown = selector?.querySelector('.language-dropdown');
    if (!selector || !dropdown) return;
    dropdown.classList.remove('show');
    selector.classList.remove('open');
    if (languageBtn) {
        languageBtn.setAttribute('aria-expanded', 'false');
        if (returnFocus) languageBtn.focus();
    }
}

const TRANSLATE_FILE_STORAGE_KEY = 'translateFile';

function setupTranslateToggle() {
    const toggle = document.getElementById('translateFileToggle');
    if (!toggle) return;

    try {
        const stored = localStorage.getItem(TRANSLATE_FILE_STORAGE_KEY);
        if (stored === 'true' || stored === 'false') {
            toggle.checked = stored === 'true';
        }
    } catch (e) { /* ignore */ }

    toggle.addEventListener('change', function() {
        try {
            localStorage.setItem(TRANSLATE_FILE_STORAGE_KEY, toggle.checked ? 'true' : 'false');
        } catch (e) { /* ignore */ }
    });
}

/*
 * The banner is fixed and its height changes with the viewport, the user's font
 * size and title wrapping, so anything positioned under it reads the measured
 * value from --banner-height instead of hard-coding an offset.
 */
function trackBannerHeight() {
    const banner = document.querySelector('header.banner');
    if (!banner) return;

    const syncBannerHeight = () => {
        const height = Math.round(banner.getBoundingClientRect().height);
        document.documentElement.style.setProperty('--banner-height', height + 'px');
    };

    syncBannerHeight();

    if (typeof ResizeObserver === 'function') {
        new ResizeObserver(syncBannerHeight).observe(banner);
    } else {
        window.addEventListener('resize', syncBannerHeight);
    }
}

function clearUploadError() {
    const errorEl = document.getElementById('upload-error');
    if (!errorEl) return;

    const titleEl = errorEl.querySelector('.upload-error-title');
    const detailEl = errorEl.querySelector('.upload-error-detail');
    if (titleEl) titleEl.textContent = '';
    if (detailEl) detailEl.textContent = '';
    errorEl.hidden = true;

    const fileInput = ER.state.fileInput;
    if (fileInput) {
        fileInput.setAttribute('aria-describedby', 'upload-hint');
    }

    const liveRegion = document.getElementById('upload-errors');
    if (liveRegion) liveRegion.textContent = '';
}

function showUploadError(category) {
    const title = t('errors.' + category + '.title');
    const detail = t('errors.' + category + '.detail');
    const message = title + '. ' + detail;

    const errorEl = document.getElementById('upload-error');
    if (errorEl) {
        const titleEl = errorEl.querySelector('.upload-error-title');
        const detailEl = errorEl.querySelector('.upload-error-detail');
        if (titleEl) titleEl.textContent = title;
        if (detailEl) detailEl.textContent = detail;
        errorEl.hidden = false;
        errorEl.focus();
    }

    if (ER.state.outputDiv) {
        ER.state.outputDiv.innerHTML = '';
    }

    const fileInput = ER.state.fileInput;
    if (fileInput) {
        fileInput.value = '';
        fileInput.setAttribute('aria-describedby', 'upload-hint upload-error');
    }

    announceError(message);
}

function announceStatus(message) {
    const statusElement = document.getElementById('upload-status');
    if (statusElement) {
        statusElement.textContent = message;
    }
}

function announceError(message) {
    const errorElement = document.getElementById('upload-errors');
    if (errorElement) {
        errorElement.textContent = message;
    }
}
  ER.updateButtonStates = updateButtonStates;
  ER.updateModalButtonStates = updateModalButtonStates;
  ER.setupSpeedControl = setupSpeedControl;
  ER.setupLanguageSelector = setupLanguageSelector;
  ER.closeLanguageDropdown = closeLanguageDropdown;
  ER.setupTranslateToggle = setupTranslateToggle;
  ER.trackBannerHeight = trackBannerHeight;
  ER.clearUploadError = clearUploadError;
  ER.showUploadError = showUploadError;
  ER.announceStatus = announceStatus;
  ER.announceError = announceError;
})(window.ER);
