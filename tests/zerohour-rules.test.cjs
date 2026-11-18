// Zero Hour: the rules (public/games/zerohour/rules.mjs), the draws, and the engine's turn flow and lifecycle
// (src/engines/zerohour.js) through the public engine interface. docs/plans/ZERO-HOUR.md §3–§5.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const engines = require(root + '/src/engines');
const ZH = require(root + '/src/engines/zerohour');
const R = ZH.rules;

const people = (n) => ['Alice', 'Ben', 'Chloe', 'Dev', 'Ella', 'Finn'].slice(0, n).map((name, i) => ({ id: String(i), name, avatar: null }));
const clone = (x) => JSON.parse(JSON.stringify(x));
function settle(r) { for (let i = 0; r.schedule && i < 40; i++) r = engines.applyScheduledAction(r.gameData, r.schedule); return r.gameData; }
const dartOf = (n, m = 1) => (n === 'miss' ? { type: 'TRIGGER_SPECIFIC_THROW', miss: true } : { type: 'TRIGGER_SPECIFIC_THROW', number: n, multiplier: m });
function throwDart(g, n, m) { return engines.handleGameAction(g, 'zerohour', dartOf(n, m), { throwSource: 'mock' }); }
/** a visit of three darts, settled through every scheduled step up to the next player's first dart */
function visit(g, darts) { let r; for (const [n, m] of darts) { r = throwDart(g, n, m); g = settle(r); } return { g, last: r }; }
function newGame(n = 4, secret = 'ab'.repeat(32)) { return engines.initGameData('zerohour', people(n), { secret }); }

/* ---------------- rules ---------------- */

test('hot numbers: two, distinct, double figures only, the same draw for the same secret and round', () => {
    const draw = R.hashDraw(7);
    const seen = new Set();
    for (let round = 1; round <= 400; round++) {
        const hot = R.drawHot(R.hashDraw(round), round);
        assert.equal(hot.length, 2);
        assert.notEqual(hot[0], hot[1]);
        for (const n of hot) { assert.ok(n >= 10 && n <= 20, `hot ${n}`); seen.add(n); }
        assert.ok(hot[0] > hot[1], 'highest first');
    }
    assert.equal(seen.size, 11, 'every double-figure number can be hot');
    assert.deepEqual(R.drawHot(draw, 3), R.drawHot(draw, 3));
});

test('dart scoring: normal darts, ×3 on a hot number (any bed), bulls never hot', () => {
    const hot = [19, 12];
    assert.equal(R.scoreDart({ number: 19, multiplier: 1 }, hot).points, 57);
    assert.equal(R.scoreDart({ number: 19, multiplier: 2 }, hot).points, 114);
    assert.equal(R.scoreDart({ number: 19, multiplier: 3 }, hot).points, 171);
    assert.equal(R.scoreDart({ number: 20, multiplier: 3 }, hot).points, 60);
    assert.equal(R.scoreDart({ number: 20, multiplier: 3 }, hot).hot, false);
    assert.equal(R.scoreDart({ number: 'bull', multiplier: 1 }, hot).points, 25);
    assert.equal(R.scoreDart({ number: 'bull', multiplier: 2 }, hot).points, 50);
    assert.equal(R.scoreDart({ number: 25, multiplier: 1 }, [25]).points, 25, 'a bull is never hot');
    assert.equal(R.scoreDart({ miss: true }, hot).points, 0);
    assert.equal(R.scoreDart(null, hot).points, 0);
    assert.equal(R.scoreDart({ number: 19, multiplier: 3 }, hot).base, 57, 'base is plain darts scoring');
});

test('chips: a visit becomes 5-point chips in drops of 2 plus one remainder chip, nothing rounded away', () => {
    for (let p = 0; p <= 600; p++) {
        const drops = R.visitDrops(p);
        assert.equal(drops.reduce((a, d) => a + d.v, 0), p, `points ${p}`);
        for (const d of drops) {
            if (d.rem) { assert.equal(d.chips, 1); assert.ok(d.v >= 1 && d.v <= 4); }
            else { assert.ok(d.chips >= 1 && d.chips <= R.DROP); assert.equal(d.v, d.chips * R.CHIP); }
        }
        assert.ok(drops.filter((d) => d.rem).length <= 1);
    }
    // the plan's example: 47 = 9 chips + a 2-point chip → four drops of 2, one of 1, and the remainder
    assert.deepEqual(R.visitDrops(47).map((d) => [d.chips, d.v]), [[2, 10], [2, 10], [2, 10], [2, 10], [1, 5], [1, 2]]);
    assert.deepEqual(R.visitDrops(40).map((d) => d.chips), [2, 2, 2, 2]);
    assert.deepEqual(R.visitDrops(0), []);
});

test('leaders: most value; level → higher total points; level on both → a tie', () => {
    const totals = { a: 100, b: 200, c: 200 };
    const order = ['a', 'b', 'c'];
    assert.equal(R.leaderOf({ byPlayer: { a: 30, b: 15 } }, totals, order).leader, 'a');
    const lv = R.leaderOf({ byPlayer: { a: 15, b: 15 } }, totals, order);
    assert.equal(lv.leader, 'b'); assert.equal(lv.onTotal, true);
    const tie = R.leaderOf({ byPlayer: { b: 15, c: 15 } }, totals, order);
    assert.equal(tie.leader, null); assert.deepEqual(tie.tie, ['b', 'c']);
    assert.equal(R.leaderOf({ byPlayer: {} }, totals, order).leader, null);
});

test('chance: the share of occupied numbers led (ties shared), always summing to 100%', () => {
    const draw = R.hashDraw('chance');
    for (let g = 0; g < 200; g++) {
        const players = ['a', 'b', 'c', 'd'].map((id, i) => {
            const total = (g * 37 + i * 91) % 500;
            return { id, total, drops: R.allocateVisit(draw, id, g, total) };
        });
        const s = R.summarise(players);
        const sum = s.standings.reduce((a, x) => a + x.chance, 0);
        if (s.occupied) assert.ok(Math.abs(sum - 1) < 1e-9, `sum ${sum}`);
        for (const x of s.standings) assert.equal(x.numbersLed, s.cells.filter((c) => c.leader === x.id).length);
    }
});

test('placings: by value on the winning number, then total; nothing there ranks below; exact levels share', () => {
    const cells = Array.from({ length: 37 }, (_, pocket) => ({ pocket, byPlayer: {} }));
    cells[14].byPlayer = { a: 30, b: 45, c: 15 };
    const players = [{ id: 'a', total: 300 }, { id: 'b', total: 200 }, { id: 'c', total: 900 }, { id: 'd', total: 999 }, { id: 'e', total: 999 }];
    const { rows, tiedTop } = R.placingsFor(players, cells, 14);
    assert.deepEqual(rows.map((r) => [r.id, r.place]), [['b', 1], ['a', 2], ['c', 3], ['d', 4], ['e', 4]]);
    assert.deepEqual(tiedTop, []);
    assert.equal(rows.find((r) => r.id === 'b').pointsRank, 5, 'the winner was last on points: an upset');
    assert.equal(R.marginOf(rows), 15);
    cells[3].byPlayer = { a: 15, b: 15 };
    const tie = R.placingsFor([{ id: 'a', total: 100 }, { id: 'b', total: 100 }], cells, 3);
    assert.deepEqual(tie.tiedTop, ['a', 'b']);
});

test('the wheel: a standard single-zero European wheel, 37 pockets, red and black alternate', () => {
    assert.equal(R.POCKETS, 37);
    assert.equal(R.WHEEL_ORDER.length, 37);
    assert.deepEqual(R.WHEEL_ORDER.slice().sort((a, b) => a - b), Array.from({ length: 37 }, (_, i) => i));
    assert.deepEqual(R.WHEEL_ORDER.slice(0, 5), [0, 32, 15, 19, 4]);
    assert.equal(R.pocketColor(0), 'green');
    const reds = R.WHEEL_ORDER.filter((n) => R.pocketColor(n) === 'red'), blacks = R.WHEEL_ORDER.filter((n) => R.pocketColor(n) === 'black');
    assert.equal(reds.length, 18); assert.equal(blacks.length, 18);
    for (let i = 1; i < 36; i++) assert.notEqual(R.pocketColor(R.WHEEL_ORDER[i]), R.pocketColor(R.WHEEL_ORDER[i + 1]));
    assert.deepEqual(R.neighboursOf(0), [26, 32]);
});

/* ---------------- the draws ---------------- */

test('draws: the same secret gives the same game; different secrets differ', () => {
    const a = ZH.drawFor('cd'.repeat(32)), b = ZH.drawFor('cd'.repeat(32)), c = ZH.drawFor('ef'.repeat(32));
    const seq = (d) => Array.from({ length: 50 }, (_, i) => d(`drop:p:1:${i}`, 37));
    assert.deepEqual(seq(a), seq(b));
    assert.notDeepEqual(seq(a), seq(c));
});

test('draws: uniform over the 37 pockets (χ², 370,000 draws)', () => {
    const d = ZH.drawFor('12'.repeat(32));
    const N = 370000, counts = new Array(37).fill(0);
    for (let i = 0; i < N; i++) counts[d(`spin:${i}`, 37)]++;
    const e = N / 37, chi = counts.reduce((a, c) => a + (c - e) ** 2 / e, 0);
    // 36 degrees of freedom: p = 0.001 at 67.99
    assert.ok(chi < 67.99, `chi² ${chi.toFixed(1)} counts ${counts}`);
});

test('draws: hot numbers and the hash draw used by the demo are uniform too', () => {
    const counts = {};
    for (let i = 0; i < 22000; i++) for (const n of R.drawHot(ZH.drawFor((i % 256).toString(16).padStart(2, '0').repeat(32)), i)) counts[n] = (counts[n] || 0) + 1;
    const vals = Object.values(counts), e = vals.reduce((a, b) => a + b, 0) / 11;
    assert.equal(vals.length, 11);
    assert.ok(vals.reduce((a, c) => a + (c - e) ** 2 / e, 0) < 29.6, JSON.stringify(counts)); // df 10, p 0.001
    const h = R.hashDraw(99), hc = new Array(37).fill(0);
    for (let i = 0; i < 185000; i++) hc[h('spin:' + i, 37)]++;
    assert.ok(hc.reduce((a, c) => a + (c - 5000) ** 2 / 5000, 0) < 67.99);
});

/* ---------------- the engine ---------------- */

test('a game: five rounds of three darts, hot numbers per round, points = chip value, one spin, placings', () => {
    let g = newGame(3);
    assert.equal(g.phase.type, 'playing');
    assert.equal(g.zh.round, 1);
    assert.equal(g.zh.hot.length, 2);
    const hots = [];
    for (let round = 1; round <= 5; round++) {
        hots.push(g.zh.hot.join(','));
        for (let p = 0; p < 3; p++) {
            assert.equal(g.activeIdx, p); assert.equal(g.currentRound, round);
            const h = g.zh.hot[0];
            const r = visit(g, [[h, 3], [20, 1], ['miss']]);
            g = r.g;
            if (round < 5) assert.equal(g.phase.type, 'playing');
        }
    }
    assert.equal(g.phase.type, 'winner');
    assert.equal(g.phase.data.reason, 'roulette');
    for (const p of g.players) assert.equal(p.drops.reduce((a, d) => a + d.v, 0), p.score, 'chip value = points');
    assert.ok(g.zh.spin && R.WHEEL_ORDER.includes(g.zh.spin.pocket));
    const rows = g.zh.placings;
    assert.equal(rows[0].id, g.phase.data.winnerId);
    assert.ok(rows[0].onPocket > 0);
    assert.deepEqual(g.phase.data.standings.map((s) => s.place), rows.map((r) => r.place));
    assert.equal(ZH.commitOf(g.zh.secret), g.zh.commit, 'commit–reveal');
});

test('a visit sweep: drops recorded with their pockets, steals and the favourite reported', () => {
    let g = newGame(2);
    g = visit(g, [[20, 3], [20, 3], [20, 3]]).g; // Alice 180 (or more if 20 is hot)
    const lv = g.zh.lastVisit;
    assert.equal(lv.playerId, '0');
    assert.equal(lv.drops.reduce((a, d) => a + d.v, 0), lv.points);
    assert.deepEqual(lv.steals, [], 'nothing to steal on an empty table');
    assert.equal(g.zh.favourite, '0');
    g = visit(g, [[g.zh.hot[0], 3], [g.zh.hot[0], 3], [g.zh.hot[0], 3]]).g; // Ben: three hot trebles, ≥ 810
    const st = g.zh.lastVisit.steals;
    for (const s of st) { assert.equal(s.to, '1'); assert.equal(s.from, '0'); assert.equal(g.zh.cells[s.pocket].leader, '1'); }
    assert.ok(st.length > 0, 'a huge visit takes numbers');
});

test('correcting dart 3 after the sweep: the surviving drops land where they did, nothing else moves', () => {
    let g = newGame(3);
    g = visit(g, [[17, 1], [18, 1], [19, 1]]).g;
    g = visit(g, [[5, 1], [6, 1], [7, 1]]).g;
    // Chloe's visit: snapshot before her dart 3 (what Correct Score restores), then T20 vs S20
    let r = throwDart(g, 20, 3); g = r.gameData; r = throwDart(g, 20, 3); g = r.gameData;
    const pre = clone(g);
    const big = settle(throwDart(clone(pre), 20, 3));
    const small = settle(throwDart(clone(pre), 20, 1));
    const others = (x) => x.players.filter((p) => p.id !== '2').map((p) => p.drops);
    assert.deepEqual(others(big), others(small), 'other players untouched');
    const a = big.players[2].drops.filter((d) => !d.rem), b = small.players[2].drops.filter((d) => !d.rem);
    assert.ok(b.length <= a.length);
    // whole drops are numbered in order: every drop the smaller visit keeps lands exactly where the bigger visit's did
    b.forEach((d, i) => { if (d.chips === a[i].chips) assert.equal(d.pocket, a[i].pocket); });
    // and re-applying the same dart reproduces the same table exactly
    assert.deepEqual(settle(throwDart(clone(pre), 20, 3)).players, big.players);
});

test('a restart (state through JSON) continues identically', () => {
    let g = newGame(2);
    for (let i = 0; i < 4; i++) g = visit(g, [[g.zh.hot[1], 2], [3, 1], [20, 3]]).g;
    const twin = clone(g);
    const finishGame = (x) => { while (x.phase.type !== 'winner') x = visit(x, [[x.zh.hot[0], 1], [1, 1], [2, 3]]).g; return x; };
    assert.deepEqual(finishGame(g).zh.placings, finishGame(twin).zh.placings);
});

test('the spin phase ignores darts; the spin draws are fixed for the match', () => {
    let g = newGame(2);
    while (!(g.zh.round === 5 && g.activeIdx === 1)) g = visit(g, [[20, 1], [1, 1], [5, 1]]).g;
    let r; for (const d of [[20, 1], [1, 1], [5, 1]]) { r = throwDart(g, ...d); g = r.gameData; }
    assert.equal(r.schedule.next, 'zerohour_begin_spin');
    r = engines.applyScheduledAction(g, r.schedule); g = r.gameData;
    assert.equal(g.phase.type, 'spin');
    const draws = g.zh.spin.draws;
    assert.equal(g.zh.spin.pocket, draws[draws.length - 1]);
    for (const p of draws.slice(0, -1)) assert.equal(Object.keys(g.zh.cells[p].byPlayer).length, 0, 're-spins only on empty pockets');
    const during = throwDart(g, 20, 3).gameData;
    assert.deepEqual(during.players, g.players, 'a dart during the spin changes nothing');
    assert.equal(g.zh.spin.durations.total, R.spinDurations(draws.length - 1).total);
    assert.equal(r.schedule.delayMs, g.zh.spin.durations.total);
    g = settle(r);
    assert.equal(g.phase.type, 'winner');
});

test('all-zero night: a shootout before the roulette, one dart each at face value', () => {
    let g = newGame(3);
    for (let i = 0; i < 15; i++) g = visit(g, [['miss'], ['miss'], ['miss']]).g;
    assert.equal(g.zh.shootout && g.zh.shootout.reason, 'zero');
    assert.equal(g.phase.type, 'playing');
    assert.equal(g.zh.spin, null);
    g = settle(throwDart(g, 20, 1));
    g = settle(throwDart(g, 'bull', 2)); // 50, no hot numbers in a shootout
    g = settle(throwDart(g, 19, 3));     // 57
    assert.equal(g.phase.type, 'winner');
    assert.equal(g.phase.data.winnerId, '2');
    assert.equal(g.phase.data.reason, 'shootout');
});

test('a level shootout throws again among the level players', () => {
    let g = newGame(2);
    for (let i = 0; i < 10; i++) g = visit(g, [['miss'], ['miss'], ['miss']]).g;
    g = settle(throwDart(g, 20, 1)); g = settle(throwDart(g, 20, 1));
    assert.equal(g.zh.shootout.round, 2);
    assert.equal(g.phase.type, 'playing');
    g = settle(throwDart(g, 1, 1)); g = settle(throwDart(g, 2, 1));
    assert.equal(g.phase.data.winnerId, '1');
});

test('a tie on the winning number (same value and total) goes to a shootout', () => {
    // Two players with mirror-image visits can't be forced onto the same pocket, so drive the resolve step directly
    let g = newGame(2);
    for (let i = 0; i < 10; i++) g = visit(g, [[20, 1], ['miss'], ['miss']]).g;
    const z = g.zh;
    assert.equal(g.phase.type, 'winner');
    // rebuild the end of the game with a forced tie at the winning pocket
    const t = clone(g);
    t.zh.placings = null; t.zh.shootout = null;
    t.zh.spin.tiedTop = ['0', '1'];
    t.zh.spin.rows = [{ id: '0', place: 1, onPocket: 20, total: 100, pointsRank: 1 }, { id: '1', place: 1, onPocket: 20, total: 100, pointsRank: 1 }];
    let r = ZH.scheduled.zerohour_resolve(t);
    assert.equal(r.gameData.zh.shootout.reason, 'tie');
    g = settle(r);
    g = settle(throwDart(g, 3, 1)); g = settle(throwDart(g, 4, 1));
    assert.equal(g.phase.data.winnerId, '1');
    assert.deepEqual(g.zh.placings.map((x) => [x.id, x.place]), [['1', 1], ['0', 2]]);
    assert.ok(z.secret);
});

test('doubles: a team is one colour, throwers alternate by visit, members carry the placing', () => {
    const ps = people(4);
    let g = engines.initGameData('zerohour', ps, { lineupMode: 'doubles', doublesTeams: [['0', '1'], ['2', '3']], secret: '9a'.repeat(32) });
    assert.equal(g.players.length, 2);
    assert.equal(g.isDoublesLineup, true);
    const first = g.lastThrow;
    g = visit(g, [[20, 1], [20, 1], [20, 1]]).g;
    g = visit(g, [[20, 1], [20, 1], [20, 1]]).g;
    assert.equal(g.throwerIndices[0], 1, 'team 1 hands over to its second member');
    while (g.phase.type !== 'winner') g = visit(g, [[g.zh.hot[0], 1], [20, 1], [1, 1]]).g;
    const ids = g.phase.data.standings.map((s) => s.id).sort();
    assert.deepEqual(ids, ['0', '1', '2', '3'], 'every member is placed (the session ranks people, not teams)');
    const teamPlace = (id) => g.zh.placings.find((r) => r.id === id).place;
    for (const s of g.phase.data.standings) assert.equal(s.place, teamPlace(s.id === '1' ? '0' : s.id === '3' ? '2' : s.id));
    assert.equal(first, null);
});

test('the secret never reaches the public state (server strip), and bots aim at the best hot number', () => {
    const g = newGame(2);
    assert.match(g.secret, /^[0-9a-f]{64}$/);
    const { secret, ...pub } = g;
    assert.equal(JSON.stringify(pub).includes(g.secret), false, 'nothing else in the state carries the secret');
    assert.equal(g.zh.secret, null, 'revealed only at the end');
    assert.equal(engines.initGameData('zerohour', people(2)).secret === engines.initGameData('zerohour', people(2)).secret, false);
    assert.equal(ZH.aimNumber(g), Math.max(...g.zh.hot));
});
