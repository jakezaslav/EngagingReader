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
  ER.loadVoices = loadVoices;
  ER.getEnglishVoice = getEnglishVoice;
})(window.ER);
