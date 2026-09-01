window.ER = window.ER || {};
(function (ER) {
'use strict';
// Handle word selection on click
function handleWordSelection(event) {
    let selectedText = '';
    let contextElement = null;
    const documentLocale = ER.state.documentLocale || 'en';

    // First, check if text is already selected
    const selection = window.getSelection();
    const selectionText = selection.toString().trim();

    if (selectionText && ER.isSingleSegmenterWord(selectionText, documentLocale)) {
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
                // Clear any prior focus highlight before updating the tracked index
                // (avoids orphaned keyboard-focused classes when defining multiple words)
                ER.clearAllKeyboardFocus();
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

    // Only proceed if we have a single word (space-free Chinese multi-word
    // selections are rejected via segmenter count)
    if (selectedText && (
        (contextElement && contextElement.classList && contextElement.classList.contains('word')) ||
        ER.isSingleSegmenterWord(selectedText, documentLocale)
    )) {
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
    const wasOpen = ER.state.definitionModal.style.display === 'block';
    ER.state.definitionWord.textContent = word;

    const locale = typeof window.getLocale === 'function' ? window.getLocale() : 'en';
    const documentLocale = ER.state.documentLocale || locale;
    const dirFor = (code) => (
        typeof window.isRtlLocale === 'function' && window.isRtlLocale(code) ? 'rtl' : 'ltr'
    );

    // The heading is the selected word, so it follows the document's language.
    ER.state.definitionWord.setAttribute('dir', dirFor(documentLocale));
    ER.state.definitionContent.replaceChildren();
    ER.state.definitionContent.setAttribute('lang', ER.resolveContentLang(locale));
    // The definition itself is written in the UI language. Deriving direction
    // from the text would flip an English definition that opens with the
    // foreign word it defines.
    ER.state.definitionContent.setAttribute('dir', dirFor(locale));

    // Format the content with word spans for highlighting and keyboard access
    String(content || '').split('\n').forEach((paragraph) => {
        const line = document.createElement('div');
        line.className = 'word-line';
        if (paragraph.trim() === '') {
            line.appendChild(document.createElement('br'));
        } else {
            const segments = ER.segmentTextIntoWords(paragraph, locale);
            segments.forEach((segment) => {
                if (segment.isWordLike) {
                    const span = document.createElement('span');
                    span.className = 'word definition-word';
                    span.textContent = segment.text;
                    span.setAttribute('tabindex', '-1');
                    span.setAttribute('role', 'button');
                    span.setAttribute('aria-label', segment.text);
                    line.appendChild(span);
                } else if (segment.text) {
                    line.appendChild(document.createTextNode(segment.text));
                }
            });
        }
        ER.state.definitionContent.appendChild(line);
    });

    // Store the word spans for highlighting
    ER.state.modalWordSpans = Array.from(ER.state.definitionContent.querySelectorAll('.definition-word'));
    ER.state.modalWords = ER.state.modalWordSpans.map(span => span.textContent);
    ER.state.modalCurrentWordIndex = 0;
    
    // Reset modal focus state
    ER.state.modalFocusedWordIndex = -1;

    // Reset modal button states
    ER.updateModalButtonStates(false);

    ER.state.definitionModal.style.display = 'block';
    document.body.classList.add('definition-open');
    ER.closeLanguageDropdown();
    if (!wasOpen) {
        const closeButton = ER.state.definitionModal.querySelector('.close-btn');
        closeButton?.focus();
    }
}

// Close definition modal
function closeDefinitionModal() {
    stopDefinitionReading();
    ER.state.definitionModal.style.display = 'none';
    document.body.classList.remove('definition-open');
    
    // Restore focus to the word that opened the modal (as requested)
    const restoreIndex = ER.state.definedWordIndex >= 0
        ? ER.state.definedWordIndex
        : ER.state.focusedWordIndex;
    if (restoreIndex >= 0 && restoreIndex < ER.state.mainWordSpans.length) {
        ER.setWordFocus(restoreIndex);
    }
    // Do not auto-resume main reading when closing the definition modal
}

// Get definition from Google AI
async function getDefinition(word, context) {
    try {
        const locale = typeof window.getLocale === 'function' ? window.getLocale() : 'en';
        const languageName = typeof window.localeToLanguageName === 'function'
            ? window.localeToLanguageName(locale)
            : 'English';
        const response = await fetch('/get-definition', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                "word to define": word,
                "context sentence": context,
                "USER_LANGUAGE": languageName
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

    const wordOffsets = ER.computeWordOffsetsFromDom(
        ER.state.definitionContent,
        ER.state.modalWordSpans
    );

    // Create utterance
    ER.state.modalSpeechUtterance = new SpeechSynthesisUtterance(definitionText);

    // Match TTS voice to the user's UI language (definitions are localized)
    const locale = typeof window.getLocale === 'function' ? window.getLocale() : 'en';
    const { voice: definitionVoice, lang: definitionLang } = await ER.getVoiceForLocale(locale);
    if (definitionVoice) {
        ER.state.modalSpeechUtterance.voice = definitionVoice;
    }
    ER.state.modalSpeechUtterance.lang = definitionLang || 'en-US';

    // Set rate to current selection
    ER.state.modalSpeechUtterance.rate = ER.state.speechRate;

    // Event handlers
    ER.state.modalSpeechUtterance.onboundary = function(event) {
        if (event.name === 'word') {
            const idx = ER.findWordIndexAtChar(event.charIndex, wordOffsets);
            if (idx >= 0) {
                ER.state.modalCurrentWordIndex = idx;
                ER.highlightModalCurrentWord(idx);
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

    // Speak from the word using DOM text (preserves CJK separators)
    const startSpan = ER.state.modalWordSpans[wordIndex];
    const remainingSpans = ER.state.modalWordSpans.slice(wordIndex);
    const textToSpeak = ER.getTextFromSpanToEnd(ER.state.definitionContent, startSpan);
    const wordOffsets = ER.computeWordOffsetsFromDom(
        ER.state.definitionContent,
        remainingSpans,
        startSpan
    );

    // Create new utterance for the remaining text
    ER.state.modalSpeechUtterance = new SpeechSynthesisUtterance(textToSpeak);

    // Match TTS voice to the user's UI language (definitions are localized)
    const locale = typeof window.getLocale === 'function' ? window.getLocale() : 'en';
    const { voice: definitionVoice, lang: definitionLang } = await ER.getVoiceForLocale(locale);
    if (definitionVoice) {
        ER.state.modalSpeechUtterance.voice = definitionVoice;
    }
    ER.state.modalSpeechUtterance.lang = definitionLang || 'en-US';

    // Set rate to current selection
    ER.state.modalSpeechUtterance.rate = ER.state.speechRate;

    // Event handlers
    ER.state.modalSpeechUtterance.onboundary = function(event) {
        if (event.name === 'word') {
            const i = ER.findWordIndexAtChar(event.charIndex, wordOffsets);
            if (i >= 0) {
                ER.state.modalCurrentWordIndex = wordIndex + i;
                ER.highlightModalCurrentWord(ER.state.modalCurrentWordIndex);
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
