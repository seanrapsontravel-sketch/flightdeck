// ?demo=1 — a simulated Zero Hour game on the TV page, no server. Every rule decision goes through rules.mjs (the
// same module the server engine requires), and the turn flow and windows mirror src/engines/zerohour.js + core.js:
// dart 3 arrives with its intermission (2.5 s) or round announce (3 s); after the last visit, the sweep window
// (SWEEP_MS), then the `spin` phase (durations from rules.spinDurations) and the winner.
// Draws use rules.hashDraw(seed) instead of the server's HMAC secret.
//   window.__zerohourDemo.force(kind)   kind: hot3 | hot | t20 | single | miss | bull
//   .queue([kinds])  .pause()  .resume()  .state()
//   .skip(n)   play n whole visits instantly (bot darts), then carry on live
//   .toSpin()  play every remaining visit instantly and go to the spin
import * as R from './rules.mjs';
import { NAMES, rng, phase, demoTimer, demoMembers, demoThrower, displayName, advanceThrower } from '../lib3d/kit/demo.js';

const ROUND_MS = 3000, NEXT_MS = 2500, DART_MS = 1150;
const LONG = ['Christopher & Maximilian', 'Bartholomew', 'Anastasia', 'Montgomery', 'Guinevere', 'Theodora'];
// per seat: chance to hit the aimed number, and how often a hit is a treble / double (strong → weak)
const SKILL = [[0.62, 0.13, 0.22], [0.45, 0.07, 0.15], [0.45, 0.07, 0.15], [0.28, 0.03, 0.09], [0.28, 0.03, 0.09], [0.2, 0.02, 0.06]];
const BOARD = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

export function startDemo(apply, { players = 4, speed = 1, seed, doubles = false, longNames = false, fast = false } = {}) {
    const S = seed ?? 1234;
    const Rn = rng(S), draw = R.hashDraw(S), T = demoTimer({ speed });
    const n = players;
    const g = {
        gameType: 'zerohour',
        players: Array.from({ length: n }, (_, i) => {
            const p = { id: 'p' + i, name: longNames ? LONG[i % LONG.length] : NAMES[i], avatar: null, score: 0, drops: [] };
            if (doubles) { p.members = [{ id: 'p' + i + 'a', name: NAMES[(i * 2) % 12], avatar: null }, { id: 'p' + i + 'b', name: NAMES[(i * 2 + 1) % 12], avatar: null }]; p.name = displayName(p.members); }
            return p;
        }),
        activeIdx: 0, currentRound: 1, throwsThisTurn: 0, turnDarts: [],
        isDoublesLineup: doubles, throwerIndices: Array(n).fill(0),
        phase: phase('playing'), lastThrow: null, helpVisible: false,
        zh: {
            rounds: R.ROUNDS, round: 1, hot: R.drawHot(draw, 1), hotMult: R.HOT_MULT, chip: R.CHIP, drop: R.DROP,
            commit: ('demo' + S).padEnd(64, '0'), fast, visit: { points: 0 }, cells: [], standings: [], favourite: null,
            lastVisit: null, spin: null, shootout: null, placings: null, secret: null,
        },
    };
    const ents = () => g.players.map((p) => ({ id: p.id, total: p.score || 0, drops: p.drops || [] }));
    const summary = () => { const s = R.summarise(ents()); g.zh.cells = s.cells; g.zh.standings = s.standings; g.zh.favourite = s.favourite; return s; };
    let silent = false;
    const emit = () => { if (!silent) apply(JSON.parse(JSON.stringify(g))); };
    summary();
    const script = [];
    let forced = null;

    function spec() {
        const k = forced || script.shift() || null; forced = null;
        const hot = g.zh.hot, aim = Math.max(...hot);
        switch (k) {
            case 'hot3': return { number: aim, multiplier: 3, sector: 'T' + aim };
            case 'hot': return { number: hot[1], multiplier: 1, sector: 's' + hot[1] };
            case 't20': return { number: 20, multiplier: 3, sector: 'T20' };
            case 'single': return { number: 7, multiplier: 1, sector: 's7' };
            case 'miss': return { miss: true };
            case 'bull': return { number: 'bull', multiplier: 2, sector: 'Bull' };
            default: break;
        }
        const [hit, tre, dbl] = SKILL[g.activeIdx % SKILL.length];
        if (g.zh.shootout) { const x = Rn(); return x < 0.1 ? { number: 'bull', multiplier: x < 0.03 ? 2 : 1 } : { number: BOARD[Math.floor(Rn() * 20)], multiplier: Rn() < 0.1 ? 3 : 1 }; }
        if (Rn() < hit) { const m = Rn(); return { number: aim, multiplier: m < tre ? 3 : m < tre + dbl ? 2 : 1 }; }
        const r = Rn();
        if (r < 0.12) return { miss: true };
        const i = BOARD.indexOf(aim), off = r < 0.6 ? (Rn() < 0.5 ? 1 : 19) : r < 0.8 ? (Rn() < 0.5 ? 2 : 18) : Math.floor(Rn() * 20);
        return { number: BOARD[(i + off) % 20], multiplier: 1 };
    }

    function dart() {
        if (T.stopped || g.phase.type !== 'playing') return;
        const t = spec();
        if (g.zh.shootout) return shootoutDart(t);
        if (g.throwsThisTurn >= R.DARTS) return;
        const p = g.players[g.activeIdx];
        const d = R.scoreDart(t, g.zh.hot);
        p.score += d.points;
        g.zh.visit = { points: g.zh.visit.points + d.points };
        g.throwsThisTurn++;
        g.turnDarts = [...g.turnDarts, { label: d.label, points: d.points, base: d.base, hot: d.hot }];
        g.lastThrow = { points: d.points, base: d.base, hot: d.hot, label: d.label, number: d.number, multiplier: d.multiplier, miss: d.number == null, playerId: p.id, playerName: demoThrower(g, g.activeIdx).name, sector: t.sector || null };
        if (g.throwsThisTurn < R.DARTS) { summary(); emit(); T.later(dart, DART_MS); return; }
        endVisit();
    }

    function endVisit() {
        const idx = g.activeIdx, p = g.players[idx];
        const before = R.summarise(ents().map((e) => (e.id === p.id ? { ...e, total: e.total - g.zh.visit.points } : e)));
        const drops = R.allocateVisit(draw, p.id, g.zh.round, g.zh.visit.points);
        p.drops = [...p.drops, ...drops];
        const after = summary();
        g.zh.lastVisit = {
            playerId: p.id, playerName: demoThrower(g, idx).name, round: g.zh.round, points: g.zh.visit.points,
            darts: g.turnDarts.map((x) => ({ ...x })), hotDarts: g.turnDarts.filter((x) => x.hot).length, drops,
            steals: R.stealsBetween(before.cells, after.cells, p.id), favouriteBefore: before.favourite, favourite: after.favourite,
        };
        let next = idx + 1, round = g.zh.round, wrapped = false;
        if (next >= n) { next = 0; round++; wrapped = true; }
        if (round > R.ROUNDS) { g.phase = phase('playing', { last: true }); emit(); T.later(beginSpin, R.SWEEP_MS); return; }
        if (wrapped) { g.zh.round = round; g.zh.hot = R.drawHot(draw, round); g.phase = phase('round_announce', { round, maxRounds: R.ROUNDS, isLast: round >= R.ROUNDS, title: `ROUND ${round}` }); emit(); T.later(() => intermission(next), ROUND_MS); return; }
        intermission(next);
    }

    function upNext(idx) { const st = g.zh.standings[idx] || {}; return { round: g.zh.round, hot: g.zh.hot.slice(), numbersLed: st.numbersLed || 0, chancePct: st.chancePct || 0, last: g.zh.round === R.ROUNDS }; }
    function intermission(idx, extra = null) {
        g.phase = phase('intermission', { nextPlayerIndex: idx, nextPlayerName: demoThrower(g, idx).name, ...(extra || upNext(idx)) });
        emit();
        T.later(() => advance(idx), NEXT_MS);
    }
    function advance(idx) {
        if (!g.zh.shootout) advanceThrower(g, g.activeIdx);
        g.activeIdx = idx; g.currentRound = g.zh.round; g.throwsThisTurn = 0; g.turnDarts = []; g.lastThrow = null; g.zh.visit = { points: 0 };
        g.phase = phase('playing', g.zh.shootout ? { shootout: true } : {});
        emit();
        T.later(dart, DART_MS);
    }

    function beginSpin() {
        if (ents().every((e) => !e.total)) return startShootout(g.players.map((p) => p.id), 'zero');
        const s = summary();
        const draws = R.spinDraws(draw, s.cells), pocket = draws[draws.length - 1];
        const { rows, tiedTop } = R.placingsFor(ents(), s.cells, pocket);
        const durations = R.spinDurations(draws.length - 1, fast);
        g.zh.spin = { draws, pocket, durations, startedAt: Date.now(), rows, tiedTop, margin: R.marginOf(rows), neighbours: R.neighboursOf(pocket).map((m) => ({ pocket: m, leader: s.cells[m].leader, tie: s.cells[m].tie, value: s.cells[m].value })), map: s.cells.map((c) => ({ pocket: c.pocket, leader: c.leader, tie: c.tie })) };
        g.phase = phase('spin', { draws, pocket, durations });
        emit();
        T.later(resolve, durations.total);
    }
    function resolve() {
        const sp = g.zh.spin;
        if (sp.tiedTop.length > 1) return startShootout(sp.tiedTop, 'tie');
        finish(sp.rows[0].id, 'roulette');
    }
    function startShootout(ids, reason) { g.zh.shootout = { reason, ids, round: 1, scores: {}, history: [] }; shootoutNext(ids[0]); }
    function shootoutNext(id) { const idx = g.players.findIndex((p) => p.id === id), so = g.zh.shootout; intermission(idx, { shootout: true, reason: so.reason, ids: so.ids.slice(), round: so.round }); }
    function shootoutDart(t) {
        const so = g.zh.shootout, p = g.players[g.activeIdx];
        const d = R.scoreDart(t, []), sc = R.shootoutScore(t);
        so.scores[p.id] = sc; g.throwsThisTurn = 1; g.turnDarts = [{ label: d.label, points: sc, base: sc, hot: false }];
        g.lastThrow = { points: sc, base: sc, hot: false, label: d.label, number: d.number, multiplier: d.multiplier, miss: d.number == null, playerId: p.id, playerName: demoThrower(g, g.activeIdx).name, shootout: true };
        const waiting = so.ids.filter((id) => so.scores[id] == null);
        if (waiting.length) return shootoutNext(waiting[0]);
        const best = Math.max(...so.ids.map((id) => so.scores[id])), top = so.ids.filter((id) => so.scores[id] === best);
        if (top.length > 1) { so.ids = top; so.round++; so.scores = {}; return shootoutNext(top[0]); }
        finish(top[0], 'shootout');
    }
    function finish(winnerId, reason) {
        let rows;
        if (g.zh.spin) {
            rows = g.zh.spin.rows.map((r) => ({ ...r }));
            if (reason === 'shootout') { for (const r of rows) if (r.place === 1 && r.id !== winnerId) r.place = 2; rows.sort((a, b) => (a.id === winnerId ? -1 : b.id === winnerId ? 1 : a.place - b.place)); }
        } else rows = g.players.map((p) => ({ id: p.id, place: p.id === winnerId ? 1 : 2, onPocket: 0, total: 0, pointsRank: 1 })).sort((a, b) => a.place - b.place);
        g.zh.placings = rows; g.zh.secret = 'demo';
        const w = g.players.find((p) => p.id === winnerId);
        g.phase = phase('winner', { winnerId, winnerName: displayName(demoMembers(g, g.players.indexOf(w))), reason, pocket: g.zh.spin ? g.zh.spin.pocket : null, onPocket: rows[0].onPocket, score: w.score, rounds: R.ROUNDS });
        emit();
    }

    /** play whole visits instantly (no states emitted until the end) */
    function skip(visits) {
        T.cancel(); silent = true;
        let left = visits;
        while (left > 0 && g.phase.type !== 'spin' && g.phase.type !== 'winner' && !g.zh.shootout) {
            if (g.phase.type !== 'playing') { const idx = g.phase.data.nextPlayerIndex ?? (g.activeIdx + 1) % n; advance(idx); T.cancel(); continue; }
            if (g.phase.data && g.phase.data.last) { beginSpin(); T.cancel(); break; }
            for (let k = g.throwsThisTurn; k < R.DARTS; k++) { dart(); T.cancel(); }
            left--;
        }
        silent = false; emit();
        T.later(kick, 600);
    }
    /** carry on from whatever the phase is (after a skip, or a resume whose pending step was lost while paused) */
    function kick() {
        const t = g.phase.type;
        if (t === 'playing') return g.phase.data && g.phase.data.last ? beginSpin() : dart();
        if (t === 'intermission') return advance(g.phase.data.nextPlayerIndex);
        if (t === 'round_announce') return intermission(0);
        if (t === 'spin') return T.later(resolve, Math.max(0, g.zh.spin.startedAt + g.zh.spin.durations.total - Date.now()));
    }

    emit();
    T.later(dart, 1500);
    return {
        force(kind) { forced = kind; },
        queue(kinds) { script.push(...kinds); },
        pause: () => T.pause(), resume: () => T.resume(kick), stop: () => T.stop(),
        state: () => JSON.parse(JSON.stringify(g)),
        skip,
        toSpin() { skip(1000); },
    };
}
