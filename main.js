const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Import and start the server
require('./server.js');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        frame: false, // Frameless window
        alwaysOnTop: true, // Always stay above other windows
        transparent: true, // Allow transparency for widget look
        icon: path.join(__dirname, 'applogo.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false // Simplified for this implementation
        }
    });

    // Remove the menu bar
    mainWindow.setMenuBarVisibility(false);

    // Load the local server URL
    mainWindow.loadURL('http://localhost:8000');

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// IPC Handlers for Widget/Full View toggle
ipcMain.on('minimize-to-widget', () => {
    mainWindow.setSize(80, 80);
    mainWindow.setAlwaysOnTop(true);
});

ipcMain.on('expand-to-full', () => {
    mainWindow.setSize(1024, 768);
    mainWindow.center();
});

ipcMain.on('close-app', () => {
    app.quit();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
