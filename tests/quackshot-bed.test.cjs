const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { handleQuackshotThrow, init } = require('../src/engines/quackshot');

// browser ES modules in a CommonJS package: load the kit's darts.js as a data: module and point common.js at it
async function load() {
    const src = (f) => fs.readFileSync(path.join(__dirname, '../public/games', f), 'utf8');
    const darts = 'data:text/javascript,' + encodeURIComponent(src('lib3d/kit/darts.js'));
    const common = src('quackshot/common.js').replace("'../lib3d/kit/darts.js'", JSON.stringify(darts));
    const [C, D] = await Promise.all([import('data:text/javascript,' + encodeURIComponent(common)), import(darts)]);
    return { C, D };
}

/** score one dart through the real rules, then place it as the 3D page does and read back where it really sits */
function throwAndPlace(C, D, spec, k = 0) {
    const gd = init([{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Ben' }]);
    handleQuackshotThrow(gd, spec);
    const lt = gd.lastThrow;
    const key = `p1|1|${k}`;
    const pos = C.dartSpot(lt, key);
    return { lt, at: D.hitAt(pos.x, pos.y), want: C.bedFor(lt, key) };
}

test('every Quackshot dart is drawn in a bed of the zone the server scored, on its number', async () => {
    const { C, D } = await load();
    const forms = [];
    for (const n of D.WHEEL) {
        forms.push(
            [{ number: n, multiplier: 1, sector: `s${n}` }, 'inner_single', 'single_inner'],
            [{ number: n, multiplier: 1, sector: `S${n}` }, 'board', 'single_outer'],
            [{ number: n, multiplier: 2, sector: `D${n}` }, 'board', 'double'],
            [{ number: n, multiplier: 3, sector: `T${n}` }, 'triple', 'treble'],
            [{ number: n, multiplier: 1 }, 'board', 'single_outer'],            // a single with no sector is scored outer
            [{ number: n, multiplier: 2 }, 'board', 'double'],
            [{ number: n, multiplier: 3 }, 'triple', 'treble'],
            [{ number: n, multiplier: 1, sector: 'SingleInner' }, 'inner_single', 'single_inner'], // Autodarts bed names
            [{ number: n, multiplier: 1, sector: 'singleouter' }, 'board', 'single_outer'],
        );
    }
    forms.push(
        [{ number: 'bull', multiplier: 2, sector: 'Bull' }, 'double_bull', 'bull'],
        [{ number: 'bull', multiplier: 1, sector: '25' }, 'bull', 'outer_bull'],
        [{ number: 'bull', multiplier: 2 }, 'double_bull', 'bull'],
        [{ number: 'bull', multiplier: 1 }, 'bull', 'outer_bull'],
        [{ number: 25, multiplier: 1, sector: '25' }, 'bull', 'outer_bull'],
        [{ miss: true }, 'miss', 'miss'],
    );
    let k = 0;
    for (const [spec, zone, bed] of forms) {
        for (let rep = 0; rep < 4; rep++) {
            const { lt, at, want } = throwAndPlace(C, D, spec, k++);
            const tag = JSON.stringify(spec);
            assert.equal(lt.zone, zone, `${tag}: server zone`);
            assert.equal(want.bed, bed, `${tag}: mapped bed`);
            assert.equal(at.bed, bed, `${tag}: drawn bed`);
            assert.equal(C.zoneOfBed(at.bed), lt.zone, `${tag}: drawn bed scores the server's zone`);
            if (typeof spec.number === 'number' && spec.number !== 25) assert.equal(at.number, spec.number, `${tag}: number`);
        }
    }
});

test('a bot throw with no number still lands in its zone, the same place every time', async () => {
    const { C, D } = await load();
    const seen = new Set();
    for (let i = 0; i < 400; i++) {
        const { lt, at } = throwAndPlace(C, D, null, i);   // null throwSpec: the rules roll a random zone, no number
        seen.add(lt.zone);
        assert.equal(C.zoneOfBed(at.bed), lt.zone, `random ${lt.zone} drawn in ${at.bed}`);
        const again = C.dartSpot(lt, `p1|1|${i}`), b = D.hitAt(again.x, again.y);
        assert.deepEqual([b.bed, b.number], [at.bed, at.number], 'reload shows the same dart');
    }
    for (const z of ['double_bull', 'bull', 'inner_single', 'triple', 'board']) assert.ok(seen.has(z), z);
});

test('dart labels read like the 2D page', async () => {
    const { C } = await load();
    assert.equal(C.dartText({ zone: 'inner_single', number: 17, label: '+1' }), 's17 · +1');
    assert.equal(C.dartText({ zone: 'triple', number: 5, label: '−2 ×2' }), 'T5 · −2 ×2');
    assert.equal(C.dartText({ zone: 'double_bull', number: 'bull', label: '+3' }), 'BULL · +3');
    assert.equal(C.dartText({ zone: 'miss', number: null, label: '−1' }), 'MISS · −1');
    assert.equal(C.roundMult(5), 1); assert.equal(C.roundMult(6), 2);
});
