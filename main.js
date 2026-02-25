const { app, BrowserWindow } = require('electron');
const path = require('path');

// Import and start the server
require('./server.js');

function createWindow() {
    const win = new BrowserWindow({
        width: 1024,
        height: 768,
        icon: path.join(__dirname, 'logo.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Remove the menu bar
    win.setMenuBarVisibility(false);

    // Load the local server URL
    win.loadURL('http://localhost:8000');

    win.on('closed', () => {
        app.quit();
    });
}

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
