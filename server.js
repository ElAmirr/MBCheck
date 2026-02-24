const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Load settings
let settings = { mbcheckPath: './mbcheck', logsPath: './logs' };

// In Electron packaged app, settings.json and data folders should be in the resources folder
const isPackaged = process.mainModule && process.mainModule.filename.indexOf('app.asar') !== -1;

// electron-builder puts extraResources in the 'resources' folder directly
const resourcesPath = isPackaged
    ? (process.platform === 'win32' ? path.join(process.resourcesPath) : process.resourcesPath)
    : __dirname;

const settingsPath = path.join(resourcesPath, 'settings.json');
console.log('Checking settings at:', settingsPath);

if (fs.existsSync(settingsPath)) {
    try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
        console.error('Error parsing settings.json:', e);
    }
}

// Fallback for static assets in packaged environment
app.use((req, res, next) => {
    const filePath = path.join(resourcesPath, req.path);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        next();
    }
});

// Resolve paths - relative to resourcesPath if not absolute
const resolveDataPath = (p) => {
    if (path.isAbsolute(p)) return p;
    return path.resolve(resourcesPath, p);
};

const MBCHECK_DIR = resolveDataPath(settings.mbcheckPath);
const LOGS_DIR = resolveDataPath(settings.logsPath);
const USERS_FILE = resolveDataPath(settings.usersPath || './users.json');

console.log('Using MBCheck directory:', MBCHECK_DIR);
console.log('Using Logs directory:', LOGS_DIR);
console.log('Using Users file:', USERS_FILE);

if (!fs.existsSync(LOGS_DIR)) {
    try {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
    } catch (e) {
        console.error('Error creating logs directory:', e);
    }
}

if (!fs.existsSync(MBCHECK_DIR)) {
    console.warn('MBCheck directory does not exist:', MBCHECK_DIR);
}

// Endpoint to get users from dynamic path
app.get('/api/users', (req, res) => {
    if (fs.existsSync(USERS_FILE)) {
        try {
            const data = fs.readFileSync(USERS_FILE, 'utf8');
            res.json(JSON.parse(data));
        } catch (e) {
            console.error('Error reading users file:', e);
            res.status(500).json({ error: 'Failed to read users file' });
        }
    } else {
        res.status(404).json({ error: 'Users file not found' });
    }
});

if (!fs.existsSync(MBCHECK_DIR)) {
    console.warn('MBCheck directory does not exist:', MBCHECK_DIR);
}

// Endpoint to update barcode in MBCheck file
app.post('/api/update-barcode', (req, res) => {
    const { program, pouchIndex, newBarcode, oldBarcode, user, role } = req.body;

    if (!program || pouchIndex === undefined || !newBarcode) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const filePath = path.join(MBCHECK_DIR, `MBCheck_${program}.txt`);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Program file not found' });
    }

    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let lines = content.split('\n');

        // Line 11 is index 10 (first barcode)
        // Line 12 is index 11
        // Line 13 is index 12
        // etc.
        const lineIndex = 10 + pouchIndex;

        if (lineIndex >= lines.length) {
            // If the file is shorter than expected, we might need to pad it or handle error
            // For now, let's just append or notify
            return res.status(400).json({ error: 'Pouch index out of range for file' });
        }

        const previousLineValue = lines[lineIndex];
        lines[lineIndex] = newBarcode + '|';

        fs.writeFileSync(filePath, lines.join('\n'));

        // Log the action
        const today = new Date().toISOString().split('T')[0];
        const logFile = path.join(LOGS_DIR, `${today}.json`);

        let logs = [];
        if (fs.existsSync(logFile)) {
            logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
        }

        const logEntry = {
            timestamp: new Date().toISOString(),
            user,
            role,
            program,
            pouch: pouchIndex + 1,
            oldBarcode: oldBarcode || previousLineValue.replace('|', '').trim(),
            newBarcode,
            action: 'UPDATE'
        };

        logs.push(logEntry);
        fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));

        res.json({ success: true, logEntry });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update file' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
