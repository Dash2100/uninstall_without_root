const { exec } = require('child_process');
const path = require('path');
const util = require('util');
const fs = require('fs');

const execAsync = util.promisify(exec);

class ADBController {
    constructor() {
        // 獲取 adb 路徑
        this.adbPath = path.join(__dirname, 'adb', 'adb.exe');
    }

    async runCommand(command) {
        try {
            const { stdout, stderr } = await execAsync(`"${this.adbPath}" ${command}`);
            if (stderr) {
                console.error(`ADB stderr: ${stderr}`);
            }
            return stdout;
        } catch (error) {
            console.error(`ADB Error: ${error.message}`);
            throw new Error(`ADB 命令執行失敗: ${error.message}`);
        }
    }

    async getDevices() {
        try {
            const output = await this.runCommand('devices');
            const lines = output.split('\n').filter(line => line.trim() !== '');

            // 移除標頭
            lines.shift();

            const devices = lines.map(line => {
                const [id, status] = line.split('\t');
                return { id: id.trim(), status: status ? status.trim() : 'unknown' };
            });

            return devices;
        } catch (error) {
            console.error('獲取設備列表失敗:', error);
            throw error;
        }
    } async getAppList() {
        try {
            // 先獲取所有已安裝應用包名
            const output = await this.runCommand('shell pm list packages -f');
            const lines = output.split('\n').filter(line => line.trim() !== '');

            // 使用 map 和 filter 代替迴圈，提高效能
            const apps = lines
                .filter(line => line.startsWith('package:'))
                .map(line => {
                    const parts = line.substring(8).split('=');
                    if (parts.length === 2) {
                        const apkPath = parts[0];
                        const packageName = parts[1].trim();

                        return {
                            packageName,
                            apkPath
                        };
                    }
                    return null;
                })
                .filter(app => app !== null);

            return apps;
        } catch (error) {
            console.error('獲取應用列表失敗:', error);
            throw error;
        }
    }
}

module.exports = new ADBController();
