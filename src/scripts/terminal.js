// Cache terminal and UI elements
const elements = {
    terminal: document.getElementById('debug-terminal-area'),
    output: document.getElementById('debug-terminal-output'),
    navBar: document.getElementById('main-nav-bar'),
    submitBtn: document.getElementById('debug-terminal-submit'),
    input: document.getElementById('debug-terminal-input'),
    pills: document.querySelectorAll('.floating-pill'),
    pages: document.querySelectorAll('.page')
};

// Initialize terminal
function initTerminal() {
    clearTerminal();
}
// Keep output scrolled to bottom
function scrollToBottom() {
    elements.output.scrollTop = elements.output.scrollHeight;
}

// Show or hide terminal pane
function toggleTerminal(show = elements.terminal.style.display === 'none') {
    elements.terminal.style.display = show ? 'flex' : 'none';
    elements.navBar.style.right = show ? '40%' : '0';
    elements.navBar.style.width = show ? '60%' : '100%';
    const pillRight = show ? '369px' : '36px';
    elements.pills.forEach(pill => pill.style.right = pillRight);
    elements.pages.forEach(page => page.style.width = show ? '60%' : '100%');
    document.body.offsetHeight; // force repaint
}

// Clear terminal content
function clearTerminal() {
    elements.output.textContent = '';
}

// Append a line to the terminal
function appendToTerminal(text, type = 'response') {
    if (!elements.output) return;
    const line = document.createElement('div');
    line.textContent = text;
    const classMap = {
        command: ['text-green-500', 'font-bold'],
        error: ['text-red-500'],
        system: ['text-blue-300', 'italic'],
        response: ['text-gray-300']
    };
    line.classList.add(...(classMap[type] || classMap.response));
    elements.output.appendChild(line);
    scrollToBottom();
}

// Execute a command from the terminal input
function executeTerminalCommand(cmd) {
    if (!cmd) return;
    elements.input.value = '';
    appendToTerminal(`> ${cmd}`, 'command');
    let command = cmd.startsWith('adb ') ? cmd.slice(4) : cmd;
    if (['clear', 'cls'].includes(command)) {
        clearTerminal();
        return;
    }
    if (command === 'shell') {
        appendToTerminal('ADB shell not supported', 'error');
        return;
    }
    window.executeAdbCommand(command)
        .then(res => appendToTerminal(res || '(No output)', 'response'))
        .catch(err => {
            const code = err.toString().split('\n')[1]?.trim() || err.toString();
            appendToTerminal(code, 'error');
        });
}

// Event listeners
elements.submitBtn.addEventListener('click', () => {
    executeTerminalCommand(elements.input.value.trim())
});

elements.input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        executeTerminalCommand(elements.input.value.trim());
    }
});

document.addEventListener('DOMContentLoaded', initTerminal);