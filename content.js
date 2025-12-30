// Content script to accept instructions and manipulate the page

// Helper to visualize the "virtual" mouse
let virtualMouse = null;

function getOrCreateMouse() {
    if (!virtualMouse) {
        virtualMouse = document.createElement('div');
        virtualMouse.style.position = 'fixed';
        virtualMouse.style.width = '20px';
        virtualMouse.style.height = '20px';
        virtualMouse.style.borderRadius = '50%'; // Circle
        virtualMouse.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
        virtualMouse.style.border = '2px solid white';
        virtualMouse.style.zIndex = '999999';
        virtualMouse.style.pointerEvents = 'none'; // Don't block clicks
        virtualMouse.style.transition = 'all 0.3s ease-out';
        virtualMouse.style.transform = 'translate(-50%, -50%)'; // Center pivot
        virtualMouse.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
        document.body.appendChild(virtualMouse);
    }
    return virtualMouse;
}

let isExecutionCancelled = false;

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.type === 'EXECUTE_ACTIONS') {
        isExecutionCancelled = false;
        console.log('Received actions:', request.actions);
        await executeActionSequence(request.actions);
        sendResponse({ status: 'done' });
    } else if (request.type === 'CANCEL_ACTIONS') {
        isExecutionCancelled = true;
        cleanupUI();
        console.log('Execution cancelled');
    }
});

function cleanupUI() {
    if (virtualMouse) {
        virtualMouse.remove();
        virtualMouse = null;
    }
}

async function executeActionSequence(actions) {
    for (const action of actions) {
        if (isExecutionCancelled) return;

        await performAction(action);

        if (isExecutionCancelled) return;

        // Small delay between actions for visibility
        await new Promise(r => setTimeout(r, 500));
    }
}

async function performAction(command) {
    console.log('Executing:', command);

    // Normalize format: Support both {type: '...', ...} and {action: '...', parameters: {...}}
    const actionType = command.type || command.action;
    const params = command.parameters || command; // If flattened, use command itself

    switch (actionType) {
        case 'mouse_move':
            const mouse = getOrCreateMouse();
            let x = params.x;
            let y = params.y;

            // Handle box_number if present
            if (params.box_number !== undefined) {
                // Heuristic mapping for box_number
                x = window.innerWidth / 2;
                y = window.innerHeight / 2;
                mouse.title = `Box ${params.box_number}`;
            }

            if (x !== undefined && y !== undefined) {
                mouse.style.left = x + 'px';
                mouse.style.top = y + 'px';
            }
            break;

        case 'left_click':
            const m = getOrCreateMouse();
            // Visual click
            m.style.transform = 'translate(-50%, -50%) scale(0.8)';
            m.style.backgroundColor = 'rgba(0, 255, 0, 0.8)';

            // Try click
            const cx = parseInt(m.style.left || 0);
            const cy = parseInt(m.style.top || 0);
            const el = document.elementFromPoint(cx, cy);
            if (el) {
                el.click();
                el.focus();
            }

            await new Promise(r => setTimeout(r, 200));
            m.style.transform = 'translate(-50%, -50%) scale(1)';
            m.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
            break;

        case 'right_click':
            const rc = getOrCreateMouse();
            rc.style.backgroundColor = 'blue';
            await new Promise(r => setTimeout(r, 200));
            rc.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
            break;

        case 'send_key':
            const activeElement = document.activeElement;
            const key = params.key_name || params.keys;

            if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
                if (key === 'Enter') {
                    activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                    activeElement.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', bubbles: true }));
                    activeElement.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
                } else if (key === 'Backspace') {
                    activeElement.value = activeElement.value.slice(0, -1);
                } else {
                    activeElement.value += key;
                }
                activeElement.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                showToast(`Type: "${key}"`);
            }
            break;

        case 'scroll_up':
            window.scrollBy({ top: -((params.lines || 10) * 20), behavior: 'smooth' });
            break;

        case 'scroll_down':
            window.scrollBy({ top: ((params.lines || 10) * 20), behavior: 'smooth' });
            break;

        case 'navigate_to_link':
            if (params.url) window.location.href = params.url;
            break;

        case 'switch_tab':
        case 'close_tab':
        case 'new_tab':
            console.log('Tab action (not supported in content script):', actionType);
            showToast(`Action: ${actionType}`);
            break;

        case 'wait':
            await new Promise(r => setTimeout(r, params.ms || 1000));
            break;

        case 'notification':
            showToast(params.text);
            break;

        default:
            console.warn('Unknown action:', actionType);
    }
}

function showToast(text) {
    const toast = document.createElement('div');
    toast.textContent = text;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.backgroundColor = '#333';
    toast.style.color = '#fff';
    toast.style.padding = '10px 20px';
    toast.style.borderRadius = '5px';
    toast.style.zIndex = '1000000';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.5s';

    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => toast.style.opacity = '1');

    // Remove after 3s
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}
