// Show a brief message in the snackbar using template
// options: { actionText, onAction } for optional action button
function showSnackAlert(msg, options = {}) {
    // return;
    console.log('[snackbar]:', msg);

    const template = document.querySelector('#snackbar-alert-template');
    if (!template) {
        console.error('Snackbar template not found');
        return;
    }

    const snackbar = template.content.cloneNode(true).querySelector('.snackbar-alert');
    snackbar.innerText = msg;

    if (options.actionText && options.onAction) {
        snackbar.setAttribute('action', options.actionText);
        snackbar.addEventListener('action-click', options.onAction);
    }

    document.body.appendChild(snackbar);

    // Show snackbar after DOM insertion
    setTimeout(() => snackbar.open = true, 1);

    // Auto-remove snackbar after it closes
    snackbar.addEventListener('close', () => {
        setTimeout(() => {
            if (snackbar.parentNode) {
                snackbar.parentNode.removeChild(snackbar);
            }
        }, 100);
    });

    // Auto-close after 5 seconds if action button present, 3 seconds otherwise
    const delay = options.actionText ? 5000 : 3000;
    setTimeout(() => {
        if (snackbar.open) {
            snackbar.open = false;
        }
    }, delay);
}

// Create and display a confirmation dialog
function createQuestionDialog({
    title = '確認',
    description = '您確定要執行此操作嗎？',
    acceptText = '確認',
    denyText = '取消',
    onAccept = () => { },
    onDeny = () => { }
} = {}) {
    const template = document.querySelector('#question-dialog-template');
    const dialog = template.content.cloneNode(true).querySelector('.dialog-question');

    dialog.querySelector('[slot="headline"]').textContent = title;
    dialog.querySelector('[slot="description"]').textContent = description;

    const acceptBtn = dialog.querySelector('#question-dialog-accept-button');
    const denyBtn = dialog.querySelector('#question-dialog-deny-button');
    acceptBtn.textContent = acceptText;
    denyBtn.textContent = denyText;

    acceptBtn.addEventListener('click', () => {
        onAccept();
        dialog.open = false;
    });
    denyBtn.addEventListener('click', () => {
        onDeny();
        dialog.open = false;
    });

    document.body.appendChild(dialog);
    setTimeout(() => dialog.open = true, 1);
    return dialog;
}

// Alias for createQuestionDialog
const showQuestionDialog = createQuestionDialog;
