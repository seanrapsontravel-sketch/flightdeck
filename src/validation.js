function playerName(value) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 40 || /[\u0000-\u001f\u007f]/.test(value)) {
        throw new Error('Enter a player name of 1–40 characters.');
    }
    return value.trim();
}
function avatar(value) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || value.length > 256 * 1024 || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
        throw new Error('Use a JPEG, PNG or WebP photo smaller than 192 KB.');
    }
    const bytes = Buffer.from(value.split(',')[1], 'base64');
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!(value.startsWith('data:image/jpeg;') && jpeg || value.startsWith('data:image/png;') && png || value.startsWith('data:image/webp;') && webp)) {
        throw new Error('The photo format does not match its contents.');
    }
    return value;
}
function validThrow(p) {
    if (!p || typeof p !== 'object') return false;
    if (p.type === 'TRIGGER_THROW') return true;
    if (p.type !== 'TRIGGER_SPECIFIC_THROW') return false;
    if (p.miss != null && typeof p.miss !== 'boolean') return false;
    if (p.miss === true) return true;
    const n = p.number;
    const m = p.multiplier == null ? 1 : p.multiplier;
    return Number.isInteger(m) && m >= 1 && m <= 3 &&
        (n === 'bull' ? m <= 2 : Number.isInteger(n) && n >= 1 && n <= 20) &&
        (p.sector == null || typeof p.sector === 'string' && /^(?:[sSDT](?:[1-9]|1[0-9]|20)|Bull|bull|25|50)$/.test(p.sector));
}
module.exports = { playerName, avatar, validThrow };
