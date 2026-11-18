const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { atomicWrite } = require('./storage');

const CONTROL = new Set(['CLIENT_INFO', 'ADD_PLAYER', 'REMOVE_PLAYER', 'REORDER_WAITING',
    'CLEAR_LINEUP', 'FILL_LINEUP', 'RANDOMIZE_LINEUP', 'SET_LINEUP_MODE', 'MOVE_DOUBLES_PLAYER', 'MOVE_SINGLES_PLAYER',
    'NAVIGATE', 'PREVIEW_GAME', 'SELECT_GAME', 'FORWARD_GAME_ACTION', 'CORRECT_SCORE_BEGIN', 'CORRECT_SCORE_CANCEL',
    'CORRECT_SCORE_APPLY', 'START_SESSION', 'RESUME_SESSION', 'SET_PLAY_ORDER', 'END_SESSION']);

function createDevices(dataDir) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const file = path.join(dataDir, 'devices.json');
    let devices = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
    const codes = { control: String(crypto.randomInt(10000000, 100000000)), operator: String(crypto.randomInt(10000000, 100000000)) };
    const codeExpires = Date.now() + 15 * 60 * 1000;
    let attempts = [];
    const hosts = new Set(['localhost', '127.0.0.1', '[::1]', os.hostname().toLowerCase()]);
    Object.values(os.networkInterfaces()).flat().filter(Boolean).forEach(a => hosts.add(a.address.toLowerCase()));
    const extraOrigins = new Set((process.env.FD_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean));
    function validOrigin(req) {
        try {
            const origin = new URL(req.headers.origin);
            return origin.origin === `https://${req.headers.host}` && (hosts.has(origin.hostname.toLowerCase()) || extraOrigins.has(origin.origin));
        } catch { return false; }
    }
    function role(req) {
        const token = /(?:^|;\s*)fd_device=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
        if (!token) return 'viewer';
        const hash = crypto.createHash('sha256').update(token).digest('hex');
        return devices.find(d => d.hash === hash && d.expires > Date.now())?.role || 'viewer';
    }
    function operator(req, res, next) {
        if ((req.method !== 'GET' && !validOrigin(req)) || role(req) !== 'operator') return res.status(403).json({ ok: false, error: 'Operator pairing required.' });
        next();
    }
    function pair(req, res) {
        if (!validOrigin(req)) return res.status(403).json({ ok: false, error: 'Unrecognised origin.' });
        attempts = attempts.filter(t => t > Date.now() - 60000);
        if (attempts.length >= 10) return res.status(429).json({ ok: false, error: 'Wait one minute before trying again.' });
        attempts.push(Date.now());
        const { role: requested, code } = req.body || {};
        if (!codes[requested] || codeExpires < Date.now() || typeof code !== 'string' || code !== codes[requested]) {
            return res.status(403).json({ ok: false, error: 'Invalid or expired pairing code. Codes are shown on the host terminal for 15 minutes after startup.' });
        }
        const token = crypto.randomBytes(32).toString('hex');
        devices = devices.filter(d => d.expires > Date.now()).slice(-31);
        devices.push({ hash: crypto.createHash('sha256').update(token).digest('hex'), role: requested, expires: Date.now() + 30 * 86400000 });
        atomicWrite(file, devices);
        res.setHeader('Set-Cookie', `fd_device=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`);
        res.json({ ok: true, role: requested });
    }
    function allowed(deviceRole, action, request) {
        if (deviceRole === 'viewer') return false;
        if (deviceRole === 'operator') return true;
        if (!CONTROL.has(action)) return false;
        // Simulation belongs in the operator area. Normal game setup/help is safe.
        if (action === 'FORWARD_GAME_ACTION') return ['TOGGLE_HELP', 'TOGGLE_LEADERBOARD', 'SELECT_QUICK10_PLAYER', 'CONFIRM_X01_SETUP', 'CONFIRM_ATW_SETUP'].includes(request.payload?.type);
        if (action === 'CORRECT_SCORE_APPLY') return request.payload?.type === 'TRIGGER_SPECIFIC_THROW';
        return true;
    }
    return { codes, validOrigin, role, operator, pair, allowed };
}
module.exports = { createDevices };
