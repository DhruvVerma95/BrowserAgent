// Background script to handle coordination

let isCancelled = false;
let currentTabId = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'PROCESS_COMMAND') {
        isCancelled = false;
        currentTabId = request.tabId;
        handleCommand(request, sendResponse);
        return true; // Will respond asynchronously
    } else if (request.type === 'CANCEL_COMMAND') {
        isCancelled = true;
        // Notify content script to stop
        if (currentTabId) {
            chrome.tabs.sendMessage(currentTabId, { type: 'CANCEL_ACTIONS' })
                .catch(() => { }); // Ignore error if tab closed/unreachable
        }
        sendResponse({ status: 'cancelled' });
    }
});

async function handleCommand(request, sendResponse) {
    try {
        const { tabId, prompt } = request;

        if (checkCancelled(sendResponse)) return;

        // 1. Capture Screenshot
        notifyPopup('Capturing screenshot...');
        const screenshotDataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

        // API expects raw base64 without prefix
        const base64Image = screenshotDataUrl.replace(/^data:image\/(png|jpeg);base64,/, "");

        console.log('Screenshot captured (length):', base64Image.length);

        if (checkCancelled(sendResponse)) return;

        // 2. call Backend API
        notifyPopup('Sending to backend (192.168...)...');

        let data;
        try {
            const response = await fetch('http://192.168.192.51:8000/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    instructions: prompt,
                    screen_image: base64Image
                })
            });

            if (!response.ok) {
                // Try to read error body
                const text = await response.text();
                throw new Error(`API Error: ${response.status} - ${text.substring(0, 50)}`);
            }

            data = await response.json();

        } catch (networkError) {
            console.error('Network error:', networkError);
            throw new Error('Failed to connect to backend: ' + networkError.message);
        }

        if (checkCancelled(sendResponse)) return;

        // 3. Process Response
        notifyPopup('Received instructions. Executing...');
        const commands = data.commands || [];
        console.log('Instructions received:', commands);

        if (commands.length === 0) {
            notifyPopup('Backend returned no commands.', 'success');
        }

        // 4. Send instructions to content script
        await chrome.tabs.sendMessage(tabId, {
            type: 'EXECUTE_ACTIONS',
            actions: commands
        });

        if (!isCancelled) {
            sendResponse({ status: 'success', message: 'Workflow completed successfully' });
        }

    } catch (error) {
        console.error('Background error:', error);
        notifyPopup(`Error: ${error.message}`, 'error');
        try {
            sendResponse({ status: 'error', message: error.message });
        } catch (e) { }
    }
}

function checkCancelled(sendResponse) {
    if (isCancelled) {
        notifyPopup('Process cancelled.', 'error');
        sendResponse({ status: 'cancelled' });
        return true;
    }
    return false;
}

function notifyPopup(message, statusType = 'info') {
    if (isCancelled) return;

    chrome.runtime.sendMessage({
        type: 'STATUS_UPDATE',
        text: message,
        statusType
    }).catch(() => {
        // Popup might be closed, ignore
    });
}
