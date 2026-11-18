// Million Pound Oche — the V2 rules (docs/plans/MILLION-POUND-OCHE.md §4), through the public engine interface.
const test = require('node:test');
const assert = require('node:assert/strict');
const engines = require('../src/engines');
const mpo = require('../src/engines/millionpound');
const qbank = require('../src/engines/millionpound/bank');
const { tickSession, startSession } = require('../src/session');

const GAME = 'millionpound';
const names = ['Alice', 'Ben', 'Chloe', 'Dev', 'Esme', 'Finn'];
const lineup = (n) => names.slice(0, n).map((name, i) => ({ id: String(i), name, avatar: null }));
const WHEEL = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

function settle(result, stopAt) {
    for (let i = 0; result.schedule && i < 60; i++) {
        if (stopAt && result.gameData.phase.type === stopAt) break;
        result = engines.applyScheduledAction(result.gameData, result.schedule);
    }
    return result;
}
const throwAt = (g, spec) => engines.handleGameAction(g, GAME, { type: 'TRIGGER_SPECIFIC_THROW', ...spec }, { throwSource: 'mock' });
const sec = (n, m) => (m === 3 ? 'T' : m === 2 ? 'D' : 's') + n;
const at = (key, m = 1) => ({ number: mpo.ANCHORS[key], multiplier: m, sector: sec(mpo.ANCHORS[key], m) });
const BULL = { number: 'bull', multiplier: 2, sector: 'Bull' }, OUTER = { number: 'bull', multiplier: 1, sector: '25' }, MISS = { miss: true };
const wrongKey = (g) => qbank.LETTERS.find((L) => L !== g.question.correctKey);
function fresh(n = 4, options = {}) { return engines.initGameData(GAME, lineup(n), { seed: 1234, ...options }); }
/** throw `what` ('right' / 'wrong' / 'rightT' / 'wrongT' or a spec) and run the flow to the next `playing` (or `stopAt`) */
function play(g, what, stopAt) {
    const spec = what === 'right' ? at(g.question.correctKey) : what === 'rightT' ? at(g.question.correctKey, 3)
        : what === 'wrong' ? at(wrongKey(g)) : what === 'wrongT' ? at(wrongKey(g), 3) : what;
    return settle(throwAt(g, spec), stopAt).gameData;
}
const revealOf = (g, what) => play(g, what, 'reveal');
const onward = (g) => settle({ gameData: g, schedule: { next: 'millionpound_next' } }).gameData;

test('the zones: 5 / 5 / 3 / 3 / 2 numbers an answer, round the anchors; sudden death 1', () => {
    assert.deepEqual(mpo.ZONE_SIZES, [5, 5, 3, 3, 2]);
    for (const size of [5, 3, 2, 1]) {
        const all = Object.values(mpo.ZONES[size]).flat();
        assert.equal(new Set(all).size, size * 4, `size ${size}: four zones, no number in two`);
        for (const [key, ns] of Object.entries(mpo.ZONES[size])) {
            assert.ok(ns.includes(mpo.ANCHORS[key]), `${key} keeps its anchor`);
            assert.ok(ns.every((n) => mpo.QUADRANTS[key].includes(n)), `${key} inside its quadrant`);
            const idx = ns.map((n) => WHEEL.indexOf(n)).sort((a, b) => a - b);
            assert.ok(idx.every((v, i) => i === 0 || v - idx[i - 1] === 1 || (idx[0] === 0 && idx.at(-1) === 19)), `${key} contiguous`);
        }
    }
    for (const size of [5, 3, 2, 1]) for (let n = 1; n <= 20; n++) for (const m of [1, 2, 3]) {
        const want = Object.entries(mpo.ZONES[size]).find(([, ns]) => ns.includes(n));
        assert.equal(mpo.answerOf({ number: n, multiplier: m }, size), want ? want[0] : null, `${m}×${n} at size ${size}`);
    }
});

test('a correct single or double +1, a correct treble +2, a wrong single 0, a wrong treble −1', () => {
    let g = fresh(1);
    g = play(g, 'right'); assert.equal(g.players[0].rung, 1);
    g = play(g, at(g.question.correctKey, 2)); assert.equal(g.players[0].rung, 2);
    const rev = revealOf(g, 'rightT');
    assert.equal(rev.phase.data.outcome, 'treble_right'); assert.equal(rev.phase.data.move, 2); assert.equal(rev.players[0].rung, 4);
    const w = revealOf(onward(rev), 'wrong'); assert.equal(w.players[0].rung, 4); assert.equal(w.phase.data.move, 0);
    const wt = revealOf(onward(w), 'wrongT');
    assert.equal(wt.phase.data.outcome, 'treble_wrong'); assert.equal(wt.players[0].rung, 3); assert.equal(wt.phase.data.move, -1);
    assert.equal(wt.players[0].trebles, 1); assert.equal(wt.players[0].wrongTrebles, 1);
});

test('nothing moves until the reveal; every question carries its zones and what is at stake', () => {
    const st = mpo.stakesFor(12, 10);
    assert.equal(st.now, 125000); assert.equal(st.right, 250000); assert.equal(st.trebleRight, 500000); assert.equal(st.trebleWrong, 64000);
    const g = fresh(1);
    assert.equal(g.question.zoneSize, 5); assert.ok(g.question.zones.A.includes(20));
    assert.deepEqual([g.question.stakes.right, g.question.stakes.trebleRight, g.question.stakes.trebleWrong], [100, 200, 0]);
    const r = throwAt(g, at('A'));
    assert.equal(r.gameData.phase.type, 'locked'); assert.equal(r.gameData.players[0].rung, 0);
    assert.equal(r.schedule.delayMs, mpo.LOCK_MS[0]);
});

test('a treble in an INACTIVE number is just a miss; so is any dart outside the zones', () => {
    let g = fresh(1);
    for (let i = 0; i < 6; i++) g = play(g, 'right');
    assert.equal(g.currentRound, 3); assert.equal(g.question.zoneSize, 3);
    const before = g.players[0].rung;
    const rev = revealOf(g, { number: 18, multiplier: 3, sector: 'T18' });     // A's quadrant, but not A's zone now
    assert.equal(rev.phase.data.outcome, 'inactive'); assert.equal(rev.players[0].rung, before); assert.equal(rev.phase.data.noAnswer, true);
});

test('checkpoints: a wrong treble never drops you below £1,000 or £32,000 once reached', () => {
    assert.deepEqual(mpo.CHECKPOINTS, [5, 10]);
    assert.equal(mpo.prizeFor(5), 1000); assert.equal(mpo.prizeFor(10), 32000);
    assert.equal(mpo.stakesFor(5, 5).wrongTreble, 5); assert.equal(mpo.stakesFor(5, 5).safe, true);
    assert.equal(mpo.stakesFor(6, 5).wrongTreble, 5); assert.equal(mpo.stakesFor(4, 0).wrongTreble, 3);
    let g = fresh(1);
    for (let i = 0; i < 4; i++) g = play(g, 'right');        // rung 4
    g = play(g, 'rightT');                                    // rung 6: skips 5, still banks it
    assert.equal(g.players[0].rung, 6); assert.equal(g.players[0].banked, 5);
    g = play(g, 'wrongT'); assert.equal(g.players[0].rung, 5);
    const rev = revealOf(g, 'wrongT');
    assert.equal(rev.players[0].rung, 5, 'held at the checkpoint'); assert.equal(rev.phase.data.saved, true);
});

test('the inner bull is a free pass once per player; after that, and the outer bull, no answer', () => {
    let rev = revealOf(fresh(1), BULL);
    assert.equal(rev.phase.data.outcome, 'pass'); assert.equal(rev.phase.data.right, true); assert.equal(rev.players[0].rung, 1);
    assert.equal(rev.players[0].passUsed, true); assert.equal(rev.players[0].passes, 1); assert.equal(rev.players[0].correct, 0);
    const g = onward(rev);
    assert.equal(g.question.passAvailable, false);
    rev = revealOf(g, BULL);
    assert.equal(rev.phase.data.outcome, 'pass_used'); assert.equal(rev.players[0].rung, 1);
    rev = revealOf(fresh(1), OUTER);
    assert.equal(rev.phase.data.outcome, 'outer_bull'); assert.equal(rev.players[0].rung, 0);
});

test('one dart per question: a second dart before the next question is ignored', () => {
    const r = throwAt(fresh(2), at('A'));
    const again = throwAt(r.gameData, at('B'));
    assert.equal(again.schedule, null); assert.equal(again.gameData.phase.data.answer, 'A'); assert.equal(again.gameData.dartsThisQuestion, 1);
});

test('a visit is three questions for one player, then UP NEXT; five visits, fifteen questions, harder as they go', () => {
    let g = fresh(4);
    const order = [];
    for (let round = 1; round <= 5; round++) for (let p = 0; p < 4; p++) for (let k = 0; k < 3; k++) {
        assert.equal(g.phase.type, 'playing', `round ${round} player ${p} q ${k}`);
        assert.equal(g.activeIdx, p); assert.equal(g.currentRound, round);
        const n = (round - 1) * 3 + k + 1;
        assert.equal(g.question.number, n); assert.equal(g.question.level, mpo.QUESTION_LEVELS[n - 1]);
        assert.equal(g.question.zoneSize, mpo.ZONE_SIZES[round - 1]);
        order.push(g.question.id);
        g = play(g, p === 0 || (p === 1 && n <= 9) ? 'right' : 'wrong');
    }
    assert.equal(new Set(order).size, 60, 'no repeats in a game');
    assert.equal(g.phase.type, 'winner'); assert.equal(g.phase.data.winnerId, '0'); assert.equal(g.phase.data.reason, 'rung');
    assert.deepEqual(g.players.map((p) => p.rung), [15, 9, 0, 0]);
    assert.deepEqual(g.players.map((p) => p.answers.length), [15, 15, 15, 15]);
});

test('trebles can reach £1M early; tied millionaires: the earliest to the million wins', () => {
    let g = fresh(2);
    while (g.phase.type === 'playing') g = play(g, g.activeIdx === 0 ? 'rightT' : 'right');
    assert.equal(g.players[0].millionAt, 8); assert.equal(g.players[1].millionAt, 15);
    assert.equal(g.phase.type, 'winner'); assert.equal(g.phase.data.winnerId, '0'); assert.equal(g.phase.data.reason, 'million_first');
});

test('a tie at the top goes to sudden death: a treble beats a single beats anything else', () => {
    let g = fresh(3);
    while (g.phase.type === 'playing' && !g.suddenDeath) g = play(g, g.activeIdx === 2 || g.question.number > 9 ? 'wrong' : 'right');
    assert.deepEqual(g.suddenDeath.contenders, [0, 1]); assert.equal(g.suddenDeath.round, 1);
    assert.equal(g.phase.type, 'playing'); assert.equal(g.activeIdx, 0);
    assert.equal(g.question.zoneSize, 1); assert.equal(g.question.suddenDeath, true);
    assert.ok(!g.questionIds.includes(g.question.id), 'a fresh question');
    g = play(g, 'right'); assert.equal(g.activeIdx, 1);
    g = play(g, 'right');                                         // both single: level again
    assert.equal(g.phase.type, 'playing'); assert.equal(g.suddenDeath.round, 2);
    g = play(g, 'right'); g = play(g, 'rightT');                  // single v treble
    assert.equal(g.phase.type, 'winner'); assert.equal(g.phase.data.winnerId, '1'); assert.equal(g.phase.data.reason, 'sudden_death');
    assert.equal(g.players[1].rung, 9, 'sudden death never moves the ladder');
});

test('sudden death: if everyone fails they all go again; the free pass does not apply', () => {
    let g = fresh(2);
    while (g.phase.type === 'playing' && !g.suddenDeath) g = play(g, 'wrong');
    assert.equal(g.suddenDeath.round, 1);
    g = play(g, BULL); assert.equal(g.players[0].passUsed, false);
    g = play(g, MISS);
    assert.equal(g.suddenDeath.round, 2); assert.deepEqual(g.suddenDeath.contenders, [0, 1]);
    g = play(g, 'right'); g = play(g, 'wrong');
    assert.equal(g.phase.type, 'winner'); assert.equal(g.phase.data.winnerId, '0');
});

test('the question plan: different questions per player, balanced letters, session excludes honoured', () => {
    const g = fresh(6);
    const ids = g.questionIds;
    assert.equal(ids.length, 90); assert.equal(new Set(ids).size, 90);
    const letters = g.plan.flat().map((e) => e.key);
    for (const L of qbank.LETTERS) assert.ok([22, 23].includes(letters.filter((k) => k === L).length), `${L} balanced`);
    const again = engines.initGameData(GAME, lineup(6), { seed: 99, recentQuestions: ids });
    assert.equal(again.questionIds.filter((id) => ids.includes(id)).length, 0, 'a rematch repeats nothing');
    assert.deepEqual(fresh(6).plan, g.plan, 'reproducible from its seed');
    assert.equal(g.suddenPlan.filter((e) => ids.includes(e.id)).length, 0, 'sudden-death questions are fresh');
});

test('doubles: a team answers; the thrower rotates every visit', () => {
    const g0 = engines.initGameData(GAME, lineup(4), { lineupMode: 'doubles', seed: 5, doublesTeams: [['0', '1'], ['2', '3']] });
    assert.equal(g0.players.length, 2); assert.ok(g0.isDoublesLineup);
    const first = g0.players[0].members.map((m) => m.name);
    let g = g0;
    for (let i = 0; i < 6; i++) g = play(g, 'right');
    assert.equal(g.currentRound, 2);
    assert.equal(throwAt(g, at(g.question.correctKey)).gameData.lastThrow.playerName, first[1]);
});

test('bots produce real darts for every profile', () => {
    const g = fresh(1);
    for (const profile of ['dummy', 'casual', 'intermediate', 'advanced']) {
        const spec = engines.buildProfiledThrowSpec(g, GAME, profile);
        assert.ok(spec && (spec.miss || spec.number != null));
    }
    assert.equal(mpo.aimNumber(g), mpo.ANCHORS[g.question.correctKey]);
});

test('the state is plain JSON; Correct Score replays the same question', () => {
    const g = fresh(3);
    const before = JSON.parse(JSON.stringify(g));
    const r = throwAt(g, at('C'));
    assert.deepEqual(JSON.parse(JSON.stringify(r.gameData)), r.gameData);
    const corrected = settle(throwAt(before, at(before.question.correctKey)), 'reveal').gameData;
    assert.equal(corrected.question.id, before.question.id); assert.equal(corrected.phase.data.right, true);
});

test('debug previews: locked, right, treble, wrong, wrong treble, pass, million', () => {
    const g = fresh(2);
    for (const s of ['mpo_locked', 'mpo_right', 'mpo_treble', 'mpo_wrong', 'mpo_wrong_treble', 'mpo_pass', 'mpo_million']) {
        assert.ok(['locked', 'reveal'].includes(engines.buildDebugPreviewPhase(GAME, g, s).type), s);
    }
});

test('a timed session ends between rounds, never part-way through one, and never in sudden death', () => {
    const s = startSession(lineup(3), 30, 0);
    let g = fresh(3);
    g = play(g, 'right');
    tickSession(s, g, false, false, s.deadline + 1);
    assert.equal(s.status, 'expiring', 'mid-visit: carry on');
    for (let i = 0; i < 5; i++) g = play(g, 'right');
    tickSession(s, g, true, false, s.deadline + 2);
    assert.equal(s.status, 'expiring', 'a takeout between visits does not end it mid-round');
    g = play(g, 'right'); g = play(g, 'right');
    const r = settle(throwAt(g, at(g.question.correctKey)), 'round_announce');
    tickSession(s, r.gameData, true, false, s.deadline + 3);
    assert.equal(s.status, 'ended'); assert.equal(s.history.at(-1).reason, 'round_finished');
    const s2 = startSession(lineup(3), 30, 0);
    tickSession(s2, fresh(3), false, false, s2.deadline + 1);
    assert.equal(s2.status, 'ended', 'a clock that runs out before a round starts ends at once');
    let h = fresh(2);
    while (h.phase.type === 'playing' && !h.suddenDeath) h = play(h, 'wrong');
    const s3 = startSession(lineup(2), 30, 0);
    tickSession(s3, h, false, false, s3.deadline + 1);
    assert.equal(s3.status, 'expiring', 'sudden death plays on');
    h = play(h, MISS); tickSession(s3, h, true, false, s3.deadline + 2);
    assert.equal(s3.status, 'expiring');
});

test('the server is told not to hold darts thrown between questions', () => {
    assert.equal(engines.queuesThrows(GAME), false);
    assert.equal(engines.queuesThrows('shanghai'), true);
});
