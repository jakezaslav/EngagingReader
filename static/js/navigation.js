window.ER = window.ER || {};
(function (ER) {
'use strict';
// Handle global keyboard events
function handleGlobalKeydown(event) {
    const activeElement = document.activeElement;
    const modalIsOpen = ER.state.definitionModal.style.display === 'block';

    if (modalIsOpen && event.key === 'Tab') {
        trapDefinitionModalFocus(event);
        return;
    }

    // Handle spacebar for play/pause
    if (event.code === 'Space') {
        const isNativeControl = activeElement && (
            ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(activeElement.tagName) ||
            activeElement.isContentEditable ||
            activeElement.matches('[role="button"]')
        );
        if (isNativeControl) return;

        const focusIsInModal = modalIsOpen && ER.state.definitionModal.contains(activeElement);
        const focusIsInText = !modalIsOpen && activeElement && (
            activeElement.id === 'text-display' ||
            activeElement.classList.contains('highlight-word') ||
            ER.state.outputDiv.contains(activeElement)
        );

        if (focusIsInModal) {
            event.preventDefault();
            handleModalSpacebar();
        } else if (focusIsInText && ER.state.currentText) {
            event.preventDefault();
            handleMainSpacebar();
        }
        return;
    }

    // Handle Escape key to close modal or clear upload error
    if (event.code === 'Escape') {
        if (modalIsOpen) {
            event.preventDefault();
            // Close an open language menu first; a second Escape closes the definition
            const languageDropdown = document.querySelector('#language-selector .language-dropdown.show');
            if (languageDropdown) {
                ER.closeLanguageDropdown();
                return;
            }
            ER.closeDefinitionModal();
            return;
        }
        const uploadError = document.getElementById('upload-error');
        if (uploadError && !uploadError.hidden) {
            event.preventDefault();
            ER.clearUploadError();
            const uploadLabel = document.querySelector('#drop-area label[for="fileInput"]');
            if (uploadLabel) uploadLabel.focus();
        }
        return;
    }

    // Handle word navigation (only when text is loaded and not in modal)
    if (ER.state.currentText && !modalIsOpen) {
        switch (event.code) {
            case 'Tab':
                // Tab into text area - focus first word of first paragraph
                // Only handle if currently focused on text-display div, not if already on a word
                if (activeElement && activeElement.id === 'text-display') {
                    event.preventDefault();
                    focusFirstWordOfFirstParagraph();
                }
                break;
                
            case 'ArrowLeft':
                event.preventDefault();
                navigateToPreviousWord();
                break;
                
            case 'ArrowRight':
                event.preventDefault();
                navigateToNextWord();
                break;
                
            case 'ArrowUp':
                event.preventDefault();
                navigateToPreviousParagraph();
                break;
                
            case 'ArrowDown':
                event.preventDefault();
                navigateToNextParagraph();
                break;
                
            case 'Enter':
                event.preventDefault();
                handleEnterForDefinition();
                break;
        }
    }
}

/*
 * Definition panel sits under the header, so Tab cycles through header
 * controls (home, language) plus the panel — not the obscured page behind.
 */
function getDefinitionFocusableElements() {
    const selector = [
        'button:not([disabled])',
        '[href]',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
    ].join(', ');

    const roots = [
        document.querySelector('header.banner'),
        document.getElementById('language-selector'),
        ER.state.definitionModal
    ].filter(Boolean);

    return roots.flatMap((root) => Array.from(root.querySelectorAll(selector)))
        .filter((element) => element.getClientRects().length > 0);
}

function trapDefinitionModalFocus(event) {
    const focusable = getDefinitionFocusableElements();

    if (focusable.length === 0) {
        event.preventDefault();
        ER.state.definitionModal.focus();
        return;
    }

    // Header and panel aren't contiguous in DOM order (speech controls sit
    // between them), so Tab must be driven explicitly through this list.
    event.preventDefault();
    const activeElement = document.activeElement;
    const index = focusable.indexOf(activeElement);

    if (event.shiftKey) {
        const next = index <= 0 ? focusable.length - 1 : index - 1;
        focusable[next].focus();
    } else {
        const next = index >= focusable.length - 1 ? 0 : index + 1;
        focusable[next].focus();
    }
}

// Handle spacebar for main content speech
function handleMainSpacebar() {
    if (!ER.state.currentText) {
        return;
    }
    
    if (ER.state.mainSpeechUtterance && ER.state.mainSpeechPaused) {
        // Currently paused - resume from focused word if available, otherwise normal resume
        if (ER.state.focusedWordIndex >= 0) {
            ER.resumeFromFocusedWord();
        } else {
            ER.resumeReading();
        }
    } else if (ER.state.isMainSpeaking) {
        // Currently playing - pause
        ER.pauseReading();
    } else {
        // Not playing - start from focused word if available, otherwise from beginning
        if (ER.state.focusedWordIndex >= 0) {
            ER.startReadingFromFocusedWord();
        } else {
            ER.readText();
        }
    }
}

// Handle spacebar for modal speech
function handleModalSpacebar() {
    const definitionText = ER.state.definitionContent.textContent;
    if (!definitionText) {
        return;
    }
    
    if (ER.state.modalSpeechUtterance && ER.state.modalSpeechPaused) {
        // Currently paused - resume
        ER.resumeDefinitionReading();
    } else if (ER.state.isModalSpeaking) {
        // Currently playing - pause
        ER.pauseDefinitionReading();
    } else {
        // Not playing - start
        ER.readDefinitionAloud();
    }
}

// Initialize word navigation system
function initializeWordNavigation() {
    // Reset navigation state
    ER.state.focusedWordIndex = -1;
    ER.state.currentParagraphIndex = -1;
    ER.state.paragraphBoundaries = [];
    
    // Update word spans array
    ER.state.mainWordSpans = Array.from(document.querySelectorAll('.highlight-word'));
    ER.state.mainWords = ER.state.mainWordSpans.map(span => span.textContent);
    
    // Detect paragraph boundaries using HTML structure
    detectParagraphBoundaries();
}

// Detect paragraph boundaries based on HTML structure (p, div, h1-h6)
function detectParagraphBoundaries() {
    const paragraphElements = ER.state.outputDiv.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6');
    
    paragraphElements.forEach((element) => {
        const wordsInElement = element.querySelectorAll('.highlight-word');
        if (wordsInElement.length > 0) {
            // Find the actual indices of these words in the global mainWordSpans array
            const startIndex = ER.state.mainWordSpans.indexOf(wordsInElement[0]);
            const endIndex = ER.state.mainWordSpans.indexOf(wordsInElement[wordsInElement.length - 1]);
            
            // Only add if we found valid indices
            if (startIndex >= 0 && endIndex >= 0) {
                ER.state.paragraphBoundaries.push({
                    element: element,
                    startIndex: startIndex,
                    endIndex: endIndex
                });
            }
        }
    });
}

// Focus management with roving tabindex (called by user navigation)
function setWordFocus(wordIndex) {
    // Remove focus from previously focused word
    if (ER.state.focusedWordIndex >= 0 && ER.state.focusedWordIndex < ER.state.mainWordSpans.length) {
        ER.state.mainWordSpans[ER.state.focusedWordIndex].setAttribute('tabindex', '-1');
        ER.state.mainWordSpans[ER.state.focusedWordIndex].classList.remove('keyboard-focused');
    }
    
    // Set focus to new word
    if (wordIndex >= 0 && wordIndex < ER.state.mainWordSpans.length) {
        ER.state.focusedWordIndex = wordIndex;
        const wordElement = ER.state.mainWordSpans[wordIndex];
        
        wordElement.setAttribute('tabindex', '0');
        wordElement.classList.add('keyboard-focused');
        wordElement.focus();
        
        // Update current paragraph index
        updateCurrentParagraphIndex(wordIndex);
        
        // Remove speaking highlight when user navigates (as requested)
        removeAllSpeakingHighlights();
    }
}

// Focus management called by speech system (doesn't remove speech highlights)
function setWordFocusFromSpeech(wordIndex) {
    // Remove focus from previously focused word
    if (ER.state.focusedWordIndex >= 0 && ER.state.focusedWordIndex < ER.state.mainWordSpans.length) {
        ER.state.mainWordSpans[ER.state.focusedWordIndex].setAttribute('tabindex', '-1');
        ER.state.mainWordSpans[ER.state.focusedWordIndex].classList.remove('keyboard-focused');
    }
    
    // Set focus to new word
    if (wordIndex >= 0 && wordIndex < ER.state.mainWordSpans.length) {
        ER.state.focusedWordIndex = wordIndex;
        const wordElement = ER.state.mainWordSpans[wordIndex];
        
        wordElement.setAttribute('tabindex', '0');
        wordElement.classList.add('keyboard-focused');
        // Don't call wordElement.focus() - this prevents screen reader interruption
        
        // Update current paragraph index
        updateCurrentParagraphIndex(wordIndex);
        
        // Don't remove speaking highlights - let them coexist with focus
    }
}

// Remove speaking highlights when user navigates
function removeAllSpeakingHighlights() {
    ER.state.mainWordSpans.forEach(span => {
        span.classList.remove('current-word');
        span.classList.remove('highlight');
    });
}

// Clear all keyboard focus outlines (used when speech starts)
function clearAllKeyboardFocus() {
    ER.state.mainWordSpans.forEach(span => {
        span.classList.remove('keyboard-focused');
        span.setAttribute('tabindex', '-1');
    });
    ER.state.focusedWordIndex = -1;
}

// Clear all modal keyboard focus outlines (used when modal speech starts)
function clearAllModalKeyboardFocus() {
    ER.state.modalWordSpans.forEach(span => {
        span.classList.remove('modal-keyboard-focused');
        span.setAttribute('tabindex', '-1');
    });
    ER.state.modalFocusedWordIndex = -1;
}

// Update current paragraph index based on word index
function updateCurrentParagraphIndex(wordIndex) {
    for (let i = 0; i < ER.state.paragraphBoundaries.length; i++) {
        const boundary = ER.state.paragraphBoundaries[i];
        if (wordIndex >= boundary.startIndex && wordIndex <= boundary.endIndex) {
            ER.state.currentParagraphIndex = i;
            break;
        }
    }
}

// Navigation functions
function focusFirstWordOfFirstParagraph() {
    if (ER.state.paragraphBoundaries.length > 0 && ER.state.mainWordSpans.length > 0) {
        const firstParagraph = ER.state.paragraphBoundaries[0];
        setWordFocus(firstParagraph.startIndex);
    }
}

function navigateToNextWord() {
    if (ER.state.focusedWordIndex < 0) {
        focusFirstWordOfFirstParagraph();
    } else if (ER.state.focusedWordIndex < ER.state.mainWordSpans.length - 1) {
        setWordFocus(ER.state.focusedWordIndex + 1);
    }
    // Do nothing if at last word (as requested)
}

function navigateToPreviousWord() {
    if (ER.state.focusedWordIndex <= 0) {
        // Do nothing if at first word or no word focused (as requested)
        return;
    } else {
        setWordFocus(ER.state.focusedWordIndex - 1);
    }
}

function navigateToNextParagraph() {
    if (ER.state.currentParagraphIndex < 0) {
        focusFirstWordOfFirstParagraph();
    } else if (ER.state.currentParagraphIndex < ER.state.paragraphBoundaries.length - 1) {
        const nextParagraph = ER.state.paragraphBoundaries[ER.state.currentParagraphIndex + 1];
        setWordFocus(nextParagraph.startIndex);
    }
    // Do nothing if at last paragraph (as requested)
}

function navigateToPreviousParagraph() {
    if (ER.state.currentParagraphIndex <= 0) {
        // Do nothing if at first paragraph or no paragraph focused (as requested)
        return;
    } else {
        const prevParagraph = ER.state.paragraphBoundaries[ER.state.currentParagraphIndex - 1];
        setWordFocus(prevParagraph.startIndex);
    }
}

// Modal focus management called by speech system (doesn't remove speech highlights)
function setModalWordFocusFromSpeech(wordIndex) {
    // Remove focus from previously focused word
    if (ER.state.modalFocusedWordIndex >= 0 && ER.state.modalFocusedWordIndex < ER.state.modalWordSpans.length) {
        ER.state.modalWordSpans[ER.state.modalFocusedWordIndex].setAttribute('tabindex', '-1');
        ER.state.modalWordSpans[ER.state.modalFocusedWordIndex].classList.remove('modal-keyboard-focused');
    }
    
    // Set focus to new word
    if (wordIndex >= 0 && wordIndex < ER.state.modalWordSpans.length) {
        ER.state.modalFocusedWordIndex = wordIndex;
        const wordElement = ER.state.modalWordSpans[wordIndex];
        
        wordElement.setAttribute('tabindex', '0');
        wordElement.classList.add('modal-keyboard-focused');
        // Don't call wordElement.focus() - this prevents screen reader interruption
        
        // Don't remove speaking highlights - let them coexist with focus
    }
}

// Handle Enter key for getting definitions intelligently
function handleEnterForDefinition() {
    let targetWord = null;
    let targetIndex = -1;
    
    // Priority 1: If a word currently has keyboard focus, use that
    if (ER.state.focusedWordIndex >= 0 && ER.state.focusedWordIndex < ER.state.mainWordSpans.length) {
        targetWord = ER.state.mainWordSpans[ER.state.focusedWordIndex];
        targetIndex = ER.state.focusedWordIndex;
    }
    // Priority 2: If speech is currently playing, use the current speaking word
    else if (ER.state.isMainSpeaking && ER.state.mainCurrentWordIndex >= 0 && ER.state.mainCurrentWordIndex < ER.state.mainWordSpans.length) {
        targetWord = ER.state.mainWordSpans[ER.state.mainCurrentWordIndex];
        targetIndex = ER.state.mainCurrentWordIndex;
    }
    // Priority 3: If speech is paused and we have a last current word, use that
    else if (ER.state.mainSpeechPaused && ER.state.mainCurrentWordIndex >= 0 && ER.state.mainCurrentWordIndex < ER.state.mainWordSpans.length) {
        targetWord = ER.state.mainWordSpans[ER.state.mainCurrentWordIndex];
        targetIndex = ER.state.mainCurrentWordIndex;
    }
    // Priority 4: If we have a defined word from previous interaction, use that
    else if (ER.state.definedWordIndex >= 0 && ER.state.definedWordIndex < ER.state.mainWordSpans.length) {
        targetWord = ER.state.mainWordSpans[ER.state.definedWordIndex];
        targetIndex = ER.state.definedWordIndex;
    }
    // Priority 5: If none of the above, use the first word as fallback
    else if (ER.state.mainWordSpans.length > 0) {
        targetWord = ER.state.mainWordSpans[0];
        targetIndex = 0;
    }
    
    // If we found a word to define
    if (targetWord) {
        // Pause audio if playing
        if (ER.state.isMainSpeaking) {
            ER.pauseReading();
        }
        
        // Set focus to this word for proper modal return behavior
        ER.clearAllKeyboardFocus();
        ER.state.focusedWordIndex = targetIndex;
        ER.state.definedWordIndex = targetIndex;
        
        // Get the definition
        ER.handleWordSelection({target: targetWord});
        
        // Announce to screen readers what we're doing
        ER.announceStatus(t('status.gettingDefinition', { word: targetWord.textContent }));
    }
}
  ER.handleGlobalKeydown = handleGlobalKeydown;
  ER.handleMainSpacebar = handleMainSpacebar;
  ER.handleModalSpacebar = handleModalSpacebar;
  ER.initializeWordNavigation = initializeWordNavigation;
  ER.detectParagraphBoundaries = detectParagraphBoundaries;
  ER.setWordFocus = setWordFocus;
  ER.setWordFocusFromSpeech = setWordFocusFromSpeech;
  ER.removeAllSpeakingHighlights = removeAllSpeakingHighlights;
  ER.clearAllKeyboardFocus = clearAllKeyboardFocus;
  ER.clearAllModalKeyboardFocus = clearAllModalKeyboardFocus;
  ER.updateCurrentParagraphIndex = updateCurrentParagraphIndex;
  ER.focusFirstWordOfFirstParagraph = focusFirstWordOfFirstParagraph;
  ER.navigateToNextWord = navigateToNextWord;
  ER.navigateToPreviousWord = navigateToPreviousWord;
  ER.navigateToNextParagraph = navigateToNextParagraph;
  ER.navigateToPreviousParagraph = navigateToPreviousParagraph;
  ER.setModalWordFocusFromSpeech = setModalWordFocusFromSpeech;
  ER.handleEnterForDefinition = handleEnterForDefinition;
})(window.ER);
