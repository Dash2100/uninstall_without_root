// Cache page elements
const pages = {
    appList: document.getElementById('appList'),
    settings: document.getElementById('settings'),
    about: document.getElementById('about')
};

// Switch the active page
function switchPage(pageId) {
    const current = document.querySelector('.page.active');
    const next = pages[pageId] || document.getElementById(pageId);
    if (current === next) return;

    if (current) {
        current.classList.remove('active');
    }
    next.classList.add('active');

    const navigationBar = document.querySelector('mdui-navigation-bar');
    navigationBar.value = pageId === 'appList' ? 'apps' : pageId;
}
