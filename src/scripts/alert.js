const snackbarAlert = document.querySelector("#snackbar-alert");
const dialogUniversal = document.querySelector("#dialog-universal");

const showSnackAlert = (msg) => {
    console.log('[snackbar]:', msg);

    snackbarAlert.innerText = msg;
    snackbarAlert.open = true;
}

const createQuestionDialog = (options) => {
    const {
        title = '確認',
        description = '您確定要執行此操作嗎？',
        acceptText = '確認',
        denyText = '取消',
        onAccept = () => { },
        onDeny = () => { }
    } = options;

    const template = document.querySelector('#question-dialog-template');
    const dialogElement = template.content.cloneNode(true);

    const dialog = dialogElement.querySelector('.dialog-question');

    // 標題描述
    const headlineSlot = dialog.querySelector('[slot="headline"]');
    const descriptionSlot = dialog.querySelector('[slot="description"]');
    headlineSlot.textContent = title;
    descriptionSlot.textContent = description;

    // 按鈕文字
    const acceptButton = dialog.querySelector('#question-dialog-accept-button');
    const denyButton = dialog.querySelector('#question-dialog-deny-button');
    acceptButton.textContent = acceptText;
    denyButton.textContent = denyText;

    acceptButton.addEventListener('click', () => {
        onAccept();
        dialog.open = false;
    });

    denyButton.addEventListener('click', () => {
        onDeny();
        dialog.open = false;
    });

    document.body.appendChild(dialog);

    // 顯示 dialog ( delay 1ms 顯示開啟動畫 )
    setTimeout(() => {
        dialog.open = true;
    }, 1);

    return dialog;
};

const showQuestionDialog = (options) => {
    return createQuestionDialog(options);
};