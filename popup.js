document.addEventListener('DOMContentLoaded', () => {
    const runBtn = document.getElementById('runBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const userPrompt = document.getElementById('userPrompt');
    const statusBadge = document.getElementById('statusBadge');
    const btnText = runBtn.querySelector('.btn-text');
    const loader = runBtn.querySelector('.loader');
    const logArea = document.getElementById('logArea');

    function log(message, type = 'info') {
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;

        // Clear placeholder if it exists
        if (logArea.querySelector('.placeholder-text')) {
            logArea.innerHTML = '';
        }

        const time = new Date().toLocaleTimeString();
        entry.textContent = `[${time}] ${message}`;
        logArea.appendChild(entry);
        logArea.scrollTop = logArea.scrollHeight;
    }

    function setLoading(isLoading) {
        if (isLoading) {
            runBtn.disabled = true;
            runBtn.classList.add('hidden');
            cancelBtn.classList.remove('hidden');

            btnText.textContent = 'Processing...';
            statusBadge.textContent = 'Running';
            statusBadge.classList.add('active');
        } else {
            runBtn.disabled = false;
            runBtn.classList.remove('hidden');
            cancelBtn.classList.add('hidden');

            btnText.textContent = 'Execute Command';
            loader.classList.add('hidden');
            statusBadge.textContent = 'Ready';
            statusBadge.classList.remove('active');
        }
    }

    function showLoader() {
        loader.classList.remove('hidden');
    }

    runBtn.addEventListener('click', async () => {
        const promptText = userPrompt.value.trim();

        if (!promptText) {
            log('Please enter a command first.', 'error');
            return;
        }

        // Safety Check: internal pages
        const [modeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (modeTab && (modeTab.url.startsWith('chrome://') || modeTab.url.startsWith('edge://') || !modeTab.url.startsWith('http'))) {
            log('Error: Cannot run on this page.', 'error');
            log('Please open a real website (e.g. google.com)', 'error');
            return;
        }

        showLoader();
        setLoading(true);
        log('Initializing sequence...', 'info');

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab) {
                throw new Error('No active tab found');
            }

            log(`Targeting tab: ${tab.title.substring(0, 20)}...`, 'info');

            // Send message to background script
            chrome.runtime.sendMessage({
                type: 'PROCESS_COMMAND',
                prompt: promptText,
                tabId: tab.id
            }, (response) => {
                if (chrome.runtime.lastError) {
                    log(`Error: ${chrome.runtime.lastError.message}`, 'error');
                    setLoading(false);
                    return;
                }

                if (response && response.status === 'success') {
                    // Success logic
                } else if (response && response.status === 'cancelled') {
                    log('Operation cancelled.', 'error');
                } else {
                    // log('Unknown response', 'error');
                }

                setLoading(false);
            });

        } catch (error) {
            log(`Error: ${error.message}`, 'error');
            setLoading(false);
        }
    });

    cancelBtn.addEventListener('click', () => {
        log('Cancelling...', 'info');
        chrome.runtime.sendMessage({ type: 'CANCEL_COMMAND' });
        setTimeout(() => setLoading(false), 200);
    });

    // Listen for status updates from background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'STATUS_UPDATE') {
            log(message.text, message.statusType);
        }
    });
});
