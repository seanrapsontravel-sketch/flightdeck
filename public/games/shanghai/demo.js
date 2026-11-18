// ?demo=1 — a simulated Shanghai game with the server's own rules and windows (src/engines/shanghai.js + core.js
// scheduleRoundThenNextPlayer): dart 3 arriving with its intermission (2.5 s) or round announce (3 s), no round-1
// announce, the last visit of round 8 + 600 ms → winner or draw, and a Shanghai (single + double + treble of the
// target in one visit) → winner 900 ms later.
//   window.__shanghaiDemo.force(kind)  kind: single | double | treble | other | bull | miss | dart3 | round | final |
//                                            shanghai | winner | draw
//   .queue([kinds])  .set(i, {...})  .pause()  .resume()  .state()
import { NAMES, rng, phase, demoTimer, demoMembers, demoThrower, displayName, advanceThrower, BOARD } from '../lib3d/kit/demo.js';

const MAX = 8, ROUND_MS = 3000, NEXT_MS = 2500, WIN_MS = 900;
const LONG = ['Christopher & Maximilian', 'Bartholomew', 'Anastasia', 'Montgomery', 'Guinevere', 'Theodora'];

export function startDemo(apply, { players = 4, speed = 1, seed, doubles = false, longNames = false } = {}) {
    const R = rng(seed ?? 1234);
    const T = demoTimer({ speed });
    const n = players;
    const g = {
        gameType: 'shanghai',
        players: Array.from({ length: n }, (_, i) => {
            const name = longNames ? LONG[i % LONG.length] : NAMES[i];
            const p = { id: 'p' + i, name, avatar: null, score: 0, roundScores: Array(MAX).fill(null) };
            if (doubles) { p.members = [{ id: 'p' + i + 'a', name: NAMES[i * 2 % 12], avatar: null }, { id: 'p' + i + 'b', name: NAMES[(i * 2 + 1) % 12], avatar: null }]; p.name = displayName(p.members); }
            return p;
        }),
        activeIdx: 0, throwsThisTurn: 0, turnDarts: [], currentRound: 1,
        isDoublesLineup: doubles, throwerIndices: Array(n).fill(0),
        phase: phase('playing'), lastThrow: null, helpVisible: false,
    };
    const emit = () => apply(JSON.parse(JSON.stringify(g)));
    let forced = null;
    const script = [];

    function spec() {
        const k = forced || script.shift() || pick(); forced = null;
        const tgt = g.currentRound, other = BOARD.filter((x) => x !== tgt)[Math.floor(R() * 19)];
        switch (k) {
            case 'single': return { number: tgt, multiplier: 1, sector: (R() < 0.6 ? 's' : 'S') + tgt };
            case 'double': return { number: tgt, multiplier: 2, sector: 'D' + tgt };
            case 'treble': return { number: tgt, multiplier: 3, sector: 'T' + tgt };
            case 'bull': return R() < 0.3 ? { number: 'bull', multiplier: 2, sector: 'Bull' } : { number: 'bull', multiplier: 1, sector: '25' };
            case 'miss': return { miss: true };
            default: { const m = R() < 0.15 ? 3 : R() < 0.15 ? 2 : 1; return { number: other, multiplier: m, sector: (m === 3 ? 'T' : m === 2 ? 'D' : R() < 0.5 ? 's' : 'S') + other }; }
        }
    }
    function pick() {
        const r = R();
        return r < 0.32 ? 'single' : r < 0.42 ? 'double' : r < 0.5 ? 'treble' : r < 0.54 ? 'bull' : r < 0.64 ? 'miss' : 'other';
    }
    /** shanghaiMakeDart + handleShanghaiThrow, as the server */
    function throwDart() {
        if (g.phase.type !== 'playing' || g.throwsThisTurn >= 3) return;
        const pl = g.players[g.activeIdx], s = spec(), tgt = g.currentRound;
        let dart;
        if (s.miss || s.number === 'bull') dart = { label: s.miss ? 'MISS' : 'BULL', mult: null, points: 0, hit: false, number: s.miss ? null : 'bull', multiplier: 1 };
        else { const hit = s.number === tgt; dart = { label: String(s.number), mult: s.multiplier === 3 ? 'T' : s.multiplier === 2 ? 'D' : 'S', points: hit ? s.number * s.multiplier : 0, hit, number: s.number, multiplier: s.multiplier }; }
        g.throwsThisTurn++;
        g.turnDarts.push({ label: dart.hit ? dart.mult + dart.label : dart.label, mult: dart.hit ? dart.mult : null, points: dart.points, hit: dart.hit });
        pl.roundScores[tgt - 1] = (pl.roundScores[tgt - 1] ?? 0) + dart.points;
        pl.score += dart.points;
        g.lastThrow = { points: dart.points, hit: dart.hit, label: dart.hit ? `+${dart.points}` : dart.label, playerId: pl.id, playerName: demoThrower(g, g.activeIdx).name,
            number: dart.number, multiplier: dart.multiplier, targetNumber: tgt, sector: s.sector || null };
        afterThrow();
    }
    function isShanghai() {
        if (g.throwsThisTurn !== 3) return false;
        const m = new Set(g.turnDarts.slice(-3).filter((d) => d.hit).map((d) => d.mult));
        return m.has('S') && m.has('D') && m.has('T');
    }
    /** shanghaiContinueAfterThrow */
    function afterThrow() {
        if (isShanghai()) {
            g.shanghai = { playerId: g.players[g.activeIdx].id, round: g.currentRound }; g.lastThrow.shanghai = true;
            g.phase = phase('playing'); emit(); T.later(resolveMatch, WIN_MS); return;
        }
        if (g.throwsThisTurn < 3) { g.phase = phase('playing'); emit(); T.later(throwDart, 1000 + R() * 700); return; }
        let next = g.activeIdx + 1, round = g.currentRound, wrapped = false;
        if (next >= g.players.length) { next = 0; round++; wrapped = true; }
        if (round > MAX) { g.phase = phase('playing'); emit(); T.later(resolveMatch, 600); return; }
        if (wrapped) {
            g.phase = phase('round_announce', { gameType: 'shanghai', round, maxRounds: MAX, multiplier: 1, isLast: round >= MAX, eyebrow: 'SCROLL ROUND', subtitle: round >= MAX ? `FINAL ROUND · AIM FOR ${round}` : `AIM FOR ${round}`, tags: round >= MAX ? ['FINAL ROUND'] : [] });
            emit(); T.later(() => intermission(next, round), ROUND_MS); return;
        }
        intermission(next, round);
    }
    function intermission(next, round) {
        const th = demoThrower(g, next);
        g.phase = phase('intermission', { nextPlayerIndex: next, nextPlayerName: th.name, nextTeamName: th.name, avatar: null, targetNumber: Math.min(round, MAX) });
        emit(); T.later(advance, NEXT_MS);
    }
    function advance() {
        advanceThrower(g, g.activeIdx);
        g.throwsThisTurn = 0; g.turnDarts = []; g.activeIdx++;
        if (g.activeIdx >= g.players.length) { g.activeIdx = 0; g.currentRound++; }
        g.lastThrow = null; g.phase = phase('playing'); emit();
        T.later(throwDart, 1300);
    }
    function resolveMatch() {
        if (g.shanghai) {
            const w = g.players.find((p) => p.id === g.shanghai.playerId);
            g.phase = phase('winner', { winnerId: w.id, winnerName: w.name, avatar: null, members: demoMembers(g, g.players.indexOf(w)), reason: 'shanghai', score: w.score, rounds: g.shanghai.round, targetNumber: g.shanghai.round });
            emit(); return;
        }
        const best = Math.max(...g.players.map((p) => p.score));
        const pool = g.players.filter((p) => p.score === best);
        if (pool.length > 1) g.phase = phase('draw', { contenders: pool.map((p) => ({ id: p.id, name: p.name, avatar: null, members: demoMembers(g, g.players.indexOf(p)), score: p.score })), reason: 'score' });
        else g.phase = phase('winner', { winnerId: pool[0].id, winnerName: pool[0].name, avatar: null, members: demoMembers(g, g.players.indexOf(pool[0])), reason: 'score', score: pool[0].score, rounds: MAX });
        emit();
    }

    emit();
    T.later(throwDart, 2200);
    const api = {
        state: () => g,
        pause: () => T.pause(), resume: () => T.resume(throwDart),
        set(i, o) { Object.assign(g.players[i], o); emit(); },
        queue(kinds) { script.push(...kinds); },
        /** start round r with the first player up (review tools) */
        jump(r) { T.cancel(); g.currentRound = Math.max(1, Math.min(MAX, r)); g.activeIdx = 0; g.throwsThisTurn = 0; g.turnDarts = []; g.lastThrow = null; g.phase = phase('playing'); emit(); T.later(throwDart, 1300); },
        /** a believable table for the rounds before r: each player's round scores (multiples of the round) and totals */
        table(r) {
            g.players.forEach((p, i) => {
                p.roundScores = Array(MAX).fill(null);
                for (let k = 1; k < r; k++) p.roundScores[k - 1] = k * [0, 1, 2, 3, 1, 2, 4, 0, 1, 5][(i * 7 + k * 3) % 10];
                p.score = p.roundScores.reduce((a, v) => a + (v || 0), 0);
            });
            emit();
        },
        force(kind) {
            if (kind === 'winner' || kind === 'draw') {
                T.cancel();
                if (kind === 'draw') { g.players[0].score = 40; g.players[1].score = 40; g.players.slice(2).forEach((p) => (p.score = Math.min(p.score, 20))); }
                else g.players[0].score = Math.max(...g.players.map((p) => p.score)) + 5;
                g.currentRound = MAX; resolveMatch(); return;
            }
            if (kind === 'shanghai') {
                T.cancel(); g.throwsThisTurn = 0; g.turnDarts = []; g.phase = phase('playing'); emit();
                script.unshift('single', 'double', 'treble'); T.later(throwDart, 600); return;
            }
            if (kind === 'final' || kind === 'round') {
                T.cancel();
                if (kind === 'final') g.currentRound = MAX - 1;
                g.activeIdx = g.players.length - 1; g.throwsThisTurn = 2; g.turnDarts = g.turnDarts.slice(0, 2); g.phase = phase('playing'); emit();
                forced = 'single'; T.later(throwDart, 600); return;
            }
            if (kind === 'dart3') { T.cancel(); g.throwsThisTurn = 2; g.phase = phase('playing'); emit(); forced = 'single'; T.later(throwDart, 600); return; }
            forced = kind;
            if (g.phase.type === 'playing') { T.cancel(); T.later(throwDart, 300); }
        },
    };
    return api;
}
