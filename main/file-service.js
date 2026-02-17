const { ipcMain, shell, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { readConfig, userData } = require('./config');

const tempPath = path.join(userData, 'temp');

async function formatTemp() {
    console.log('[File] formatTemp: clearing temp folder:', tempPath);
    const files = await fs.promises.readdir(tempPath).catch(() => []);
    console.log('[File] files found:', files);
    await Promise.all(
        files.map(f => fs.promises.rm(path.join(tempPath, f), { recursive: true, force: true }))
    );
    console.log('[File] temp folder cleared');
}

async function initTemp() {
    console.log('[File] initTemp: creating temp folder:', tempPath);
    await fs.promises.mkdir(tempPath, { recursive: true });
    await formatTemp();
}

function registerIPC() {
    ipcMain.handle('dialog:showOpenDialog', (_e, opts) => {
        console.log('[Dialog] showOpenDialog:', opts);
        return dialog.showOpenDialog(opts);
    });

    ipcMain.handle('format-temp-folder', () => {
        console.log('[File] format-temp-folder requested');
        return formatTemp();
    });

    ipcMain.handle('get-temp-folder-path', () => {
        console.log('[File] get-temp-folder-path:', tempPath);
        return tempPath;
    });

    ipcMain.handle('check-file-exists', (_e, file) => {
        console.log('[File] check-file-exists:', file);
        return fs.promises.access(file).then(() => true).catch(() => false);
    });

    ipcMain.handle('rename-and-move-apk', async () => {
        console.log('[File] rename-and-move-apk: moving from temp to dest');
        const cfg = await readConfig();

        let dest = cfg.extract_path;
        console.log('[Config] dest from config:', dest);

        if (!path.isAbsolute(dest)) {
            dest = path.join(userData, dest);
            console.log('[File] resolved dest:', dest);
        }

        await fs.promises.mkdir(dest, { recursive: true });
        console.log('[File] ensured dest directory exists');

        const files = await fs.promises.readdir(tempPath);
        console.log('[File] files to move:', files);

        if (files.length === 0) {
            console.log('[File] no files to move');
            return { state: false, error: false };
        }

        await Promise.all(
            files.map(f => {
                console.log('[File] moving file:', f);
                return fs.promises.rename(path.join(tempPath, f), path.join(dest, f));
            })
        );

        console.log('[File] files moved successfully');
        return { state: true, files, dest };
    });

    ipcMain.handle('open-file-path', (_e, fp) => {
        console.log('[File] open-file-path:', fp);
        return shell.showItemInFolder(fp);
    });
}

module.exports = { initTemp, formatTemp, registerIPC };
