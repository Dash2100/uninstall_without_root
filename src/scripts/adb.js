const runADBcommand = (command) => {
    const ADBResponse = window.executeAdbCommand(command);

    console.log('[adb] ADB command:', command);

    // append command to terminal
    appendToTerminal(`> ${command}`, 'command');

    // Return the Promise so it can be chained
    return ADBResponse
        .then((response) => {
            // console.log('[adb] ADB response:', response);

            if (response) {
                appendToTerminal(response, 'response');
            } else {
                appendToTerminal('(No output)', 'response');
            }

            return response;
        })
        .catch((error) => {
            console.error('[adb] ADB error:', error);
            appendToTerminal(error, 'error');

            return Promise.reject(error);
        });
}

const deleteAPP = (packageName, deleteData = false) => {
    const command = `shell pm uninstall --user 0 ${deleteData ? '-k ' : ''}${packageName}`;

    return runADBcommand(command)
        .then((response) => {
            if (response.includes('Success')) {
                appendToTerminal(`App ${packageName} uninstalled successfully.`, 'success');
                return true; // 返回成功狀態
            } else {
                appendToTerminal(`Failed to uninstall app ${packageName}.`, 'error');
                return false; // 返回失敗狀態
            }
        })
        .catch((error) => {
            appendToTerminal(`Error uninstalling app ${packageName}: ${error}`, 'error');
            return Promise.reject(error);
        });
}

// 啟用應用程式函數
const enableAPP = (packageName) => {
    const command = `shell pm enable --user 0 ${packageName}`;

    return runADBcommand(command)
        .then((response) => {
            if (response.includes('new state: enabled')) {
                appendToTerminal(`App ${packageName} enabled successfully.`, 'success');
                return true;
            } else {
                appendToTerminal(`Failed to enable app ${packageName}.`, 'error');
                return false;
            }
        })
        .catch((error) => {
            appendToTerminal(`Error enabling app ${packageName}: ${error}`, 'error');
            return Promise.reject(error);
        });
}

// 停用應用程式函數
const disableAPP = (packageName) => {
    const command = `shell pm disable-user --user 0 ${packageName}`;

    return runADBcommand(command)
        .then((response) => {
            if (response.includes('new state: disabled')) {
                appendToTerminal(`App ${packageName} disabled successfully.`, 'success');
                return true;
            } else {
                appendToTerminal(`Failed to disable app ${packageName}.`, 'error');
                return false;
            }
        })
        .catch((error) => {
            appendToTerminal(`Error disabling app ${packageName}: ${error}`, 'error');
            return Promise.reject(error);
        });
}