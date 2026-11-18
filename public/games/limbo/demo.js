// Demo simulator: plays a Limbo game without a server or a dartboard, emitting the same gameData the host sends
// (src/engines/limbo.js + the limbo_* scheduler cases; docs/plans/LIMBO-3D.md §3):
//   - every player starts with 3 lives; the bar starts at 60
//   - a visit is three darts; the total must finish AT OR UNDER the bar
//   - a life is lost as soon as the total is over the bar OR the darts left can't fit (1 point each): the total is
//     clamped to the bar and hitBar set when it went over; phase life_loss for 3000 ms, then the bar resets to 60
//   - under the bar after 3 darts: the bar drops to the total (bar_status clear); exactly on it: it holds
//   - a miss scores 25; the next ALIVE player throws; one player left → winner 3000 ms after the last life_loss
//   - dart 3 (or a busting dart) arrives in the same state as its verdict phase
//
//   startDemo(emit, { players, speed, seed, doubles, dartMs, loop }) →
//     { stop, pause, resume, state, set(i, { lives, bar }), force(kind) }
import { NAMES, BOARD, rng, phase, demoTimer, demoMembers, demoThrower, displayName, advanceThrower as advanceT } from '../lib3d/kit/demo.js';

const OVERLAY_EVENT_MS = 3000;

export function startDemo(emit, { players = 4, speed = 1, seed = Date.now(), doubles = false, dartMs = 2300, loop = true } = {}) {
    const R = rng(seed);
    let g;
    const T = demoTimer({ speed }), later = T.later;
    const n = Math.max(2, Math.min(6, players));

    function fresh() {
        let k = 0;
        const person = () => { const i = k++; return { id: 'p' + i, name: NAMES[i % NAMES.length], avatar: null }; };
        if (doubles) {
            const teams = Array.from({ length: n }, () => [person(), person()]);
            g = {
                gameType: 'limbo',
                players: teams.map((m) => ({ id: m[0].id, name: m[0].name, avatar: null, members: m, lives: 3 })),
                isDoublesLineup: true, throwerIndices: teams.map(() => 0),
            };
        } else {
            g = { gameType: 'limbo', players: Array.from({ length: n }, () => ({ ...person(), lives: 3 })), isDoublesLineup: false, throwerIndices: Array(n).fill(0) };
        }
        Object.assign(g, { activeIdx: 0, currentTargetBar: 60, currentRunningTotal: 0, throwsThisTurn: 0, phase: phase('playing'), helpVisible: false, lastThrow: null });
    }
    const send = () => emit(JSON.parse(JSON.stringify(g)));

    // doubles naming, as the server's helpers do it
    const members = (i) => demoMembers(g, i);
    const thrower = (i) => demoThrower(g, i);
    const alive = () => g.players.filter((p) => p.lives > 0).length;
    function nextAlive(from) { let i = from, loops = 0; do { i = (i + 1) % g.players.length; loops++; } while (g.players[i].lives <= 0 && loops < g.players.length); return i; }
    const advanceThrower = (i) => advanceT(g, i);
    function beginTurn() { g.throwsThisTurn = 0; g.currentRunningTotal = 0; g.phase = phase('playing'); g.lastThrow = null; }

    /** a decent pub player: aims to leave room, mostly hits the bed near the aim, the odd big one, the odd miss */
    function pickDart() {
        const bar = g.currentTargetBar, left = 3 - g.throwsThisTurn, room = bar - g.currentRunningTotal - (left - 1);
        // aim at a share of the room, a little under (players get greedy at high bars, careful at low ones)
        const want = Math.max(1, Math.min(20, Math.round((room / left) * (bar > 30 ? 0.85 : 0.6))));
        const r = R();
        if (r < 0.05) return { miss: true };
        let num = want, mult = 1;
        const slip = R();
        if (slip < 0.22) { const k = BOARD.indexOf(num); num = BOARD[(k + (R() < 0.5 ? 1 : 19)) % 20]; }
        else if (slip < 0.27) { const k = BOARD.indexOf(num); num = BOARD[(k + (R() < 0.5 ? 2 : 18)) % 20]; }
        const m = R();
        if (m < 0.05) mult = 3; else if (m < 0.13) mult = 2;
        return { number: num, multiplier: mult };
    }

    function throwDart(spec) {
        if (g.phase.type !== 'playing') return;
        const p = g.players[g.activeIdx];
        if (!p || p.lives <= 0) return;
        const d = spec || pickDart();
        const score = d.miss ? 25 : d.number * d.multiplier;
        g.currentRunningTotal += score;
        g.throwsThisTurn++;
        g.lastThrow = { score, hitBar: false, lifeLost: false, miss: !!d.miss, number: d.miss ? null : d.number, multiplier: d.miss ? 1 : d.multiplier };
        const bar = g.currentTargetBar, remaining = 3 - g.throwsThisTurn;
        if (g.currentRunningTotal > bar || g.currentRunningTotal + remaining > bar) return lifeLoss(p);
        if (g.throwsThisTurn < 3) { send(); return later(throwDart, dartMs); }
        const t = thrower(g.activeIdx), nm = g.isDoublesLineup ? t.name : p.name;
        if (g.currentRunningTotal === bar) {
            g.lastThrow.matchedBar = true;
            g.phase = phase('bar_status', { playerId: p.id, playerName: nm, avatar: t.avatar || null, mode: 'hold', headline: `${nm} Matched The Bar!`, badge: `BAR HOLDS: ${bar}`, barValue: bar });
        } else {
            g.currentTargetBar = g.currentRunningTotal;
            g.phase = phase('bar_status', { playerId: p.id, playerName: nm, avatar: t.avatar || null, mode: 'clear', headline: `${nm} Cleared The Bar!`, badge: `BAR LOWERED TO: ${g.currentTargetBar}`, barValue: g.currentTargetBar });
        }
        send();
        later(afterBar, OVERLAY_EVENT_MS);
    }
    function lifeLoss(p) {
        const bar = g.currentTargetBar;
        if (g.currentRunningTotal > bar) { g.currentRunningTotal = bar; g.lastThrow.hitBar = true; }
        const livesBefore = p.lives;
        p.lives--;
        g.lastThrow.lifeLost = true;
        const t = thrower(g.activeIdx);
        g.phase = phase('life_loss', { playerId: p.id, playerName: g.isDoublesLineup ? t.name : p.name, avatar: t.avatar || null, livesBefore, eliminated: livesBefore - 1 === 0, members: members(g.activeIdx) });
        send();
        if (alive() === 1) { const w = g.players.find((x) => x.lives > 0); return later(() => winner(w), OVERLAY_EVENT_MS); }
        later(afterLifeLoss, OVERLAY_EVENT_MS);
    }
    function afterLifeLoss() { g.currentTargetBar = 60; advanceThrower(g.activeIdx); g.activeIdx = nextAlive(g.activeIdx); beginTurn(); send(); later(throwDart, dartMs + 600); }
    function afterBar() { advanceThrower(g.activeIdx); g.activeIdx = nextAlive(g.activeIdx); beginTurn(); send(); later(throwDart, dartMs + 600); }
    function winner(w) {
        const m = g.isDoublesLineup && w.members?.length ? w.members : [{ id: w.id, name: w.name, avatar: w.avatar }];
        g.phase = phase('winner', { winnerId: w.id, winnerName: displayName(m), avatar: m[0].avatar || null, members: m, avatars: m.map((x) => x.avatar || null) });
        send();
        if (loop) later(() => { fresh(); send(); later(throwDart, dartMs + 1500); }, 12000);
    }

    fresh(); send(); later(throwDart, dartMs + 1500);

    return {
        stop: T.stop,
        pause: T.pause,
        resume() { T.resume(throwDart); },
        get state() { return g; },
        /** jump a player's lives and/or the bar (for screenshots and testing) */
        set(i, { lives, bar } = {}) {
            if (lives != null && g.players[i]) g.players[i].lives = lives;
            if (bar != null) { g.currentTargetBar = bar; g.currentRunningTotal = 0; g.throwsThisTurn = 0; }
            send();
        },
        /**
         * jump straight to a moment: playing, dart, nearbar, noroom, miss, burn, out, reset, clear, hold, winner, doubles.
         * Each sets up the state just before it, then throws the darts that produce it, so the view sees real
         * transitions (as it would from the server), not a teleport.
         */
        force(kind) {
            T.cancel(); T.paused = false;
            const a = g.activeIdx, p = g.players[a];
            const darts = (list, bar) => { if (bar != null) g.currentTargetBar = bar; beginTurn(); send(); list.forEach((d, k) => setTimeout(() => throwDart(d), (k + 1) * 900 / speed)); };
            switch (kind) {
                case 'playing': beginTurn(); send(); return later(throwDart, dartMs);
                case 'dart': return darts([{ number: 7, multiplier: 1 }]);
                case 'nearbar': return darts([{ number: 9, multiplier: 1 }, { number: 8, multiplier: 1 }], 20);
                case 'noroom': return darts([{ number: 9, multiplier: 1 }], 10);
                case 'miss': return darts([{ miss: true }], 40);
                case 'burn': return darts([{ number: 19, multiplier: 3 }], 30);
                case 'out': p.lives = 1; return darts([{ number: 20, multiplier: 3 }], 20);
                case 'reset': return darts([{ number: 20, multiplier: 2 }], 12);
                case 'clear': return darts([{ number: 6, multiplier: 1 }, { number: 5, multiplier: 1 }, { number: 4, multiplier: 1 }], 24);
                case 'hold': return darts([{ number: 5, multiplier: 1 }, { number: 4, multiplier: 1 }, { number: 3, multiplier: 1 }], 12);
                case 'winner': g.players.forEach((x, i) => { x.lives = i === a ? 2 : 0; }); g.players[(a + 1) % g.players.length].lives = 1; g.activeIdx = (a + 1) % g.players.length; return darts([{ number: 20, multiplier: 3 }], 20);
                case 'doubles': doubles = true; fresh(); send(); return later(throwDart, dartMs);
            }
        },
    };
}
