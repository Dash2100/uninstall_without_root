const terminal = document.getElementById('debug-terminal-area');
const navBar = document.getElementById('main-nav-bar');
const debugTerminalSubmit = document.getElementById('debug-terminal-submit');
const terminalInput = document.getElementById('debug-terminal-input');

let terminalOutput;

// 初始化终端输出区域
function initTerminal() {
    terminalOutput = document.getElementById('debug-terminal-output');
}

function toggleTerminal(show) {
    const pages = document.querySelectorAll('.page');

    if (show === undefined) {
        show = terminal.style.display === 'none';
    }

    if (show) {
        terminal.style.display = 'flex';
        navBar.style.right = '40%';
        navBar.style.width = '60%';
        floatingPill.style.right = '369px';
        pages.forEach(page => {
            page.style.width = '60%';
        });
    } else {
        terminal.style.display = 'none';
        navBar.style.right = '0';
        navBar.style.width = '100%';
        floatingPill.style.right = '36px';
        pages.forEach(page => {
            page.style.width = '100%';
        });
    }

    // 強制重繪
    document.body.offsetHeight;
}

// 清除終端
function clearTerminal() {
    document.getElementById('debug-terminal-output').textContent = '';
}

// Terminal output
function appendToTerminal(text, type = 'response') {
    if (!terminalOutput) return;

    const newOutput = document.createElement('div');
    newOutput.textContent = text;

    switch (type) {
        case 'command':
            newOutput.classList.add('text-green-500', 'font-bold');
            break;
        case 'error':
            newOutput.classList.add('text-red-500');
            break;
        case 'system':
            newOutput.classList.add('text-blue-300', 'italic');
            break;
        default:
            newOutput.classList.add('text-gray-300');
    }

    terminalOutput.appendChild(newOutput);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

// 執行終端命令
function executeTerminalCommand(command) {
    if (!command) return;
    terminalInput.value = '';

    appendToTerminal(`> ${command}`, 'command');

    // execute ADB command
    window.executeAdbCommand(command)
        .then(response => {
            appendToTerminal(response || '(無輸出)');
        })
        .catch(error => {
            appendToTerminal(`錯誤: ${error}`, 'error');
        });
}


debugTerminalSubmit.addEventListener('click', () => {
    const command = terminalInput.value.trim();
    executeTerminalCommand(command);
});

// 在页面加载后初始化终端
document.addEventListener('DOMContentLoaded', () => {
    initTerminal();
});