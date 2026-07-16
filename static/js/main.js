window.ER = window.ER || {};
(function (ER) {
'use strict';

document.addEventListener('click', function(event) {
    if (!event.target.closest('.speed-display')) {
        document.querySelectorAll('.speed-dropdown.show').forEach(dropdown => {
            dropdown.classList.remove('show');
            dropdown.parentElement.classList.remove('active');
        });
    }
    if (!event.target.closest('.language-selector')) {
        ER.closeLanguageDropdown();
    }
});

document.addEventListener('DOMContentLoaded', function() {
    ER.loadVoices();

    setTimeout(async () => {
        try {
            ER.state.preloadedVoice = await ER.getEnglishVoice();
        } catch (error) {
            console.error('❌ Error preloading voice:', error);
        }
    }, 100);

    document.getElementById('speech-controls').style.display = 'none';

    document.addEventListener('keydown', ER.handleGlobalKeydown);

    document.querySelector('.close-btn').addEventListener('click', ER.closeDefinitionModal);
    window.addEventListener('click', function(event) {
        if (event.target === ER.state.definitionModal) {
            ER.closeDefinitionModal();
        }
    });

    ER.state.outputDiv.addEventListener('click', ER.handleWordSelection);

    ER.state.modalPlayBtn.addEventListener('click', ER.handleModalPlayClick);
    ER.state.modalPauseBtn.addEventListener('click', ER.handleModalPauseClick);

    ER.state.playBtn.addEventListener('click', ER.handlePlayClick);
    ER.state.pauseBtn.addEventListener('click', ER.handlePauseClick);
    ER.state.newFileBtn.addEventListener('click', () => window.location.reload());
    ER.state.modalNewFileBtn.addEventListener('click', () => window.location.reload());

    ER.setupSpeedControl('speedDisplay', 'main');
    ER.setupSpeedControl('modalSpeedDisplay', 'modal');
    ER.setupLanguageSelector();

    const dropArea = ER.state.dropArea;
    const fileInput = ER.state.fileInput;

    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.style.backgroundColor = '#D8E1D9';
    });

    dropArea.addEventListener('dragleave', () => {
        dropArea.style.backgroundColor = 'transparent';
    });

    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.style.backgroundColor = 'transparent';
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            ER.uploadImage();
        }
    });

    dropArea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
        }
    });

    dropArea.addEventListener('click', (e) => {
        if (e.target === dropArea || e.target.closest('#drop-area') === dropArea) {
            if (!e.target.classList.contains('labBtn')) {
                fileInput.click();
            }
        }
    });

    fileInput.addEventListener('change', ER.uploadImage);
});
})(window.ER);
