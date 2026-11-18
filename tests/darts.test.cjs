const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// a browser ES module in a CommonJS package: import its source as a module
const load = () => import('data:text/javascript,' + encodeURIComponent(fs.readFileSync(path.join(__dirname, '../public/games/lib3d/kit/darts.js'), 'utf8')));

function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

test('dart positions land in the exact bed and number the server reported', async () => {
    const D = await load();
    const rnd = seeded(7);
    for (const n of D.WHEEL) {
        for (const [spec, bed] of [
            [{ number: n, multiplier: 1, sector: 's' + n }, 'single_inner'],
            [{ number: n, multiplier: 1, sector: 'S' + n }, 'single_outer'],
            [{ number: n, multiplier: 2 }, 'double'],
            [{ number: n, multiplier: 3 }, 'treble'],
            [{ number: n, multiplier: 6, dartMultiplier: 3 }, 'treble'],   // Killer: ×3 round on a treble
            [{ number: n, multiplier: 2, dartMultiplier: 1, sector: 'S' + n }, 'single_outer'], // ×2 round on a single
        ]) {
            for (let k = 0; k < 40; k++) {
                const p = D.dartPosition(spec, rnd);
                assert.equal(p.bed, bed);
                assert.deepEqual(D.hitAt(p.x, p.y), { bed, number: n }, `${JSON.stringify(spec)} → ${p.x},${p.y}`);
            }
        }
        // a single without a sector goes in one of the two single beds of that number
        for (let k = 0; k < 40; k++) {
            const p = D.dartPosition({ number: n, multiplier: 1 }, rnd);
            const h = D.hitAt(p.x, p.y);
            assert.equal(h.number, n);
            assert.ok(['single_inner', 'single_outer'].includes(h.bed));
        }
    }
});

test('bulls, misses and the wheel', async () => {
    const D = await load();
    const rnd = seeded(3);
    for (let k = 0; k < 50; k++) {
        assert.equal(D.hitAt(...xy(D.dartPosition({ number: 'bull', multiplier: 2, dartMultiplier: 2 }, rnd))).bed, 'bull');
        assert.equal(D.hitAt(...xy(D.dartPosition({ number: 'bull', multiplier: 1 }, rnd))).bed, 'outer_bull');
        assert.equal(D.hitAt(...xy(D.dartPosition({ number: 'bull', multiplier: 3, dartMultiplier: 1, sector: '25' }, rnd))).bed, 'outer_bull');
        assert.equal(D.hitAt(...xy(D.dartPosition({ number: 'bull', multiplier: 1, sector: '50' }, rnd))).bed, 'bull');
        assert.equal(D.hitAt(...xy(D.dartPosition({ number: null, miss: true, multiplier: 1 }, rnd))).bed, 'miss');
    }
    // the 20 at the top, the 6 on the right, the 3 at the bottom, the 11 on the left
    assert.equal(D.numberAt(Math.PI / 2), 20);
    assert.equal(D.numberAt(0), 6);
    assert.equal(D.numberAt(-Math.PI / 2), 3);
    assert.equal(D.numberAt(Math.PI), 11);
    assert.equal(D.bedOf({ miss: true }).bed, 'miss');
});
function xy(p) { return [p.x, p.y]; }
