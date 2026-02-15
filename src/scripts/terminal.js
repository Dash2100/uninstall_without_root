// Terminal IPC forwarder
// Forwards appendToTerminal/clearTerminal calls to the popup terminal window via IPC.
// Function signatures are preserved so existing callers (adb.js, func.js) don't break.
// ipcRenderer is already available from integration.js (loaded before this script).

// Open or close the terminal popup window
function toggleTerminal(show) {
    if (show) {
        window.openTerminalWindow();
    } else {
        window.closeTerminalWindow();
    }
}

// Clear terminal content in the popup window
function clearTerminal() {
    require('electron').ipcRenderer.send('terminal-clear');
}

// Append a line to the popup terminal window
function appendToTerminal(text, type = 'response') {
    require('electron').ipcRenderer.send('terminal-append', text, type);
}
