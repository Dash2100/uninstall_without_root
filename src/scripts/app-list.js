// App list: fetching, filtering, virtual scrolling, card rendering

let virtualScrollData = {
    allApps: [],
    itemHeight: 80,
    containerHeight: 0,
    scrollTop: 0,
    visibleCount: 0,
    bufferSize: 5,
    startIndex: 0,
    endIndex: 0
};
let scrollTimeout = null;

async function refreshAppList() {
    showLoading();
    try {
        if (useHelperMethod) {
            appsList = await fetchAppsWithHelper();
            disabledApps = new Set();
            for (const type of ['user', 'system']) {
                for (const app of Object.values(appsList.apps[type])) {
                    if (!app.enabled) disabledApps.add(app.package_name);
                }
            }
        } else {
            disabledApps = await fetchDisabledApps();
            appsList = await fetchAppsLegacy();
        }
        const term = els.searchInput.value.trim().toLowerCase();
        const toShow = term ? filterApps(appsList, term) : appsList;
        renderAppList(toShow);
    } catch (err) {
        console.error('[adb] Refresh App List Error:', err);
        clearAppList();
        showSnackAlert('獲取應用程式列表時發生錯誤');
    }
}

async function fetchAppsWithHelper() {
    const shellCmd = 'shell "CLASSPATH=/data/local/tmp/helper.dex app_process /data/local/tmp/ com.dash.helper.AdbHelper LIST_ALL"';
    const command = selectedDevice ? `-s ${selectedDevice} ${shellCmd}` : shellCmd;
    const res = await runADBcommand(command, 0);
    const list = JSON.parse(res.trim());
    const apps = { user: {}, system: {} };
    for (const item of list) {
        const target = item.isSystem ? apps.system : apps.user;
        target[item.packageName] = {
            package_name: item.packageName,
            label: item.label || item.packageName,
            versionName: item.versionName || '',
            enabled: item.enabled,
            app_path: '',
            isSystem: item.isSystem
        };
    }
    return { apps };
}

async function fetchDisabledApps() {
    try {
        const command = selectedDevice
            ? `-s ${selectedDevice} shell pm list packages -d`
            : 'shell pm list packages -d';
        const res = await runADBcommand(command);
        return new Set(res.trim().split(/\r?\n/).map(l => l.replace('package:', '').trim()));
    } catch (err) {
        console.error('[adb] Get Disabled Apps Error:', err);
        showSnackAlert('獲取「已停用的應用程式」時發生錯誤');
        return new Set();
    }
}

async function fetchAppsLegacy() {
    const command = selectedDevice
        ? `-s ${selectedDevice} shell pm list packages -f`
        : 'shell pm list packages -f';
    const res = await runADBcommand(command);
    const lines = res.trim().split(/\r?\n/);
    const apps = { user: {}, system: {} };
    lines.forEach(line => {
        const match = /package:(.+)=([^\s]+)/.exec(line) || [];
        const apkPath = match[1] || '';
        const pkg = match[2] || line.replace('package:', '').trim();
        const target = line.includes('/data/app/') || line.includes('/data/user/')
            ? apps.user : apps.system;
        target[pkg] = { package_name: pkg, label: pkg, app_path: apkPath, enabled: true };
    });
    return { apps };
}

function filterApps({ apps }, term) {
    if (!term) return { apps };
    const filtered = { apps: { user: {}, system: {} } };
    const lowerTerm = term.toLowerCase();
    for (const type of Object.keys(apps)) {
        for (const app of Object.values(apps[type])) {
            const matchName = app.package_name.toLowerCase().includes(lowerTerm);
            const matchLabel = app.label && app.label.toLowerCase().includes(lowerTerm);
            if (matchName || matchLabel) {
                filtered.apps[type][app.package_name] = app;
            }
        }
    }
    return filtered;
}

function initVirtualScroll() {
    const container = els.appListContainer;
    virtualScrollData.containerHeight = container.clientHeight || 600;
    virtualScrollData.visibleCount = Math.ceil(virtualScrollData.containerHeight / virtualScrollData.itemHeight);

    container.addEventListener('scroll', handleVirtualScroll);
    window.addEventListener('resize', () => {
        virtualScrollData.containerHeight = container.clientHeight || 600;
        virtualScrollData.visibleCount = Math.ceil(virtualScrollData.containerHeight / virtualScrollData.itemHeight);
        renderVirtualAppList();
    });
}

function handleVirtualScroll() {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        virtualScrollData.scrollTop = els.appListContainer.scrollTop;
        renderVirtualAppList();
    }, 16);
}

function renderAppList({ apps }) {
    clearPlaceholders();

    let allApps = [];
    if (currentFilter === 'all' || currentFilter === 'user') {
        allApps.push(...Object.values(apps.user).map(app => ({ ...app, type: '使用者程式' })));
    }
    if (currentFilter === 'all' || currentFilter === 'system') {
        allApps.push(...Object.values(apps.system).map(app => ({ ...app, type: '系統程式' })));
    }

    allApps.sort((a, b) => {
        // Sort by type first (User apps before System apps)
        if (a.type !== b.type) {
            return a.type === '使用者程式' ? -1 : 1;
        }

        if (currentSort === 'name') {
            return (a.label || a.package_name).localeCompare(b.label || b.package_name);
        } else if (currentSort === 'package') {
            return a.package_name.localeCompare(b.package_name);
        } else if (currentSort === 'status') {
            const aDisabled = disabledApps.has(a.package_name) ? 0 : 1;
            const bDisabled = disabledApps.has(b.package_name) ? 0 : 1;
            return aDisabled - bDisabled || (a.label || a.package_name).localeCompare(b.label || b.package_name);
        }
        return 0;
    });

    virtualScrollData.allApps = allApps;
    if (!virtualScrollData.containerHeight) initVirtualScroll();
    renderVirtualAppList();
}

function renderVirtualAppList() {
    const { allApps, itemHeight, visibleCount, bufferSize, scrollTop } = virtualScrollData;
    if (allApps.length === 0) {
        els.appListContainer.innerHTML = '';
        return;
    }

    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize);
    const endIndex = Math.min(allApps.length, startIndex + visibleCount + bufferSize * 2);
    virtualScrollData.startIndex = startIndex;
    virtualScrollData.endIndex = endIndex;

    const totalHeight = allApps.length * itemHeight;
    const offsetY = startIndex * itemHeight;

    els.appListContainer.innerHTML = '';
    els.appListContainer.style.height = `${virtualScrollData.containerHeight}px`;
    els.appListContainer.style.position = 'relative';
    els.appListContainer.style.overflow = 'auto';

    const scrollContainer = document.createElement('div');
    scrollContainer.style.height = `${totalHeight}px`;
    scrollContainer.style.position = 'relative';

    const visibleContainer = document.createElement('div');
    visibleContainer.style.transform = `translateY(${offsetY}px)`;
    visibleContainer.style.position = 'absolute';
    visibleContainer.style.top = '0';
    visibleContainer.style.left = '0';
    visibleContainer.style.right = '0';

    const frag = document.createDocumentFragment();
    for (let i = startIndex; i < endIndex; i++) {
        const app = allApps[i];
        const card = createAppCard(app, app.type);
        card.style.height = `${itemHeight}px`;
        card.style.boxSizing = 'border-box';
        frag.appendChild(card);
    }

    visibleContainer.appendChild(frag);
    scrollContainer.appendChild(visibleContainer);
    els.appListContainer.appendChild(scrollContainer);
}

function createAppCard(app, type) {
    const tmpl = els.appCardTemplate.innerHTML;
    const enabled = !disabledApps.has(app.package_name);
    const label = app.label || app.package_name;
    const subtitle = useHelperMethod ? `${type} ${app.package_name}` : type;
    const icon = enabled ? 'adb' : 'block';
    const iconStyle = enabled ? '' : 'background-color: rgba(239, 68, 68, 0.2); --mdui-color-primary: #ef4444; color: #ef4444;';
    const html = tmpl
        .replace(/{{app.packageName}}/g, app.package_name)
        .replace(/{{app.label}}/g, label)
        .replace(/{{app.icon}}/g, icon)
        .replace(/{{app.iconStyle}}/g, iconStyle)
        .replace(/{{app.subtitle}}/g, subtitle);
    const wrapper = document.createElement('template');
    wrapper.innerHTML = html.trim();
    const card = wrapper.content.firstChild;
    card.classList.add('app-card');
    card.addEventListener('click', async () => {
        if (!isConnected || isFetchingAppInfo) return;
        isFetchingAppInfo = true;
        const avatar = card.querySelector('mdui-avatar');
        const originalIcon = icon;
        if (avatar) {
            const spinnerWrapper = document.createElement('div');
            spinnerWrapper.className = 'my-auto mx-4 flex items-center justify-center';
            spinnerWrapper.style.width = '40px';
            spinnerWrapper.style.height = '40px';
            spinnerWrapper.style.borderRadius = '50%';
            spinnerWrapper.style.backgroundColor = enabled
                ? 'rgb(var(--mdui-color-primary-container))'
                : 'rgba(239, 68, 68, 0.2)';
            const spinner = document.createElement('mdui-circular-progress');
            spinner.style.width = '24px';
            spinner.style.height = '24px';
            if (!enabled) {
                spinner.style.cssText = 'width:24px;height:24px;--mdui-color-primary:239,68,68;';
            }
            spinnerWrapper.appendChild(spinner);
            avatar.replaceWith(spinnerWrapper);
            avatar._spinnerWrapper = spinnerWrapper;
        }
        try {
            await viewAppInfo(app.package_name);
        } finally {
            if (avatar && avatar._spinnerWrapper) {
                avatar._spinnerWrapper.replaceWith(avatar);
                delete avatar._spinnerWrapper;
            }
            isFetchingAppInfo = false;
        }
    });
    return card;
}
