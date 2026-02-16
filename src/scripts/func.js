// func.js — Shared state, DOM cache, UI helpers, and app initialization

// DOM element references
const els = {
    // overlay
    appLoading: document.getElementById('app-loading'),
    // dialog
    dialogWarning: document.querySelector('.dialog-warning'),
    dialogDeleteApp: document.querySelector('.dialog-delete-app'),
    dialogSystemWarning: document.querySelector('.dialog-system-warning'),
    dialogSelectDevice: document.querySelector('.dialog-select-device'),
    dialogWirelessConnect: document.querySelector('.dialog-wireless-connect'),
    dialogDisconnectConfirm: document.querySelector('.dialog-disconnect-confirm'),
    // card
    appCardTemplate: document.getElementById('app-card-template'),
    appInfoTemplate: document.getElementById('app-info-template'),
    // navbar icons
    iconWirelessConnect: document.getElementById('icon-wireless-connect'),
    iconConnected: document.getElementById('icon-connected'),
    iconDisconnected: document.getElementById('icon-disconnected'),
    iconLoading: document.getElementById('icon-loading'),
    // applist
    appListContainer: document.getElementById('app-list-content'),
    appListLoading: document.getElementById('app-list-loading'),
    appListDisconnected: document.getElementById('app-list-disconnected'),
    // search bar
    searchInput: document.getElementById('search-input'),
    searchBtn: document.getElementById('button-search'),
    refreshBtn: document.getElementById('button-applist-refresh')
};

// Shared state
let isConnected = false;
let isConnecting = false;
let appsList = { apps: { user: {}, system: {} } };
let disabledApps = new Set();
let connectedDevices = [];
let selectedDevice = null;
let useHelperMethod = false;
let isFetchingAppInfo = false;
let manuallyDisconnected = false;
let currentFilter = 'all';  // 'all', 'user', 'system'
let currentSort = 'name';   // 'name', 'package', 'status'

// UI Helpers
function toggleConnectionIcon(connected, loading = false) {
    els.iconConnected.classList.toggle('hidden', !connected || loading);
    els.iconDisconnected.classList.toggle('hidden', connected || loading);
    if (els.iconLoading) {
        els.iconLoading.classList.toggle('hidden', !loading);
    }
}

function clearAppList() {
    els.appListContainer.innerHTML = '';
    els.appListContainer.style.display = 'none';
    els.appListLoading.style.display = 'none';
    els.appListDisconnected.style.display = 'flex';
}

function clearPlaceholders() {
    els.appListLoading.style.display = 'none';
    els.appListDisconnected.style.display = 'none';
    els.appListContainer.style.display = 'block';
}

function showLoading(label) {
    els.appListContainer.style.display = 'none';
    els.appListDisconnected.style.display = 'none';
    els.appListLoading.style.display = 'flex';
    const loadingLabel = document.getElementById('app-list-loading-label');
    if (loadingLabel) {
        loadingLabel.textContent = label || '正在載入應用程式列表...';
    }
}

function updateLoadingLabel(label) {
    const loadingLabel = document.getElementById('app-list-loading-label');
    if (loadingLabel) {
        loadingLabel.textContent = label;
    }
}

// App initialization (called via body onload after all defer scripts have executed)
function initApp() {
    els.appLoading.classList.remove('app-loading-showing');
    switchPage('appList');

    getDevice().then(() => {
        setTimeout(() => {
            appInitialized = true;
            console.log('[App] Initialization complete, USB monitoring active');
            getDevice();
        }, 2000);
    });

    setupUSBDeviceMonitoring();
}
