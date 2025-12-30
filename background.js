// Background script for WebSocket communication

let ws = null;
let isConnected = false;
let currentTask = null; // { tabId, instructions }

const BACKEND_URL = 'ws://192.168.192.51:8000/ws/connect';

function connectWebSocket() {
    if (ws) {
        ws.close();
    }

    console.log('Connecting to WebSocket...');
    ws = new WebSocket(BACKEND_URL);

    ws.onopen = () => {
        console.log('Connected to Backend');
        isConnected = true;
        notifyPopup('Connected to Backend Agent', 'success');
    };

    ws.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('Received Message:', data);

            if (data.commands) {
                // Received commands to execute
                if (currentTask && currentTask.tabId) {
                    await chrome.tabs.sendMessage(currentTask.tabId, {
                        type: 'EXECUTE_ACTIONS',
                        actions: data.commands
                    });

                    // For now, let's just complete the request.
                    notifyPopup('Actions Executed', 'success');

                    // Note: If we want to simulate "Finished", we might want to tell popup to stop spinning?
                    // The popup currently stops spinning when it gets the Process response.
                    // But if we want it to spin UNTIL actions are done, we would need to change popup logic.
                    // For now, relying on the user's provided flow.
                }
            } else if (data.error) {
                notifyPopup(`Error: ${data.error}`, 'error');
            }
        } catch (e) {
            console.error('Error parsing WS message:', e);
        }
    };

    ws.onclose = () => {
        console.log('Disconnected');
        isConnected = false;
        notifyPopup('Disconnected from Backend', 'error');
        // Auto-reconnect after delay
        setTimeout(connectWebSocket, 5000);
    };

    ws.onerror = (err) => {
        console.error('WS Error:', err);
    };
}

// Start connection on load
connectWebSocket();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'PROCESS_COMMAND') {
        if (!isConnected) {
            sendResponse({ status: 'error', message: 'Not connected to backend' });
            return;
        }

        handleCommand(request);
        sendResponse({ status: 'success' }); // Ack immediately as per request
        return true;
    } else if (request.type === 'CANCEL_COMMAND') {
        // Handle cancellation
        if (currentTask && currentTask.tabId) {
            chrome.tabs.sendMessage(currentTask.tabId, { type: 'CANCEL_ACTIONS' })
                .catch(() => { });
        }
        currentTask = null;
        sendResponse({ status: 'cancelled' });
    }
});

async function handleCommand(request) {
    const { tabId, prompt } = request;
    currentTask = { tabId, instructions: prompt };

    notifyPopup('Capturing screenshot...');

    try {
        // 1. Capture
        const screenshotDataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        const base64Image = screenshotDataUrl.replace(/^data:image\/(png|jpeg);base64,/, "");

        // 2. Send to Backend via WS
        if (ws && ws.readyState === WebSocket.OPEN) {
            notifyPopup('Sending to AI...');
            ws.send(JSON.stringify({
                instructions: prompt,
                screen_image: base64Image
            }));
        } else {
            notifyPopup('WebSocket not ready', 'error');
        }
    } catch (e) {
        console.error('Screenshot failed:', e);
        notifyPopup('Screenshot failed: ' + e.message, 'error');
    }
}

function notifyPopup(message, statusType = 'info') {
    chrome.runtime.sendMessage({
        type: 'STATUS_UPDATE',
        text: message,
        statusType
    }).catch(() => { });
}
