const fs = require('node:fs');
const path = require('node:path');

// One lane, one writer. Rename + fsync makes a whole versioned checkpoint the
// commit boundary; never acknowledge a score whose checkpoint failed to commit.
function atomicWrite(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.tmp`;
    const fd = fs.openSync(tmp, 'w', 0o600);
    try {
        fs.writeFileSync(fd, JSON.stringify(value));
        fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, file);
    const dir = fs.openSync(path.dirname(file), 'r');
    try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
}

class SessionStore {
    constructor(dataDir) { this.file = path.join(dataDir, 'session.json'); }
    load() {
        if (!fs.existsSync(this.file)) return null;
        const record = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (record.schemaVersion !== 1 || !record.state || !Array.isArray(record.state.players)) {
            throw new Error('Unsupported or damaged session. Preserve data/session.json and restore a backup.');
        }
        return record;
    }
    save(snapshot) { atomicWrite(this.file, { ...snapshot, schemaVersion: 1, savedAt: Date.now() }); }
}
module.exports = { atomicWrite, SessionStore };
