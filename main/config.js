const { app, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const userData = app.getPath('userData');
const configPath = path.join(userData, 'config.json');

function getDefaultExtractPath() {
    const docPath = app.getPath('documents');
    const defaultPath = path.join(docPath, 'ADBExtracted');

    fs.promises.mkdir(defaultPath, { recursive: true })
        .then(() => console.log('[File] Default extract path ensured:', defaultPath))
        .catch(err => console.error('[File] Error ensuring default extract path:', err));

    return defaultPath;
}

const defaultConfig = {
    darkmode: true,
    debug_mode: false,
    extract_path: getDefaultExtractPath(),
    // theme_color: '#6750A4',
    theme_color: '#507ba4',
    custom_adb_path: null,
    custom_scrcpy_path: null
};

let configCache = null;

async function resetConfig() {
    console.log('[Config] resetConfig: writing default config to:', configPath);
    await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
    await fs.promises.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log('[Config] default config written');
    getDefaultExtractPath();
    configCache = { ...defaultConfig };
    return configCache;
}

async function readConfig() {
    if (configCache) return configCache;
    console.log('[Config] readConfig: reading config from disk:', configPath);
    try {
        await fs.promises.access(configPath);
    } catch {
        console.log('[Config] config not found, resetting');
        return resetConfig();
    }
    try {
        const data = await fs.promises.readFile(configPath, 'utf-8');
        console.log('[Config] config data read');
        const parsed = JSON.parse(data);
        configCache = { ...defaultConfig, ...parsed }; // merge with defaults in case of missing keys
        return configCache;
    } catch (err) {
        console.log('[Config] error parsing config, resetting');
        return resetConfig();
    }
}

async function updateConfig(key, val) {
    console.log('[Config] updateConfig:', key, val);
    const cfg = await readConfig();
    cfg[key] = val;
    configCache = cfg;
    await fs.promises.writeFile(configPath, JSON.stringify(cfg, null, 2));
    return cfg;
}

function registerIPC() {
    ipcMain.handle('get-config', () => {
        console.log('[Config] get-config');
        return readConfig();
    });

    ipcMain.handle('set-config', async (_e, key, val) => {
        return updateConfig(key, val);
    });

    ipcMain.handle('reset-config', () => {
        console.log('[Config] reset-config requested');
        return resetConfig();
    });

    ipcMain.handle('get-default-config', () => {
        return defaultConfig;
    });
}

module.exports = { readConfig, resetConfig, updateConfig, configPath, userData, registerIPC };
