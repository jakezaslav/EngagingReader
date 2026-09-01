window.ER = window.ER || {};
(function (ER) {
'use strict';
function wrapWordsInSpans(node) {
    // Ignore nodes that aren't elements or text
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE) {
        return;
    }

    // If it's a text node, wrap its words
    if (node.nodeType === Node.TEXT_NODE) {
        // Don't wrap empty/whitespace-only text nodes
        if (node.textContent.trim() === '') {
            return;
        }

        const fragment = document.createDocumentFragment();
        const locale = ER.state.documentLocale || 'en';
        const segments = ER.segmentTextIntoWords(node.textContent, locale);

        segments.forEach((segment) => {
            if (segment.isWordLike) {
                const span = document.createElement('span');
                span.className = 'word highlight-word';
                span.textContent = segment.text;

                // Make word keyboard accessible with roving tabindex
                span.setAttribute('tabindex', '-1');
                span.setAttribute('role', 'button');
                span.setAttribute('aria-label', segment.text);

                // dir on the element is a bidi isolate, so digits, dates and
                // phone numbers keep their logical order inside RTL text.
                if (segment.isNumeric) {
                    span.setAttribute('dir', 'ltr');
                }

                fragment.appendChild(span);
            } else if (segment.text) {
                // Preserve original separators (spaces, punctuation) — do not invent spaces
                fragment.appendChild(document.createTextNode(segment.text));
            }
        });

        // Replace the original text node with the new fragment containing spans
        node.parentNode.replaceChild(fragment, node);
        return;
    }

    // If it's an element, recursively call this function on its children
    // We convert childNodes to an array because the collection is live and will be modified
    const children = Array.from(node.childNodes);
    children.forEach(child => wrapWordsInSpans(child));
}

// Highlight the current word being spoken in main content
function highlightCurrentWord(index) {
    // Remove current-word class from all words
    ER.state.mainWordSpans.forEach(span => {
        span.classList.remove('current-word');
        span.classList.remove('highlight');
    });

    // Add current-word class to current word
    if (index >= 0 && index < ER.state.mainWordSpans.length) {
        ER.state.mainWordSpans[index].classList.add('current-word');
        ER.state.mainWordSpans[index].classList.add('highlight');
        
        // Make keyboard focus follow the speaking word (don't remove speech highlights)
        ER.setWordFocusFromSpeech(index);
    }
}

// Highlight the current word being spoken in definition modal
function highlightModalCurrentWord(index) {
    // Remove current-word class from all words
    ER.state.modalWordSpans.forEach(span => {
        span.classList.remove('definition-current-word');
        span.classList.remove('highlight');
    });

    // Add current-word class to current word
    if (index >= 0 && index < ER.state.modalWordSpans.length) {
        ER.state.modalWordSpans[index].classList.add('definition-current-word');
        ER.state.modalWordSpans[index].classList.add('highlight');
        
        // Make keyboard focus follow the speaking word in modal (same as main content)
        ER.setModalWordFocusFromSpeech(index);
    }
}

// Stop all speech synthesis
function stopAllSpeech() {
    if (ER.state.speechSynthesis.speaking || ER.state.speechSynthesis.paused) {
        ER.state.speechSynthesis.cancel();
    }
    // Don't immediately reset speaking states as the error handlers might need them
    // Let the individual functions handle their own state management
}

// Read the extracted text aloud with highlighting
async function readText() {
    if (!ER.state.currentText) {
        return;
    }

    // Stop any ongoing speech
    stopAllSpeech();
    ER.state.mainCurrentWordIndex = 0;
    ER.state.isMainSpeaking = true;
    
    // Reset defined word tracking since we're starting fresh
    ER.state.definedWordElement = null;
    ER.state.definedWordIndex = -1;
    ER.state.isManuallyPaused = false;

    // 1. Plain text for TTS — use the live DOM so it matches word-span offsets
    const cleanText = ER.state.outputDiv.textContent || '';

    // 2. Get all word spans for highlighting (words are already wrapped)
    ER.state.mainWordSpans = Array.from(ER.state.outputDiv.querySelectorAll('.highlight-word'));
    ER.state.mainWords = ER.state.mainWordSpans.map(span => span.textContent);
    const wordOffsets = ER.computeWordOffsetsFromDom(
        ER.state.outputDiv,
        ER.state.mainWordSpans
    );

    // Chrome fix: Start a dummy utterance immediately to establish speech context
    const isChrome = /chrome/i.test(navigator.userAgent) && !/edg/i.test(navigator.userAgent);
    if (isChrome) {

        const dummyUtterance = new SpeechSynthesisUtterance('');
        dummyUtterance.volume = 0;
        ER.state.speechSynthesis.speak(dummyUtterance);
    }

    // Create utterance
    ER.state.mainSpeechUtterance = new SpeechSynthesisUtterance(cleanText);

    // Use document-locale voice (matches OCR output language)
    await ER.applyVoiceForLocale(ER.state.mainSpeechUtterance, ER.state.documentLocale || 'en');

    // Set rate to current selection
    ER.state.mainSpeechUtterance.rate = ER.state.speechRate;

    // Event handlers
    ER.state.mainSpeechUtterance.onboundary = function(event) {
        if (event.name === 'word') {
            const idx = ER.findWordIndexAtChar(event.charIndex, wordOffsets);
            if (idx >= 0) {
                ER.state.mainCurrentWordIndex = idx;
                highlightCurrentWord(idx);
            }
        }
    };

    ER.state.mainSpeechUtterance.onend = function() {

        ER.state.isMainSpeaking = false;
        ER.state.mainSpeechPaused = false;
        ER.updateButtonStates(false);
        ER.state.mainCurrentWordIndex = 0;
        highlightCurrentWord(-1);
        ER.state.isManuallyPaused = false; // Reset manual pause flag
    };

    ER.state.mainSpeechUtterance.onpause = function() {
        ER.state.mainSpeechPaused = true;
        ER.updateButtonStates(false); // Show as paused state
    };

    ER.state.mainSpeechUtterance.onresume = function() {
        ER.state.mainSpeechPaused = false;
        ER.updateButtonStates(true); // Show as playing state
    };

    ER.state.mainSpeechUtterance.onstart = function() {
        
        ER.state.isMainSpeaking = true;
        ER.updateButtonStates(true);
        
        // Clear ALL existing focus outlines when speech starts
        // Focus will now follow the speaking word automatically
        ER.clearAllKeyboardFocus();
    };

    ER.state.mainSpeechUtterance.onerror = function(event) {
        console.error('❌ Speech error:', event.error);
        
        // Ignore 'interrupted' and 'canceled' errors as they're expected when switching/resuming
        if (event.error !== 'interrupted' && event.error !== 'canceled') {
            // Chrome fallback: try again with a fresh utterance
            if (isChrome && event.error !== 'not-allowed') {
    
                setTimeout(() => {
        
                    const retryUtterance = new SpeechSynthesisUtterance(cleanText);
                    retryUtterance.voice = ER.state.mainSpeechUtterance.voice;
                    retryUtterance.lang = ER.state.mainSpeechUtterance.lang;
                    retryUtterance.rate = ER.state.mainSpeechUtterance.rate;
                    
                    // Copy main event handlers
                    retryUtterance.onboundary = ER.state.mainSpeechUtterance.onboundary;
                    retryUtterance.onend = ER.state.mainSpeechUtterance.onend;
                    retryUtterance.onstart = ER.state.mainSpeechUtterance.onstart;
                    retryUtterance.onpause = ER.state.mainSpeechUtterance.onpause;
                    retryUtterance.onresume = ER.state.mainSpeechUtterance.onresume;
                    
                    ER.state.speechSynthesis.speak(retryUtterance);
                    ER.state.mainSpeechUtterance = retryUtterance; // Update reference
                }, 100);
            } else {
                console.error('Main SpeechSynthesis error (fallback failed):', event);
                ER.state.isMainSpeaking = false;
                stopReading();
            }
        }
    };

    // Set button states for starting speech (will be updated by onstart event)
    ER.updateButtonStates(true);

    // Start speaking




    
    // Chrome-specific: Try immediate start first if voice/lang is ready for this document
    if (isChrome) {
        const voiceReady = ER.state.preloadedLocale === (ER.state.documentLocale || 'en') &&
            (ER.state.preloadedVoice || ER.state.preloadedLang);
        if (voiceReady) {
    
            ER.state.speechSynthesis.speak(ER.state.mainSpeechUtterance);
    
            
            // Still monitor for silent failures
            setTimeout(() => {
                if (ER.state.isMainSpeaking && !ER.state.speechSynthesis.speaking) {
        
                    ER.state.speechSynthesis.cancel();
                    setTimeout(() => {
                        ER.state.speechSynthesis.speak(ER.state.mainSpeechUtterance);
                    }, 50);
                }
            }, 200);
        } else {
    
            setTimeout(() => {
                ER.state.speechSynthesis.speak(ER.state.mainSpeechUtterance);
        
                
                // Set a timeout to detect if Chrome is ignoring the speech request
                setTimeout(() => {
                    if (ER.state.isMainSpeaking && !ER.state.speechSynthesis.speaking) {
            
                        ER.state.speechSynthesis.cancel();
                        ER.state.speechSynthesis.speak(ER.state.mainSpeechUtterance);
                    }
                }, 500);
            }, 50);
        }
    } else {
        ER.state.speechSynthesis.speak(ER.state.mainSpeechUtterance);

    }
}

// Handle play button click - starts or resumes playback
function handlePlayClick() {

    
    if (!ER.state.currentText) {

        return;
    }
    
    // If paused, resume
    if (ER.state.mainSpeechUtterance && ER.state.mainSpeechPaused) {

        resumeReading();
    } else if (ER.state.isMainSpeaking) {
        // If already playing, restart from beginning

        stopReading();
        setTimeout(() => readText(), 100); // Small delay to ensure clean restart
    } else {
        // Start new playback

        readText();
    }
}

// Handle pause button click - pauses playback
function handlePauseClick() {

    
    if (ER.state.isMainSpeaking && !ER.state.mainSpeechPaused) {
        pauseReading();
    }
}

// Pause the main reading
function pauseReading() {
    if (ER.state.mainSpeechUtterance && !ER.state.mainSpeechPaused) {
        ER.state.speechSynthesis.pause();
        ER.state.isManuallyPaused = true; // Mark as manually paused

    }
}

// Auto-pause for definition (doesn't set manual pause flag)
function autoPauseForDefinition() {
    if (ER.state.mainSpeechUtterance && !ER.state.mainSpeechPaused) {
        ER.state.speechSynthesis.pause();

    }
}

// Resume paused main reading
function resumeReading() {
    if (ER.state.definedWordIndex >= 0 && ER.state.mainWords && ER.state.mainWords.length > 0) {
        // If there's a defined word, always prioritize resuming from that word

        resumeFromDefinedWord();
        ER.state.isManuallyPaused = false; // Reset manual pause flag since we're overriding it
    } else if (ER.state.isManuallyPaused) {
        // If manually paused (and no defined word), do regular resume

        if (ER.state.mainSpeechUtterance && ER.state.mainSpeechPaused) {
            ER.state.speechSynthesis.resume();
            ER.state.isManuallyPaused = false; // Reset manual pause flag
        }
    } else if (ER.state.mainSpeechUtterance && ER.state.mainSpeechPaused) {

        ER.state.speechSynthesis.resume();
    }
}

// Stop main reading completely
function stopReading() {

    if (ER.state.isMainSpeaking) {
        ER.state.speechSynthesis.cancel();
        ER.state.isMainSpeaking = false;
    }
    ER.state.mainSpeechPaused = false;
    ER.updateButtonStates(false);
    highlightCurrentWord(-1);
    
    // Reset defined word tracking
    ER.state.definedWordElement = null;
    ER.state.definedWordIndex = -1;
    ER.state.isManuallyPaused = false;
}

// Resume reading from the defined word
async function resumeFromDefinedWord() {
    if (ER.state.definedWordIndex < 0 || !ER.state.mainWords || !ER.state.mainWordSpans) {

        return;
    }

    // Only cancel speech if it's actually speaking, not if it's just paused
    if (ER.state.speechSynthesis.speaking && !ER.state.speechSynthesis.paused) {
        ER.state.speechSynthesis.cancel();
    } else if (ER.state.speechSynthesis.paused) {
        ER.state.speechSynthesis.cancel();
    }
    
    // Set the current word index to the defined word
    ER.state.mainCurrentWordIndex = ER.state.definedWordIndex;
    ER.state.isMainSpeaking = true;
    ER.state.mainSpeechPaused = false;

    // Speak from the defined word using DOM text (preserves CJK separators)
    const startSpan = ER.state.mainWordSpans[ER.state.definedWordIndex];
    const remainingSpans = ER.state.mainWordSpans.slice(ER.state.definedWordIndex);
    const textToSpeak = ER.getTextFromSpanToEnd(ER.state.outputDiv, startSpan);
    const wordOffsets = ER.computeWordOffsetsFromDom(
        ER.state.outputDiv,
        remainingSpans,
        startSpan
    );

    // Create new utterance for the remaining text
    ER.state.mainSpeechUtterance = new SpeechSynthesisUtterance(textToSpeak);

    // Use document-locale voice (matches OCR output language)
    await ER.applyVoiceForLocale(ER.state.mainSpeechUtterance, ER.state.documentLocale || 'en');

    // Set rate to current selection
    ER.state.mainSpeechUtterance.rate = ER.state.speechRate;

    // Event handlers
    ER.state.mainSpeechUtterance.onboundary = function(event) {
        if (event.name === 'word') {
            const i = ER.findWordIndexAtChar(event.charIndex, wordOffsets);
            if (i >= 0) {
                ER.state.mainCurrentWordIndex = ER.state.definedWordIndex + i;
                highlightCurrentWord(ER.state.mainCurrentWordIndex);
            }
        }
    };

    ER.state.mainSpeechUtterance.onend = function() {
        ER.state.isMainSpeaking = false;
        ER.state.mainSpeechPaused = false;
        ER.updateButtonStates(false);
        ER.state.mainCurrentWordIndex = 0;
        highlightCurrentWord(-1);
        ER.state.isManuallyPaused = false; // Reset manual pause flag
    };

    ER.state.mainSpeechUtterance.onpause = function() {
        ER.state.mainSpeechPaused = true;
        ER.updateButtonStates(false); // Show as paused state
    };

    ER.state.mainSpeechUtterance.onresume = function() {
        ER.state.mainSpeechPaused = false;
        ER.updateButtonStates(true); // Show as playing state
    };

    // Add onstart handler for resumeFromDefinedWord function too
    ER.state.mainSpeechUtterance.onstart = function() {
        ER.state.isMainSpeaking = true;
        ER.updateButtonStates(true);
        
        // Clear ALL existing focus outlines when speech starts
        // Focus will now follow the speaking word automatically
        ER.clearAllKeyboardFocus();
    };

    ER.state.mainSpeechUtterance.onerror = function(event) {
        // Ignore 'interrupted' and 'canceled' errors as they're expected when switching/resuming
        if (event.error !== 'interrupted' && event.error !== 'canceled') {
            console.error('Main SpeechSynthesis error:', event);
            ER.state.isMainSpeaking = false;
            stopReading();
        }
    };

    // Highlight the starting word
    highlightCurrentWord(ER.state.definedWordIndex);

    // Set button states for resuming speech
    ER.updateButtonStates(true);

    // Start speaking from the defined word
    // Small delay to ensure previous speech is completely cancelled
    setTimeout(() => {
        ER.state.speechSynthesis.speak(ER.state.mainSpeechUtterance);
    }, 50);
}

// Start reading from the currently focused word
function startReadingFromFocusedWord() {
    if (ER.state.focusedWordIndex >= 0) {
        // Use the existing resumeFromDefinedWord function but with focused word
        ER.state.definedWordIndex = ER.state.focusedWordIndex;
        resumeFromDefinedWord();
    } else {
        readText();
    }
}

// Resume reading from the currently focused word
function resumeFromFocusedWord() {
    if (ER.state.focusedWordIndex >= 0) {
        // Use the existing resumeFromDefinedWord function but with focused word
        ER.state.definedWordIndex = ER.state.focusedWordIndex;
        resumeFromDefinedWord();
    } else {
        resumeReading();
    }
}
  ER.wrapWordsInSpans = wrapWordsInSpans;
  ER.highlightCurrentWord = highlightCurrentWord;
  ER.highlightModalCurrentWord = highlightModalCurrentWord;
  ER.stopAllSpeech = stopAllSpeech;
  ER.readText = readText;
  ER.handlePlayClick = handlePlayClick;
  ER.handlePauseClick = handlePauseClick;
  ER.pauseReading = pauseReading;
  ER.autoPauseForDefinition = autoPauseForDefinition;
  ER.resumeReading = resumeReading;
  ER.stopReading = stopReading;
  ER.resumeFromDefinedWord = resumeFromDefinedWord;
  ER.startReadingFromFocusedWord = startReadingFromFocusedWord;
  ER.resumeFromFocusedWord = resumeFromFocusedWord;
})(window.ER);
