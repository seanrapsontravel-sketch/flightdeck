const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const validation = require('./validation');
const { atomicWrite } = require('./storage');

function playerStore(dataDir) {
    const file = path.join(dataDir, 'players.json');
    function load() {
        if (!fs.existsSync(file)) return [];
        const players = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!Array.isArray(players)) throw new Error('Damaged player roster. Preserve players.json and restore a backup.');
        return players.slice(0, 100).filter(p => p && typeof p.name === 'string' && p.name.trim()).map(p => {
            // Older rosters may contain names/photos that predate validation.
            // Preserve the person while dropping an unsafe legacy photo.
            let avatar = null;
            try { avatar = validation.avatar(p.avatar); } catch { /* no external/SVG photos */ }
            return { id: typeof p.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(p.id) ? p.id : randomUUID(),
                name: validation.playerName(p.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 40)), avatar };
        });
    }
    function save(players) { atomicWrite(file, (players || []).map(({ id, name, avatar }) => ({ id, name, avatar: avatar || null }))); }
    return { load, save };
}
module.exports = { playerStore };
