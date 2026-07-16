window.ER = window.ER || {};
(function (ER) {
'use strict';
// Handle word selection on click
function handleWordSelection(event) {
    let selectedText = '';
    let contextElement = null;

    // First, check if text is already selected
    const selection = window.getSelection();
    const selectionText = selection.toString().trim();

    if (selectionText && selectionText.split(' ').length === 1) {
        // Use the selected text
        selectedText = selectionText;
        const range = selection.getRangeAt(0);
        contextElement = range.commonAncestorContainer;
        if (contextElement.nodeType === Node.TEXT_NODE) {
            contextElement = contextElement.parentElement;
        }
    } else {
        // If no text selected, get the word that was clicked
        let target = event.target;
        
        // Check if clicked element is a word span
        if (target.classList && target.classList.contains('word')) {
            selectedText = target.textContent.trim();
            contextElement = target;
            
            // Store the clicked word element for resuming reading later
            ER.state.definedWordElement = target;
            
            // Find the index of this word in the main word spans array
            if (ER.state.mainWordSpans && ER.state.mainWordSpans.length > 0) {
                ER.state.definedWordIndex = ER.state.mainWordSpans.indexOf(target);
                // Also store this as the word that opened the modal for focus restoration
                ER.state.focusedWordIndex = ER.state.definedWordIndex;
            } else {
                ER.state.definedWordIndex = -1;
            }
        } else {
            // If clicked on text node, try to extract the word
            if (target.nodeType === Node.TEXT_NODE) {
                target = target.parentElement;
            }
            
            // If we can't identify a specific word span, don't show modal
            // This prevents accidental triggers on empty spaces or unwrapped text
            return;
        }
    }

    // Only proceed if we have a single word
    if (selectedText && selectedText.split(' ').length === 1) {
        // Find the closest meaningful container for context
        while (contextElement && 
               contextElement !== ER.state.outputDiv && 
               !['P', 'DIV', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(contextElement.tagName)) {
            contextElement = contextElement.parentElement;
        }
        
        // Get context from the meaningful container, fallback to full text
        let context = contextElement ? 
            (contextElement.textContent || contextElement.innerText) : 
            (ER.state.outputDiv.textContent || ER.state.outputDiv.innerText);

        // Limit context to a reasonable length
        context = context.substring(0, 500);

        // Pause main reading when user clicks a word (automatic pause, not manual)
        if (ER.state.isMainSpeaking) {
            ER.autoPauseForDefinition();
        } else {
            // If reading wasn't active, don't try to resume later
            ER.state.definedWordElement = null;
            ER.state.definedWordIndex = -1;
            ER.state.isManuallyPaused = false;
        }

        // Show loading state
        showDefinitionModal(selectedText, t('definition.loading'));

        // Get definition from Google AI
        getDefinition(selectedText, context)
            .then(definition => {
                showDefinitionModal(selectedText, definition);
            })
            .catch(error => {
                console.error('Error getting definition:', error);
                showDefinitionModal(selectedText, t('definition.loadFailed'));
            });
    }
}

// Show definition modal
function showDefinitionModal(word, content) {
    ER.state.definitionWord.textContent = word;

    // Format the content with word spans for highlighting and keyboard access
    ER.state.definitionContent.innerHTML = content.split('\n').map(paragraph => {
        if (paragraph.trim() === '') return '<div class="word-line"><br></div>';
        return `<div class="word-line">${paragraph.split(' ').map(word =>
            `<span class="word definition-word" tabindex="-1" role="button" aria-label="${word}">${word}</span>`
        ).join(' ')}</div>`;
    }).join('');

    // Store the word spans for highlighting
    ER.state.modalWordSpans = Array.from(document.querySelectorAll('.definition-word'));
    ER.state.modalWords = ER.state.modalWordSpans.map(span => span.textContent);
    ER.state.modalCurrentWordIndex = 0;
    
    // Reset modal focus state
    ER.state.modalFocusedWordIndex = -1;

    // Reset modal button states
    ER.updateModalButtonStates(false);

    ER.state.definitionModal.style.display = 'block';
    ER.setLanguageSelectorVisible(false);
}

// Close definition modal
function closeDefinitionModal() {
    stopDefinitionReading();
    ER.state.definitionModal.style.display = 'none';
    ER.setLanguageSelectorVisible(true);
    
    // Restore focus to the word that opened the modal (as requested)
    if (ER.state.definedWordIndex >= 0 && ER.state.definedWordIndex < ER.state.mainWordSpans.length) {
        ER.setWordFocus(ER.state.definedWordIndex);
    }
    // Do not auto-resume main reading when closing the definition modal
}

// Get definition from Google AI
async function getDefinition(word, context) {
    try {
        const response = await fetch('/get-definition', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                "word to define": word,
                "context sentence": context
            })
        });

        if (!response.ok) {
            throw new Error(t('errors.definitionFailed'));
        }

        const data = await response.json();
        return data.definition;
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

// Handle modal play button click - starts or resumes modal playback
function handleModalPlayClick() {

    
    const definitionText = ER.state.definitionContent.textContent;
    if (!definitionText) {

        return;
    }
    
    // If paused, resume
    if (ER.state.modalSpeechUtterance && ER.state.modalSpeechPaused) {

        resumeDefinitionReading();
    } else if (ER.state.isModalSpeaking) {
        // If already playing, restart from beginning

        stopDefinitionReading();
        setTimeout(() => readDefinitionAloud(), 100); // Small delay to ensure clean restart
    } else {
        // Start new playback

        readDefinitionAloud();
    }
}

// Handle modal pause button click - pauses modal playback
function handleModalPauseClick() {

    
    if (ER.state.isModalSpeaking && !ER.state.modalSpeechPaused) {
        pauseDefinitionReading();
    }
}

// Read the definition aloud with highlighting
async function readDefinitionAloud() {
    const definitionText = ER.state.definitionContent.textContent;
    if (!definitionText) return;

    // Stop any ongoing speech
    ER.stopAllSpeech();
    ER.state.modalCurrentWordIndex = 0;
    ER.state.isModalSpeaking = true;

    // Create utterance
    ER.state.modalSpeechUtterance = new SpeechSynthesisUtterance(definitionText);

    // Get and set English voice
    const englishVoice = await ER.getEnglishVoice();
    if (englishVoice) {
        ER.state.modalSpeechUtterance.voice = englishVoice;
        ER.state.modalSpeechUtterance.lang = englishVoice.lang;
    } else {
        ER.state.modalSpeechUtterance.lang = 'en-US';
    }

    // Set rate to current selection
    ER.state.modalSpeechUtterance.rate = ER.state.speechRate;

    // Event handlers
    ER.state.modalSpeechUtterance.onboundary = function(event) {
        if (event.name === 'word') {
            const charIndex = event.charIndex;
            let currentCharCount = 0;

            // Find which word we're at based on character index
            for (let i = 0; i < ER.state.modalWords.length; i++) {
                currentCharCount += ER.state.modalWords[i].length + (i === ER.state.modalWords.length - 1 ? 0 : 1); // +1 for space except last word
                if (currentCharCount > charIndex) {
                    ER.state.modalCurrentWordIndex = i;
                    ER.highlightModalCurrentWord(i);
                    break;
                }
            }
        }
    };

    ER.state.modalSpeechUtterance.onstart = function() {
        
        ER.state.isModalSpeaking = true;
        ER.updateModalButtonStates(true);
        
        // Clear ALL existing focus outlines when modal speech starts (same as main content)
        // Focus will now follow the speaking word automatically
        ER.clearAllModalKeyboardFocus();
    };

    ER.state.modalSpeechUtterance.onend = function() {

        ER.state.isModalSpeaking = false;
        ER.state.modalSpeechPaused = false;
        ER.updateModalButtonStates(false);
        ER.state.modalCurrentWordIndex = 0;
        ER.highlightModalCurrentWord(-1);
    };

    ER.state.modalSpeechUtterance.onpause = function() {
        ER.state.modalSpeechPaused = true;
        ER.updateModalButtonStates(false); // Show as paused state
    };

    ER.state.modalSpeechUtterance.onresume = function() {
        ER.state.modalSpeechPaused = false;
        ER.updateModalButtonStates(true); // Show as playing state
    };

    ER.state.modalSpeechUtterance.onerror = function(event) {
        // Ignore 'interrupted' errors as they're expected when switching
        if (event.error !== 'interrupted') {
            console.error('Modal SpeechSynthesis error:', event);
        }
        ER.state.isModalSpeaking = false;
        stopDefinitionReading();
    };

    // Set button states for starting modal speech
    ER.updateModalButtonStates(true);

    // Start speaking
    ER.state.speechSynthesis.speak(ER.state.modalSpeechUtterance);
}

// Pause the definition reading
function pauseDefinitionReading() {
    if (ER.state.modalSpeechUtterance && !ER.state.modalSpeechPaused) {
        ER.state.speechSynthesis.pause();
    }
}

// Resume paused definition reading
function resumeDefinitionReading() {
    if (ER.state.modalSpeechUtterance && ER.state.modalSpeechPaused) {
        ER.state.speechSynthesis.resume();
    }
}

// Stop definition reading completely
function stopDefinitionReading() {

    if (ER.state.isModalSpeaking) {
        ER.state.speechSynthesis.cancel();
        ER.state.isModalSpeaking = false;
    }
    ER.state.modalSpeechPaused = false;
    ER.updateModalButtonStates(false);
    ER.highlightModalCurrentWord(-1);
}

// Restart modal reading from a specific word index with new speed
async function restartModalFromWord(wordIndex) {
    if (wordIndex < 0 || !ER.state.modalWords || !ER.state.modalWordSpans) {
        return;
    }

    // Set the current word index
    ER.state.modalCurrentWordIndex = wordIndex;
    ER.state.isModalSpeaking = true;
    ER.state.modalSpeechPaused = false;

    // Create text starting from the specified word
    const remainingWords = ER.state.modalWords.slice(wordIndex);
    const textToSpeak = remainingWords.join(' ');

    // Create new utterance for the remaining text
    ER.state.modalSpeechUtterance = new SpeechSynthesisUtterance(textToSpeak);

    // Get and set English voice
    const englishVoice = await ER.getEnglishVoice();
    if (englishVoice) {
        ER.state.modalSpeechUtterance.voice = englishVoice;
        ER.state.modalSpeechUtterance.lang = englishVoice.lang;
    } else {
        ER.state.modalSpeechUtterance.lang = 'en-US';
    }

    // Set rate to current selection
    ER.state.modalSpeechUtterance.rate = ER.state.speechRate;

    // Event handlers
    ER.state.modalSpeechUtterance.onboundary = function(event) {
        if (event.name === 'word') {
            const charIndex = event.charIndex;
            let currentCharCount = 0;

            // Find which word we're at based on character index (relative to remaining words)
            for (let i = 0; i < remainingWords.length; i++) {
                currentCharCount += remainingWords[i].length + (i === remainingWords.length - 1 ? 0 : 1);
                if (currentCharCount > charIndex) {
                    ER.state.modalCurrentWordIndex = wordIndex + i;
                    ER.highlightModalCurrentWord(ER.state.modalCurrentWordIndex);
                    break;
                }
            }
        }
    };

    ER.state.modalSpeechUtterance.onstart = function() {
        ER.state.isModalSpeaking = true;
        ER.updateModalButtonStates(true);
        ER.clearAllModalKeyboardFocus();
    };

    ER.state.modalSpeechUtterance.onend = function() {
        ER.state.isModalSpeaking = false;
        ER.state.modalSpeechPaused = false;
        ER.updateModalButtonStates(false);
        ER.state.modalCurrentWordIndex = 0;
        ER.highlightModalCurrentWord(-1);
    };

    ER.state.modalSpeechUtterance.onpause = function() {
        ER.state.modalSpeechPaused = true;
        ER.updateModalButtonStates(false);
    };

    ER.state.modalSpeechUtterance.onresume = function() {
        ER.state.modalSpeechPaused = false;
        ER.updateModalButtonStates(true);
    };

    ER.state.modalSpeechUtterance.onerror = function(event) {
        if (event.error !== 'interrupted' && event.error !== 'canceled') {
            console.error('Modal SpeechSynthesis error:', event);
            ER.state.isModalSpeaking = false;
            stopDefinitionReading();
        }
    };

    // Highlight the starting word
    ER.highlightModalCurrentWord(wordIndex);

    // Set button states for resuming modal speech
    ER.updateModalButtonStates(true);

    // Start speaking from the specified word
    ER.state.speechSynthesis.speak(ER.state.modalSpeechUtterance);
}
  window.closeDefinitionModal = closeDefinitionModal;

  ER.handleWordSelection = handleWordSelection;
  ER.showDefinitionModal = showDefinitionModal;
  ER.closeDefinitionModal = closeDefinitionModal;
  ER.getDefinition = getDefinition;
  ER.handleModalPlayClick = handleModalPlayClick;
  ER.handleModalPauseClick = handleModalPauseClick;
  ER.readDefinitionAloud = readDefinitionAloud;
  ER.pauseDefinitionReading = pauseDefinitionReading;
  ER.resumeDefinitionReading = resumeDefinitionReading;
  ER.stopDefinitionReading = stopDefinitionReading;
  ER.restartModalFromWord = restartModalFromWord;
})(window.ER);
