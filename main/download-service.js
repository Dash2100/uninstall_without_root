const { app, ipcMain } = require('electron');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { updateConfig } = require('./config');

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        let options = url;
        // GitHub API needs User-Agent
        if (url.includes('api.github.com')) {
            options = {
                headers: { 'User-Agent': 'Node.js' }
            };
        }
        
        https.get(options, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                // Handle redirect
                return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) {
                return reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
            }
            const file = fs.createWriteStream(dest);
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
            file.on('error', (err) => {
                fs.unlink(dest, () => reject(err));
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

function extractFile(filePath, destDir) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        let command = '';
        if (filePath.endsWith('.zip')) {
            if (os.platform() === 'win32') {
                command = `powershell.exe -Command "Expand-Archive -Path '${filePath}' -DestinationPath '${destDir}' -Force"`;
            } else {
                command = `unzip -o "${filePath}" -d "${destDir}"`;
            }
        } else if (filePath.endsWith('.tar.gz') || filePath.endsWith('.tgz')) {
            command = `tar -xzf "${filePath}" -C "${destDir}"`;
        } else {
            return reject(new Error('Unsupported file extension for extraction.'));
        }

        exec(command, (error, stdout, stderr) => {
            if (error) {
                return reject(error);
            }
            resolve();
        });
    });
}

function getGithubLatestReleaseAsset(repo, osFilter, archFilter) {
    return new Promise((resolve, reject) => {
        const url = `https://api.github.com/repos/${repo}/releases/latest`;
        let data = '';
        https.get(url, { headers: { 'User-Agent': 'Node.js' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                // handle redirect manually if needed, but api usually doesn't redirect like this
                // for simplicity we assume direct JSON response
            }
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const release = JSON.parse(data);
                    if (!release.assets) return reject(new Error('No assets found in latest release.'));
                    
                    let bestMatch = null;
                    for (const asset of release.assets) {
                        const name = asset.name.toLowerCase();
                        if (name.includes(osFilter) && name.includes(archFilter)) {
                            bestMatch = asset;
                            break;
                        }
                    }
                    if (!bestMatch) {
                        // fallback to just OS if arch not found exactly (like macOS x64 running on arm64 via rosetta)
                        for (const asset of release.assets) {
                            const name = asset.name.toLowerCase();
                            if (name.includes(osFilter)) {
                                bestMatch = asset;
                                break;
                            }
                        }
                    }
                    if (bestMatch) {
                        resolve(bestMatch.browser_download_url);
                    } else {
                        reject(new Error(`No matching asset found for ${osFilter}-${archFilter}`));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

function registerIPC() {
    ipcMain.handle('download-adb', async () => {
        try {
            let platformStr = '';
            if (os.platform() === 'win32') platformStr = 'windows';
            else if (os.platform() === 'darwin') platformStr = 'darwin';
            else platformStr = 'linux';

            const url = `https://dl.google.com/android/repository/platform-tools-latest-${platformStr}.zip`;
            const userDataPath = app.getPath('userData');
            const downloadDir = path.join(userDataPath, 'downloads');
            if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

            const zipPath = path.join(downloadDir, 'platform-tools.zip');
            const extractDir = path.join(userDataPath, 'platform-tools-bin');

            console.log('[Download] Downloading ADB from:', url);
            await downloadFile(url, zipPath);
            
            console.log('[Download] Extracting ADB to:', extractDir);
            await extractFile(zipPath, extractDir);

            // Path to executable
            const adbExe = os.platform() === 'win32' ? 'adb.exe' : 'adb';
            const finalAdbPath = path.join(extractDir, 'platform-tools', adbExe);

            if (os.platform() !== 'win32') {
                fs.chmodSync(finalAdbPath, 0o755);
            }

            await updateConfig('custom_adb_path', finalAdbPath);
            return { success: true, path: finalAdbPath };
        } catch (error) {
            console.error('[Download] ADB Error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('download-scrcpy', async () => {
        try {
            let osFilter = '';
            let archFilter = '';
            const platform = os.platform();
            const arch = os.arch();

            if (platform === 'win32') {
                osFilter = 'win';
                archFilter = arch === 'x64' ? '64' : '32';
            } else if (platform === 'darwin') {
                osFilter = 'macos';
                archFilter = arch === 'arm64' ? 'aarch64' : 'x86_64';
            } else {
                osFilter = 'linux';
                archFilter = arch === 'arm64' ? 'aarch64' : 'x86_64';
            }

            console.log('[Download] Finding scrcpy asset for', osFilter, archFilter);
            const downloadUrl = await getGithubLatestReleaseAsset('Genymobile/scrcpy', osFilter, archFilter);
            
            const userDataPath = app.getPath('userData');
            const downloadDir = path.join(userDataPath, 'downloads');
            if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

            const ext = downloadUrl.endsWith('.zip') ? '.zip' : '.tar.gz';
            const archivePath = path.join(downloadDir, `scrcpy${ext}`);
            const extractDirBase = path.join(userDataPath, 'scrcpy-bin');

            console.log('[Download] Downloading scrcpy from:', downloadUrl);
            await downloadFile(downloadUrl, archivePath);

            console.log('[Download] Extracting scrcpy to:', extractDirBase);
            await extractFile(archivePath, extractDirBase);

            // Find the extracted folder (usually scrcpy-win64-vX.Y.Z or similar)
            const files = fs.readdirSync(extractDirBase);
            let finalScrcpyPath = null;
            
            // Check if there is a subfolder created by extraction
            let scrcpyDir = extractDirBase;
            if (files.length === 1 && fs.statSync(path.join(extractDirBase, files[0])).isDirectory()) {
                scrcpyDir = path.join(extractDirBase, files[0]);
            }

            const scrcpyExe = platform === 'win32' ? 'scrcpy.exe' : 'scrcpy';
            
            // Search inside scrcpyDir recursively for scrcpy
            function findFile(dir, targetFile) {
                const list = fs.readdirSync(dir);
                for (const file of list) {
                    const fullPath = path.join(dir, file);
                    if (fs.statSync(fullPath).isDirectory()) {
                        const res = findFile(fullPath, targetFile);
                        if (res) return res;
                    } else if (file === targetFile) {
                        return fullPath;
                    }
                }
                return null;
            }

            finalScrcpyPath = findFile(extractDirBase, scrcpyExe);

            if (!finalScrcpyPath) {
                throw new Error(`Executable ${scrcpyExe} not found in extracted files.`);
            }

            if (platform !== 'win32') {
                fs.chmodSync(finalScrcpyPath, 0o755);
            }

            await updateConfig('custom_scrcpy_path', finalScrcpyPath);
            return { success: true, path: finalScrcpyPath };
        } catch (error) {
            console.error('[Download] Scrcpy Error:', error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = { registerIPC };
