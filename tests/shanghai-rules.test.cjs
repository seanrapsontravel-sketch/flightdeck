// The pub "Shanghai" rule (Sean, 2026-11-18): a single, a double and a treble of the round's number in one visit
// wins outright, whatever the scores. Anything short of the full set plays on as before.
const test = require('node:test');
const assert = require('node:assert/strict');
const engines = require('../src/engines');

const players = ['Alice', 'Ben', 'Chloe'].map((name, i) => ({ id: String(i), name, avatar: null }));
function settle(result) { for (let i = 0; result.schedule && i < 30; i++) result = engines.applyScheduledAction(result.gameData, result.schedule); return result.gameData; }
const dart = (g, number, multiplier) => engines.handleGameAction(g, 'shanghai', number === 'miss'
    ? { type: 'TRIGGER_SPECIFIC_THROW', miss: true }
    : { type: 'TRIGGER_SPECIFIC_THROW', number, multiplier, sector: (multiplier === 3 ? 'T' : multiplier === 2 ? 'D' : 's') + number }, { throwSource: 'mock' });
function fresh() { const g = engines.initGameData('shanghai', players); return settle({ gameData: g, schedule: engines.initialMatchSchedule(g) }); }
/** throw a visit; returns the result of the last dart (not yet settled) */
function visit(g, darts) { let r = { gameData: g, schedule: null }; for (const [n, m] of darts) { r = dart(settle(r), n, m); } return r; }

test('a single, double and treble of the target in one visit wins outright (any order)', () => {
    for (const order of [[[1, 1], [1, 2], [1, 3]], [[1, 3], [1, 1], [1, 2]], [[1, 2], [1, 3], [1, 1]]]) {
        const g = fresh();
        g.players[1].score = 500; // a big lead elsewhere doesn't matter
        const r = visit(g, order);
        assert.equal(r.gameData.lastThrow.shanghai, true);
        assert.equal(r.gameData.phase.type, 'playing', 'the dart lands and scores first');
        assert.deepEqual(r.schedule && r.schedule.next, 'shanghai_resolve_match');
        const end = settle(r);
        assert.equal(end.phase.type, 'winner');
        assert.equal(end.phase.data.winnerId, '0');
        assert.equal(end.phase.data.reason, 'shanghai');
        assert.equal(end.phase.data.targetNumber, 1);
        assert.equal(end.players[0].score, 6);
        assert.deepEqual(end.players[0].roundScores.slice(0, 1), [6]);
    }
});

test('anything short of single + double + treble plays on', () => {
    for (const darts of [[[1, 3], [1, 3], [1, 2]], [[1, 1], [1, 2], ['miss']], [[1, 1], [1, 2], [2, 3]], [[1, 1], [1, 1], [1, 1]]]) {
        const end = settle(visit(fresh(), darts));
        assert.notEqual(end.phase.type, 'winner', JSON.stringify(darts));
        assert.equal(end.activeIdx, 1, 'next player up');
        assert.equal(end.shanghai, undefined);
    }
});

test('a Shanghai in a later round wins on that round’s number', () => {
    let g = fresh();
    // round 1: three plain visits
    for (let v = 0; v < 3; v++) g = settle(visit(g, [[1, 1], [5, 1], ['miss']]));
    assert.equal(g.currentRound, 2);
    const end = settle(visit(g, [[2, 3], [2, 1], [2, 2]]));
    assert.equal(end.phase.type, 'winner');
    assert.equal(end.phase.data.reason, 'shanghai');
    assert.equal(end.phase.data.targetNumber, 2);
    assert.equal(end.phase.data.winnerId, '0');
});

test('without a Shanghai the game still runs eight rounds and the top score wins', () => {
    let g = fresh();
    for (let r = 1; r <= 8; r++) for (let v = 0; v < 3; v++) g = settle(visit(g, [[r, v === 0 ? 3 : 1], ['miss'], ['miss']]));
    assert.equal(g.phase.type, 'winner');
    assert.equal(g.phase.data.reason, 'score');
    assert.equal(g.phase.data.winnerId, '0');
});
