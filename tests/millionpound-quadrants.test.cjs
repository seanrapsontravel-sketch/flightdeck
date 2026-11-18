// Million Pound Oche — the TV's rules mirror (public/games/millionpound/common.js) must equal the engine's
// (src/engines/millionpound.js): the quadrants, anchors and ladder, and every bed's answer.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mpo = require('../src/engines/millionpound');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'games', 'millionpound', 'common.js'), 'utf8');
const literal = (name) => {
    const m = new RegExp(`export const ${name} = ([^;]+);`).exec(src);
    assert.ok(m, `${name} in common.js`);
    return Function(`return (${m[1]})`)();
};

test('quadrants, anchors and the ladder match the engine', () => {
    assert.deepEqual(literal('QUADRANTS'), mpo.QUADRANTS);
    assert.deepEqual(literal('ANCHORS'), mpo.ANCHORS);
    assert.deepEqual(literal('LADDER'), mpo.LADDER);
    assert.deepEqual(literal('CHECKPOINTS'), mpo.CHECKPOINTS);
    assert.deepEqual(literal('ZONE_SIZES'), mpo.ZONE_SIZES);
    assert.deepEqual(literal('ZONES'), mpo.ZONES);
    const consts = /export const ROUNDS = (\d+), PER_TURN = (\d+), QUESTIONS = (\d+);/.exec(src);
    assert.deepEqual(consts.slice(1).map(Number), [mpo.ROUNDS, mpo.QUESTIONS_PER_TURN, mpo.QUESTIONS]);
});

test('every bed gives the same answer on the TV as in the engine', () => {
    const Q = literal('QUADRANTS'), tvOf = {};
    Object.entries(Q).forEach(([k, ns]) => ns.forEach((n) => { tvOf[n] = k; }));
    for (let n = 1; n <= 20; n++) for (const m of [1, 2, 3]) assert.equal(tvOf[n], mpo.quadrantOf({ number: n, multiplier: m }), `${m}×${n}`);
    for (const spec of [{ number: 'bull', multiplier: 2 }, { number: 'bull', multiplier: 1 }, { miss: true }]) {
        assert.equal(mpo.quadrantOf(spec), null);
        assert.equal(tvOf[spec.number], undefined);
    }
});
