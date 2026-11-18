// Demo simulator: plays a Killer game without a server or a dartboard, emitting the same gameData the host sends.
// A port of src/engines/killer.js (handleKillerThrow, resolve, intermission) and the killer_* scheduler cases in
// src/engines/index.js, with the server's timings (docs/plans/KILLER-3D.md §3):
//   - a mark/strike with an overlay phase holds count × 900 + 150 ms (the wedge animation) + 3000 ms
//     (with video mode on: became 5500, death 5500, lost 5200 instead of the 3000)
//   - dart 3 with no overlay: 600 ms → intermission chain: round_announce 3000 (if the round wraps) → intermission 2500
//   - death → after_elimination: playing; one left → 900 ms → winner; after round 12 → resolve (winner or draw)
//
//   startDemo(emit, { players, speed, seed, doubles, video, dartMs, loop }) →
//     { stop, pause, resume, state, set(i, {...}), force(kind) }
import { NAMES, BOARD, rng, phase, demoTimer, demoMembers, demoThrower, displayName, advanceThrower } from '../lib3d/kit/demo.js';

const OVERLAY = 3000, ROUND_MS = 3000, NEXT_MS = 2500, WEDGE_MS = 900, WEDGE_TAIL = 150, MAX_ROUNDS = 12;
const VIDEO = { became_killer: 5500, death: 5500, lost_killer: 5200 };
const BOOST_QUIPS = ['Double Tap!', 'Marked Cold!', 'Closing In!', 'Dead Eye!', 'On Target!'];
const KNOCK_QUIPS = ['Cut Deep!', 'Bleed Out!', 'Wounded!', 'Hit Confirmed!', 'Softened Up!'];
export const roundMultiplier = (r) => { r = Math.min(Math.max(r || 1, 1), MAX_ROUNDS); return r >= 10 ? 3 : r >= 7 ? 2 : 1; };

/** core.js generateDegreeSpacedTargets with a seeded offset */
function targets(count, R) {
    const out = [], used = new Set(), slot = 360 / count, offset = R() * 360;
    const mid = (wi) => wi * 18, dist = (a, b) => { const d = Math.abs(((a - b) % 360 + 360) % 360); return Math.min(d, 360 - d); };
    for (let i = 0; i < count; i++) {
        const want = ((i * slot + offset) % 360 + 360) % 360;
        let best = -1, bd = Infinity;
        for (let wi = 0; wi < 20; wi++) { if (used.has(wi)) continue; const d = dist(mid(wi), want); if (d < bd) { bd = d; best = wi; } }
        used.add(best); out.push(BOARD[best]);
    }
    return out;
}

export function startDemo(emit, { players = 4, speed = 1, seed = Date.now(), doubles = false, video = false, dartMs = 2100, loop = true, longNames = false } = {}) {
    const R = rng(seed);
    const T = demoTimer({ speed }), later = T.later;
    const n = Math.max(2, Math.min(6, players));
    let g;
    const LONG = ['Christopher & Maximilian', 'Alexandra Montgomery', 'Bartholomew', 'Evangeline St. Clair', 'Fitzgerald-Smythe', 'Wilhelmina'];

    function fresh() {
        let k = 0;
        const person = () => { const i = k++; return { id: 'p' + i, name: longNames ? LONG[i % LONG.length] : NAMES[i % NAMES.length], avatar: null }; };
        const tg = targets(n, R);
        const base = (i) => ({ targetNumber: tg[i], lives: 3, killerMarks: 0, isKiller: false });
        if (doubles) {
            const teams = Array.from({ length: n }, () => [person(), person()]);
            g = { gameType: 'killer', players: teams.map((m, i) => ({ id: m[0].id, name: displayName(m), avatar: null, members: m, ...base(i) })), isDoublesLineup: true, throwerIndices: teams.map(() => 0) };
        } else {
            g = { gameType: 'killer', players: Array.from({ length: n }, (_, i) => ({ ...person(), ...base(i) })), isDoublesLineup: false, throwerIndices: Array(n).fill(0) };
        }
        Object.assign(g, { activeIdx: 0, throwsThisTurn: 0, currentRound: 1, phase: phase('playing'), helpVisible: false, lastThrow: null });
    }
    const send = () => emit(JSON.parse(JSON.stringify(g)));
    const alive = () => g.players.filter((p) => p.lives >= 0);
    function nextAlive(from) { let i = from, loops = 0; do { i = (i + 1) % g.players.length; loops++; } while (g.players[i].lives < 0 && loops < g.players.length); return i; }

    /** a decent pub player: aims at their own number (or, as a killer, a living rival's); mostly hits near it */
    function pickDart() {
        const p = g.players[g.activeIdx];
        let aim = p.targetNumber;
        if (p.isKiller) { const rivals = g.players.filter((o, i) => i !== g.activeIdx && o.lives >= 0); if (rivals.length) aim = rivals[Math.floor(R() * rivals.length)].targetNumber; }
        const r = R();
        if (r < 0.1) return { miss: true };
        if (r < 0.13) return { number: 'bull', multiplier: R() < 0.3 ? 2 : 1, sector: R() < 0.3 ? '50' : '25' };
        let num = aim;
        const slip = R();
        const k = BOARD.indexOf(aim);
        if (slip < 0.3) num = BOARD[(k + (R() < 0.5 ? 1 : 19)) % 20];
        else if (slip < 0.36) num = BOARD[Math.floor(R() * 20)];
        const m = R();
        const mult = m < 0.07 ? 3 : m < 0.17 ? 2 : 1;
        return { number: num, multiplier: mult, sector: mult === 3 ? 'T' + num : mult === 2 ? 'D' + num : (R() < 0.6 ? 's' : 'S') + num };
    }

    function wedgeWait() {
        const l = g.lastThrow; if (!l) return 0;
        let c = 0;
        if (l.effect === 'mark') c = (l.markSegments || []).length; else if (l.effect === 'strike') c = (l.strikeSegments || []).length;
        return c > 0 ? c * WEDGE_MS + WEDGE_TAIL : 0;
    }
    const overlay = (type) => wedgeWait() + (video && VIDEO[type] ? VIDEO[type] : OVERLAY);
    function checkWinner() { const a = alive(); if (a.length === 1) { winner(a[0]); return true; } return false; }

    // ---------------------------------------------------------------- handleKillerThrow
    function throwDart(spec) {
        if (g.phase.type !== 'playing') return;
        const player = g.players[g.activeIdx];
        if (!player || player.lives < 0) return;
        const d = spec || pickDart();
        g.throwsThisTurn++;
        const hitNumber = d.miss || d.number === 'bull' ? null : d.number;
        const dm = d.miss ? 1 : d.multiplier, rm = roundMultiplier(g.currentRound), mult = dm * rm;
        g.lastThrow = { hitNumber, effect: 'miss', miss: hitNumber === null && d.number !== 'bull', number: d.miss ? null : d.number, multiplier: mult, dartMultiplier: dm, roundMultiplier: rm };
        if (d.sector) g.lastThrow.sector = d.sector;
        let became = false, lost = false, eliminated = false, victim = null, gained = 0, lostMarks = 0;
        if (hitNumber !== null && !player.isKiller && hitNumber === player.targetNumber) {
            const before = player.killerMarks;
            player.killerMarks = Math.min(3, player.killerMarks + mult);
            gained = player.killerMarks - before;
            const segs = []; for (let s = before; s < player.killerMarks; s++) segs.push(s);
            Object.assign(g.lastThrow, { effect: 'mark', playerId: player.id, markSegments: segs });
            if (player.killerMarks >= 3) { player.isKiller = true; player.lives = player.killerMarks; became = true; }
        } else if (hitNumber !== null && player.isKiller) {
            victim = g.players.find((p) => p.id !== player.id && p.lives >= 0 && p.targetNumber === hitNumber);
            if (victim) {
                const segs = [], wasKiller = !!victim.isKiller;
                if (victim.isKiller) {
                    const lb = victim.lives;
                    victim.lives -= mult; lostMarks = Math.min(lb, mult);
                    const fb = Math.max(0, Math.min(3, lb)), fa = Math.max(0, Math.min(3, victim.lives));
                    for (let s = fb - 1; s >= fa; s--) segs.push(s);
                    if (victim.lives >= 0 && victim.lives < 3) { victim.isKiller = false; victim.killerMarks = Math.max(0, victim.lives); lost = wasKiller; }
                } else if (victim.killerMarks > 0) {
                    const mb = victim.killerMarks;
                    victim.killerMarks = Math.max(0, victim.killerMarks - mult); lostMarks = mb - victim.killerMarks;
                    for (let s = mb - 1; s >= victim.killerMarks; s--) segs.push(s);
                    if (mult > mb) { victim.killerMarks = 0; victim.lives = -1; } else victim.lives = victim.killerMarks;
                } else victim.lives = -1;
                eliminated = victim.lives < 0;
                Object.assign(g.lastThrow, { effect: 'strike', victimId: victim.id, strikeSegments: segs, strikeSegment: segs.length ? segs[0] : null });
            }
        }
        const t = demoThrower(g, g.activeIdx);
        if (became) {
            g.phase = phase('became_killer', { playerId: player.id, playerName: player.name, avatar: player.avatar, targetNumber: player.targetNumber });
            if (checkWinner()) return;
            send(); return later(afterOverlay, overlay('became_killer'));
        }
        if (eliminated && victim) {
            g.phase = phase('death', { attackerId: player.id, attackerName: player.name, victimId: victim.id, victimName: victim.name, victimAvatar: victim.avatar, hitNumber });
            send(); return later(afterElimination, overlay('death'));
        }
        if (lost && victim) {
            g.phase = phase('lost_killer', { playerId: victim.id, playerName: victim.name, avatar: victim.avatar, attackerName: player.name, targetNumber: victim.targetNumber, livesRemaining: victim.lives });
            if (checkWinner()) return;
            send(); return later(afterOverlay, overlay('lost_killer'));
        }
        if (dm >= 2 && g.lastThrow.effect === 'mark' && gained > 0) {
            g.phase = phase('mult_boost', { playerName: player.name, avatar: player.avatar, multiplier: dm, steps: gained, quip: BOOST_QUIPS[Math.floor(R() * 5)], targetNumber: player.targetNumber });
            send(); return later(afterOverlay, overlay('mult_boost'));
        }
        if (dm >= 2 && g.lastThrow.effect === 'strike' && victim) {
            g.phase = phase('mult_knock', { playerName: victim.name, avatar: victim.avatar, actorName: player.name, multiplier: dm, steps: Math.max(1, lostMarks), quip: KNOCK_QUIPS[Math.floor(R() * 5)], targetNumber: victim.targetNumber });
            if (checkWinner()) return;
            send(); return later(afterOverlay, overlay('mult_knock'));
        }
        if (checkWinner()) return;
        void t;
        send();
        if (g.throwsThisTurn >= 3) return later(showIntermission, 600);
        later(throwDart, dartMs);
    }
    function afterOverlay() {
        if (g.throwsThisTurn >= 3) return showIntermission();
        g.phase = phase('playing'); send(); later(throwDart, dartMs);
    }
    function afterElimination() {
        g.phase = phase('playing'); g.lastThrow = null; send();
        if (alive().length === 1) return later(() => { checkWinner(); }, 900);
        if (g.throwsThisTurn >= 3) return later(showIntermission, 400);
        later(throwDart, dartMs);
    }
    function roundInfo(r) {
        const m = roundMultiplier(r), isLast = r >= MAX_ROUNDS, tags = [];
        if (isLast) tags.push('FINAL ROUND');
        if (m === 2) tags.push('DOUBLE MARKS'); if (m === 3) tags.push('TRIPLE DAMAGE');
        return { gameType: 'killer', round: r, maxRounds: MAX_ROUNDS, multiplier: m, isLast, eyebrow: 'CONTRACT ROUND', title: `ROUND ${r}`, subtitle: tags.join(' · '), tags };
    }
    function showIntermission() {
        const next = nextAlive(g.activeIdx), wrapping = next <= g.activeIdx;
        if (wrapping && g.currentRound >= MAX_ROUNDS) return resolve();
        const bump = wrapping && g.currentRound < MAX_ROUNDS, nextRound = g.currentRound + (bump ? 1 : 0);
        if (next === g.activeIdx) {
            if (bump) { g.phase = phase('round_announce', roundInfo(nextRound)); send(); return later(advanceTurn, ROUND_MS); }
            return advanceTurn();
        }
        const intermission = () => {
            const t = demoThrower(g, next);
            g.phase = phase('intermission', { nextPlayerIndex: next, nextPlayerName: t.name, nextTeamName: t.name, avatar: t.avatar || null, targetNumber: g.players[next].targetNumber });
            send(); later(advanceTurn, NEXT_MS);
        };
        if (bump) { g.phase = phase('round_announce', roundInfo(nextRound)); send(); return later(intermission, ROUND_MS); }
        intermission();
    }
    function advanceTurn() {
        g.throwsThisTurn = 0;
        const prev = g.activeIdx;
        advanceThrower(g, prev);
        g.activeIdx = nextAlive(g.activeIdx);
        if (g.activeIdx <= prev && g.currentRound < MAX_ROUNDS) g.currentRound++;
        g.lastThrow = null; g.phase = phase('playing'); send();
        later(throwDart, dartMs + 400);
    }
    const contender = (p) => { const m = demoMembers(g, g.players.indexOf(p)); return { id: p.id, name: displayName(m), avatar: m[0]?.avatar || null, members: m, score: 0 }; };
    function winner(w, extra = {}) {
        const m = demoMembers(g, g.players.indexOf(w));
        g.phase = phase('winner', { winnerId: w.id, winnerName: displayName(m), avatar: m[0].avatar || null, members: m, avatars: m.map((x) => x.avatar || null), ...extra });
        send();
        if (loop) later(() => { fresh(); send(); later(throwDart, dartMs + 1500); }, 14000);
    }
    function draw(list, reason, extra = {}) {
        g.phase = phase('draw', { contenders: list.map(contender), reason, ...extra });
        send();
        if (loop) later(() => { fresh(); send(); later(throwDart, dartMs + 1500); }, 14000);
    }
    const wedges = (p) => (!p || p.lives < 0 ? 0 : p.isKiller ? 3 : Math.min(3, p.killerMarks || 0));
    function resolve() {
        const a = alive();
        if (a.length === 1) return winner(a[0], { reason: 'last_standing' });
        if (!a.length) return draw([], 'rounds');
        const killers = a.filter((p) => p.isKiller);
        if (killers.length === 1) return winner(killers[0], { reason: 'sole_killer' });
        if (killers.length > 1) return draw(killers, 'killers');
        const best = Math.max(...a.map(wedges)), top = a.filter((p) => wedges(p) === best);
        if (top.length === 1) return winner(top[0], { reason: 'wedges', wedges: best });
        draw(top, 'wedges', { wedges: best });
    }

    fresh(); send(); later(throwDart, dartMs + 1800);

    return {
        stop: T.stop, pause: T.pause, resume() { T.resume(throwDart); },
        get state() { return g; },
        /** jump a player's marks/lives/killer status, or the round (for screenshots and testing) */
        set(i, o = {}) {
            const p = g.players[i];
            if (p) for (const k of ['lives', 'killerMarks', 'isKiller']) if (o[k] != null) p[k] = o[k];
            if (o.round != null) g.currentRound = o.round;
            send();
        },
        /**
         * jump to a moment: mark, boost, became, strike, knock, lost, death, miss, bull, round, winner, draw, doubles.
         * Each sets up the state just before it and throws the darts that produce it, so the view sees real
         * transitions (as it would from the server), not a teleport.
         */
        force(kind) {
            T.cancel(); T.paused = false;
            const a = g.activeIdx, p = g.players[a], o = g.players[(a + 1) % g.players.length];
            const begin = () => { g.throwsThisTurn = 0; g.lastThrow = null; g.phase = phase('playing'); };
            const darts = (list) => { begin(); send(); list.forEach((d, k) => setTimeout(() => throwDart(d), (k + 1) * 900 / speed)); };
            const own = (m = 1, s = 's') => ({ number: p.targetNumber, multiplier: m, sector: (m === 3 ? 'T' : m === 2 ? 'D' : s) + p.targetNumber });
            const at = (q, m = 1) => ({ number: q.targetNumber, multiplier: m, sector: (m === 3 ? 'T' : m === 2 ? 'D' : 'S') + q.targetNumber });
            const killer = () => { p.isKiller = true; p.lives = 3; p.killerMarks = 3; };
            switch (kind) {
                case 'mark': p.isKiller = false; p.killerMarks = 0; p.lives = 3; return darts([own(1)]);
                case 'boost': p.isKiller = false; p.killerMarks = 0; p.lives = 3; return darts([own(2)]);
                case 'became': p.isKiller = false; p.killerMarks = 2; p.lives = 3; return darts([own(1)]);
                case 'strike': killer(); o.isKiller = false; o.killerMarks = 3; o.lives = 3; if (o.lives < 0) o.lives = 3; return darts([at(o, 1)]);
                case 'knock': killer(); o.isKiller = false; o.killerMarks = 3; o.lives = 3; return darts([at(o, 2)]);
                case 'lost': killer(); o.isKiller = true; o.killerMarks = 3; o.lives = 3; return darts([at(o, 1)]);
                case 'death': killer(); o.isKiller = false; o.killerMarks = 1; o.lives = 1; return darts([at(o, 2)]);
                case 'miss': return darts([{ miss: true }, { number: 'bull', multiplier: 2, sector: '50' }]);
                case 'bull': return darts([{ number: 'bull', multiplier: 1, sector: '25' }]);
                case 'round': g.throwsThisTurn = 3; g.activeIdx = g.players.length - 1; while (g.players[g.activeIdx].lives < 0) g.activeIdx--; return showIntermission();
                case 'winner': g.players.forEach((x, i) => { if (i !== a && i !== (a + 1) % g.players.length) { x.lives = -1; } }); killer(); o.isKiller = false; o.killerMarks = 0; o.lives = 0; return darts([at(o, 1)]);
                case 'draw': {
                    g.players.forEach((x, i) => { if (i > 1) x.lives = -1; else { x.isKiller = true; x.lives = 3; x.killerMarks = 3; } });
                    g.currentRound = MAX_ROUNDS; g.activeIdx = 1; g.throwsThisTurn = 3; g.lastThrow = null; g.phase = phase('playing'); send();
                    return later(showIntermission, 600);
                }
                case 'doubles': doubles = true; fresh(); send(); return later(throwDart, dartMs);
                case 'visit': {
                    // the look-dev visit: a mark that makes a killer, a strike, then the kill — each dart thrown once
                    // the previous verdict's window has passed (as the server would allow)
                    p.isKiller = false; p.killerMarks = 2; p.lives = 3; o.isKiller = false; o.killerMarks = 1; o.lives = 1;
                    begin(); send();
                    const at3 = [[1200, own(1)], [6200, at(o, 1)], [9000, at(o, 1)]];
                    at3.forEach(([ms, d]) => setTimeout(() => throwDart(d), ms / speed));
                    return;
                }
            }
        },
    };
}
