const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { handleShanghaiThrow, init } = require('../src/engines/shanghai');

// browser ES modules in a CommonJS package: load the kit's darts.js as a data: module and point beds.js at it
async function load() {
    const src = (f) => fs.readFileSync(path.join(__dirname, '../public/games', f), 'utf8');
    const darts = 'data:text/javascript,' + encodeURIComponent(src('lib3d/kit/darts.js'));
    const beds = src('shanghai/beds.js').replace("'../lib3d/kit/darts.js'", JSON.stringify(darts));
    const [B, D] = await Promise.all([import('data:text/javascript,' + encodeURIComponent(beds)), import(darts)]);
    return { B, D };
}

/** score one dart through the real rules in a given round, then place it as the 3D page does and read back where it sits */
function throwAndPlace(B, D, spec, round = 1, k = 0) {
    const gd = init([{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Ben' }]);
    gd.currentRound = round;
    handleShanghaiThrow(gd, spec);
    const lt = gd.lastThrow;
    const key = `p1|${round}|${k}`;
    const pos = B.dartSpot(lt, key);
    return { lt, at: D.hitAt(pos.x, pos.y), want: B.bedFor(lt, key) };
}

test('every Shanghai dart is drawn in the bed the server scored, on its number', async () => {
    const { B, D } = await load();
    const forms = [];
    for (const n of D.WHEEL) {
        forms.push(
            [{ number: n, multiplier: 1, sector: `s${n}` }, 'single_inner'],
            [{ number: n, multiplier: 1, sector: `S${n}` }, 'single_outer'],
            [{ number: n, multiplier: 2, sector: `D${n}` }, 'double'],
            [{ number: n, multiplier: 3, sector: `T${n}` }, 'treble'],
            [{ number: n, multiplier: 2 }, 'double'],
            [{ number: n, multiplier: 3 }, 'treble'],
        );
    }
    for (const round of [1, 5, 8]) for (const [spec, bed] of forms) {
        const { lt, at, want } = throwAndPlace(B, D, spec, round);
        assert.equal(want.bed, bed, JSON.stringify(spec));
        assert.equal(at.bed, bed, `drawn in ${at.bed} for ${JSON.stringify(spec)}`);
        assert.equal(at.number, spec.number, `on ${at.number} for ${JSON.stringify(spec)}`);
        // and the score is the server's: only the round's number scores
        assert.equal(lt.points, spec.number === round ? spec.number * spec.multiplier : 0);
    }
});

test('a single with no sector lands in a single bed of its number, the same place every time', async () => {
    const { B, D } = await load();
    const beds = new Set();
    for (let k = 0; k < 40; k++) {
        const a = throwAndPlace(B, D, { number: 7, multiplier: 1 }, 7, k), b = throwAndPlace(B, D, { number: 7, multiplier: 1 }, 7, k);
        assert.ok(['single_inner', 'single_outer'].includes(a.at.bed));
        assert.equal(a.at.number, 7);
        assert.deepEqual(a.at, b.at, 'seeded: a reload draws it in the same place');
        beds.add(a.at.bed);
    }
    assert.equal(beds.size, 2, 'both single beds get used');
});

test('bulls: the multiplier is always 1 in Shanghai, so the sector decides; misses sit outside the doubles', async () => {
    const { B, D } = await load();
    const cases = [
        [{ number: 'bull', multiplier: 2, sector: 'Bull' }, 'bull'],
        [{ number: 'bull', multiplier: 1, sector: '25' }, 'outer_bull'],
        [{ number: 'bull', multiplier: 2 }, 'outer_bull'],     // no sector: drawn in the outer bull (both score 0)
        [{ miss: true }, 'miss'],
        [{ miss: true, sector: 'MISS' }, 'miss'],
    ];
    for (const [spec, bed] of cases) {
        const { lt, at } = throwAndPlace(B, D, spec);
        assert.equal(lt.points, 0);
        if (spec.number === 'bull') assert.equal(lt.multiplier, 1, 'the engine reports a bull at ×1');
        assert.equal(at.bed, bed, JSON.stringify(spec));
    }
});

test('the HUD line for each dart', async () => {
    const { B } = await load();
    const g = (spec, round = 5) => { const gd = init([{ id: 'p1', name: 'A' }]); gd.currentRound = round; handleShanghaiThrow(gd, spec); return B.dartText(gd.lastThrow, 'k'); };
    assert.equal(g({ number: 5, multiplier: 3, sector: 'T5' }), 'T5 · +15');
    assert.equal(g({ number: 5, multiplier: 1, sector: 's5' }), 'S5 · +5');
    assert.equal(g({ number: 7, multiplier: 1, sector: 'S7' }), '7 · 0');
    assert.equal(g({ number: 12, multiplier: 2, sector: 'D12' }), 'D12 · 0');
    assert.equal(g({ miss: true }), 'MISS · 0');
    assert.equal(g({ number: 'bull', multiplier: 1, sector: '25' }), '25 · 0');
    assert.equal(g({ number: 'bull', multiplier: 2, sector: 'Bull' }), 'BULL · 0');
});
