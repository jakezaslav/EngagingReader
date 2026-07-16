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
    
    const dropdown = speedDisplay.querySelector('.speed-dropdown');
    const speedOptions = speedDisplay.querySelectorAll('.speed-option:not(.speed-label)');
    
    // Toggle dropdown on click
    speedDisplay.addEventListener('click', function(event) {
        // Close other dropdowns first
        document.querySelectorAll('.speed-dropdown.show').forEach(otherDropdown => {
            if (otherDropdown !== dropdown) {
                otherDropdown.classList.remove('show');
                otherDropdown.parentElement.classList.remove('active');
            }
        });
        
        // Toggle this dropdown
        dropdown.classList.toggle('show');
        speedDisplay.classList.toggle('active');
        
        // Prevent event from bubbling to document
        event.stopPropagation();
    });
    
    // Handle speed option selection
    speedOptions.forEach(option => {
        option.addEventListener('click', function(event) {
            const speed = parseFloat(this.getAttribute('data-speed'));
            const speedText = this.textContent;
            
            // Update the unified speech rate
            ER.state.speechRate = speed;
            
            // Update both main and modal displays
            const mainSpeedDisplay = document.getElementById('speedDisplay');
            const modalSpeedDisplay = document.getElementById('modalSpeedDisplay');
            
            [mainSpeedDisplay, modalSpeedDisplay].forEach(display => {
                if (display) {
                    const displayText = display.childNodes[0]; // Get the text node
                    if (displayText && displayText.nodeType === Node.TEXT_NODE) {
                        displayText.textContent = speedText;
                    }
                }
            });
            
            // Handle playback restart based on context
            if (context === 'main') {
                const wasPlaying = ER.state.isMainSpeaking && !ER.state.mainSpeechPaused;
                
                // If currently playing, restart from current word with new speed
                if (wasPlaying && ER.state.mainCurrentWordIndex >= 0) {
                    // Set the defined word to current position for seamless restart
                    ER.state.definedWordIndex = ER.state.mainCurrentWordIndex;
                    // Stop current speech
                    ER.state.speechSynthesis.cancel();
                    // Small delay to ensure clean restart
                    setTimeout(() => {
                        ER.resumeFromDefinedWord();
                    }, 50);
                }
            } else if (context === 'modal') {
                const wasPlaying = ER.state.isModalSpeaking && !ER.state.modalSpeechPaused;
                const currentWordBeforeChange = ER.state.modalCurrentWordIndex;
                
                // If currently playing, restart from current word with new speed
                if (wasPlaying && ER.state.modalCurrentWordIndex >= 0) {
                    // Stop current speech
                    ER.state.speechSynthesis.cancel();
                    // Restart from current position
                    setTimeout(() => {
                        ER.restartModalFromWord(currentWordBeforeChange);
                    }, 50);
                }
            }
            
            // Close dropdown
            dropdown.classList.remove('show');
            speedDisplay.classList.remove('active');
            
            event.stopPropagation();
        });
    });
}

function setupLanguageSelector() {
    const selector = document.getElementById('language-selector');
    const languageBtn = document.getElementById('languageBtn');
    const label = languageBtn?.querySelector('.language-btn-label');
    const dropdown = selector?.querySelector('.language-dropdown');
    if (!selector || !languageBtn || !dropdown || !label) return;

    languageBtn.addEventListener('click', function(event) {
        event.stopPropagation();
        const isOpen = dropdown.classList.toggle('show');
        selector.classList.toggle('open', isOpen);
        languageBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    dropdown.querySelectorAll('.language-option:not(.language-label)').forEach(option => {
        option.addEventListener('click', function(event) {
            event.stopPropagation();
            const lang = this.getAttribute('data-lang');
            if (lang && typeof window.setLocale === 'function') {
                window.setLocale(lang);
            } else {
                label.textContent = this.textContent.trim();
            }
            closeLanguageDropdown();
        });
    });
}

function closeLanguageDropdown() {
    const selector = document.getElementById('language-selector');
    const languageBtn = document.getElementById('languageBtn');
    const dropdown = selector?.querySelector('.language-dropdown');
    if (!selector || !dropdown) return;
    dropdown.classList.remove('show');
    selector.classList.remove('open');
    if (languageBtn) languageBtn.setAttribute('aria-expanded', 'false');
}

function setLanguageSelectorVisible(visible) {
    const selector = document.getElementById('language-selector');
    if (!selector) return;
    if (!visible) closeLanguageDropdown();
    selector.style.display = visible ? '' : 'none';
}

function showError(message) {
    ER.state.outputDiv.innerHTML = `<div style="color: #d32f2f; margin-top: -110px; font-size: 24pt; line-height: 1.1;">${message}</div>`;
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
  ER.setLanguageSelectorVisible = setLanguageSelectorVisible;
  ER.showError = showError;
  ER.announceStatus = announceStatus;
  ER.announceError = announceError;
})(window.ER);
