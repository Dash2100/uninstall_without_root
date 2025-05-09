const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const adbController = require('./adbController');

function createWindow() {
  const win = new BrowserWindow({
    width: 500,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadFile("./src/index.html");
}

// ADB IPC 處理程序
function setupAdbHandlers() {
  // 獲取設備列表
  ipcMain.handle('adb:getDevices', async () => {
    try {
      return await adbController.getDevices();
    } catch (error) {
      console.error('Error in adb:getDevices:', error);
      throw error;
    }
  });

  // 獲取應用程式列表
  ipcMain.handle('adb:getAppList', async () => {
    try {
      return await adbController.getAppList();
    } catch (error) {
      console.error('Error in adb:getAppList:', error);
      throw error;
    }
  });
}

app.whenReady().then(() => {
  setupAdbHandlers();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
