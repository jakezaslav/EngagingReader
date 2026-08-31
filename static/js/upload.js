window.ER = window.ER || {};
(function (ER) {
'use strict';

let stillLoadingAnnounced = false;
let loadingPreviousFocus = null;

function getLoadingBackdropRoots() {
    return [
        document.querySelector('header.banner'),
        document.getElementById('language-selector'),
        document.querySelector('main'),
        document.getElementById('speech-controls'),
        document.getElementById('definitionModal')
    ].filter(Boolean);
}

function resetLoadingCopy() {
    const statusEl = document.getElementById('loading-status');
    const reassuranceEl = document.getElementById('loading-reassurance');
    if (statusEl) {
        statusEl.textContent = t('status.loading');
        statusEl.setAttribute('data-i18n', 'status.loading');
    }
    if (reassuranceEl) {
        reassuranceEl.hidden = true;
        reassuranceEl.textContent = t('status.canTakeAMinute');
    }
    stillLoadingAnnounced = false;
}

function showStillLoading() {
    if (stillLoadingAnnounced) return;
    stillLoadingAnnounced = true;

    const statusEl = document.getElementById('loading-status');
    const reassuranceEl = document.getElementById('loading-reassurance');
    if (statusEl) {
        statusEl.textContent = t('status.stillLoading');
        statusEl.setAttribute('data-i18n', 'status.stillLoading');
    }
    if (reassuranceEl) {
        reassuranceEl.textContent = t('status.canTakeAMinute');
        reassuranceEl.hidden = false;
    }
    ER.announceStatus(t('status.stillLoading') + '. ' + t('status.canTakeAMinute'));
}

function setLoadingState(isLoading) {
    ER.state.loadingOverlay.style.display = isLoading ? 'flex' : 'none';
    ER.state.loadingOverlay.setAttribute('aria-hidden', isLoading ? 'false' : 'true');

    const main = document.querySelector('main');
    if (main) {
        if (isLoading) main.setAttribute('aria-busy', 'true');
        else main.removeAttribute('aria-busy');
    }

    if (isLoading) {
        loadingPreviousFocus = document.activeElement;
        document.body.classList.add('is-loading');
        getLoadingBackdropRoots().forEach((el) => {
            el.setAttribute('aria-hidden', 'true');
            el.inert = true;
        });
        resetLoadingCopy();
        requestAnimationFrame(() => {
            document.getElementById('loadingBackBtn')?.focus();
        });
    } else {
        document.body.classList.remove('is-loading');
        getLoadingBackdropRoots().forEach((el) => {
            el.removeAttribute('aria-hidden');
            el.inert = false;
        });
        resetLoadingCopy();
        const restore = loadingPreviousFocus;
        loadingPreviousFocus = null;

        /*
         * The element focused before loading is often hidden by the time we
         * finish (the upload form is replaced by the text), so fall back to the
         * extracted text rather than letting focus drop to <body> — keyboard
         * reading and word navigation both require focus inside the text.
         */
        const target = [
            restore,
            ER.state.outputDiv && ER.state.outputDiv.textContent.trim() ? ER.state.outputDiv : null,
            document.querySelector('#drop-area label[for="fileInput"]')
        ].find((el) => el && document.contains(el) && el.getClientRects().length > 0);

        if (target && typeof target.focus === 'function') {
            try {
                target.focus();
            } catch (e) { /* ignore */ }
        }
    }
}

function isNetworkError(error) {
    if (!error) return false;
    if (error.name === 'TypeError') return true;
    const message = String(error.message || '').toLowerCase();
    return message.includes('failed to fetch') ||
        message.includes('networkerror') ||
        message.includes('network request failed') ||
        message.includes('load failed');
}

async function uploadImage() {
    // Hide speech controls when starting new upload
    document.getElementById('speech-controls').style.display = 'none';
    ER.clearUploadError();

    if (!ER.state.fileInput.files.length) {
        ER.showUploadError('noFile');
        return;
    }

    const file = ER.state.fileInput.files[0];

    // Validate file type - support images and PDFs
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'application/pdf'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.pdf'];

    // Check both MIME type and file extension (HEIC files might not have proper MIME type on all browsers)
    const fileName = file.name.toLowerCase();
    const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));

    if (!allowedTypes.includes(file.type) && !hasValidExtension) {
        ER.showUploadError('invalidType');
        return;
    }

    // Check file size (50MB limit - generous for high-quality documents)
    const maxSize = 50 * 1024 * 1024; // 50MB in bytes
    if (file.size > maxSize) {
        ER.showUploadError('fileTooLarge');
        return;
    }

    if (file.size === 0) {
        ER.showUploadError('fileEmpty');
        return;
    }

    // Show loading state
    setLoadingState(true);
    ER.state.outputDiv.innerHTML = "";
    ER.announceStatus(t('status.processing'));

    try {
        const formData = new FormData();
        formData.append("file", file);
        const locale = typeof window.getLocale === 'function' ? window.getLocale() : 'en';
        const languageName = typeof window.localeToLanguageName === 'function'
            ? window.localeToLanguageName(locale)
            : 'English';
        formData.append("USER_LANGUAGE", languageName);
        const translateToggle = document.getElementById("translateFileToggle");
        const translateFile = translateToggle ? translateToggle.checked : false;
        formData.append("TRANSLATE_FILE", translateFile ? "true" : "false");

        const response = await fetch("/upload", {
            method: "POST",
            body: formData
        });

        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            console.error("Upload response parse error:", parseError);
            setLoadingState(false);
            ER.showUploadError('processFailed');
            document.getElementById('speech-controls').style.display = 'none';
            return;
        }

        if (!response.ok) {
            console.error("Upload failed:", data && data.error);
            setLoadingState(false);
            ER.showUploadError('processFailed');
            document.getElementById('speech-controls').style.display = 'none';
            return;
        }

        // Get job ID and poll for results
        if (!data.job_id) {
            console.error("Server did not return a job ID.");
            setLoadingState(false);
            ER.showUploadError('processFailed');
            document.getElementById('speech-controls').style.display = 'none';
            return;
        }

        const jobId = data.job_id;
        let pollAttempts = 0;
        const maxPollAttempts = 300; // 5 minutes max (300 * 1 second)
        const pollInterval = 1000; // Poll every 1 second
        const stillLoadingAfter = 20;

        const pollForResults = async () => {
            try {
                const statusResponse = await fetch(`/status/${jobId}`);
                let statusData;
                try {
                    statusData = await statusResponse.json();
                } catch (parseError) {
                    console.error("Status response parse error:", parseError);
                    setLoadingState(false);
                    ER.showUploadError('processFailed');
                    document.getElementById('speech-controls').style.display = 'none';
                    return;
                }

                if (!statusResponse.ok) {
                    console.error("Status check failed:", statusData && statusData.error);
                    setLoadingState(false);
                    ER.showUploadError('processFailed');
                    document.getElementById('speech-controls').style.display = 'none';
                    return;
                }

                if (statusData.status === "completed") {
                    const markdown = (statusData.result && statusData.result.markdown) || "";
                    if (!markdown.trim()) {
                        console.error("OCR completed with empty markdown");
                        setLoadingState(false);
                        ER.showUploadError('noText');
                        document.getElementById('speech-controls').style.display = 'none';
                        return;
                    }

                    // Processing complete, render the markdown
                    const dirtyHtml = marked.parse(markdown);
                    const cleanHtml = DOMPurify.sanitize(dirtyHtml);

                    ER.state.outputDiv.innerHTML = cleanHtml;

                    // Voice follows OCR output language: translated files are in the UI
                    // locale, otherwise the original language is unknown and detected
                    // from the extracted text.
                    // Set locale before wrapping so CJK uses Intl.Segmenter correctly
                    ER.state.documentLocale = translateFile
                        ? locale
                        : ER.detectTextLocale(ER.state.outputDiv.textContent, 'en');
                    ER.state.outputDiv.setAttribute(
                        'lang',
                        ER.resolveContentLang(ER.state.documentLocale)
                    );
                    ER.state.outputDiv.setAttribute(
                        'dir',
                        window.isRtlLocale && window.isRtlLocale(ER.state.documentLocale)
                            ? 'rtl'
                            : 'ltr'
                    );

                    ER.wrapWordsInSpans(ER.state.outputDiv);
                    ER.initializeWordNavigation();

                    // Enable play button and store the current text
                    ER.state.currentText = cleanHtml;

                    ER.state.preloadedVoice = null;
                    ER.state.preloadedLang = null;
                    ER.state.preloadedLocale = null;
                    if (typeof ER.preloadDocumentVoice === 'function') {
                        ER.preloadDocumentVoice(ER.state.documentLocale).catch(function (err) {
                            console.error('Error preloading document voice:', err);
                        });
                    }

                    // Set initial button states (not playing)
                    ER.updateButtonStates(false);

                    // Show speech controls after successful processing
                    document.getElementById('speech-controls').style.display = 'flex';

                    // Hide upload container and show content
                    document.getElementById('upload-container').style.display = 'none';

                    setLoadingState(false);
                    ER.announceStatus(t('status.extracted'));
                } else if (statusData.status === "failed") {
                    console.error("Processing failed:", statusData.error);
                    setLoadingState(false);
                    ER.showUploadError('processFailed');
                    document.getElementById('speech-controls').style.display = 'none';
                } else if (statusData.status === "processing") {
                    // Still processing, poll again
                    pollAttempts++;
                    if (pollAttempts === stillLoadingAfter) {
                        showStillLoading();
                    }
                    if (pollAttempts >= maxPollAttempts) {
                        console.error("Processing timed out after", maxPollAttempts, "seconds");
                        setLoadingState(false);
                        ER.showUploadError('timeout');
                        document.getElementById('speech-controls').style.display = 'none';
                        return;
                    }
                    setTimeout(pollForResults, pollInterval);
                } else {
                    // Unexpected status - log and treat as error
                    console.error("Unexpected job status:", statusData.status);
                    setLoadingState(false);
                    ER.showUploadError('processFailed');
                    document.getElementById('speech-controls').style.display = 'none';
                }
            } catch (error) {
                console.error("Error polling for results:", error);
                setLoadingState(false);
                ER.showUploadError(isNetworkError(error) ? 'network' : 'processFailed');
                document.getElementById('speech-controls').style.display = 'none';
            }
        };

        // Start polling
        pollForResults();

    } catch (error) {
        console.error("Upload error:", error);
        setLoadingState(false);
        ER.showUploadError(isNetworkError(error) ? 'network' : 'processFailed');
        document.getElementById('speech-controls').style.display = 'none';
    }
}
  ER.uploadImage = uploadImage;
})(window.ER);
