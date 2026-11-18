// ?demo=1 — a simulated Quackshot game with the server's own rules and windows (src/engines/quackshot.js +
// core.js scheduleRoundThenNextPlayer), so the view sees real transitions: overlay phases held 4.41 s, the dart-3
// inner single arriving with its intermission, round announce 3 s, intermission 2.5 s, the last visit + 600 ms → winner
// or draw.
//   window.__quackshotDemo.force(kind)  kind: parade | bull | dbull | fire | splash | miss | dart3 | round | final |
//                                             winner | draw
//   .queue([kinds])  .set(i, { score, bullseyes })  .pause()  .resume()  .state()
import { NAMES, rng, phase, demoTimer, demoMembers, demoThrower, displayName, advanceThrower, BOARD } from '../lib3d/kit/demo.js';

const MAX = 6, OVERLAY_MS = 1260 + 150 + 3000, ROUND_MS = 3000, NEXT_MS = 2500;
const LONG = ['Christopher & Maximilian', 'Bartholomew', 'Anastasia', 'Montgomery', 'Guinevere', 'Theodora'];

export function startDemo(apply, { players = 4, speed = 1, seed, doubles = false, longNames = false } = {}) {
    const R = rng(seed ?? 1234);
    const T = demoTimer({ speed });
    const n = players;
    const g = {
        gameType: 'quackshot',
        players: Array.from({ length: n }, (_, i) => {
            const name = longNames ? LONG[i % LONG.length] : NAMES[i];
            const p = { id: 'p' + i, name, avatar: null, score: 0, bullseyes: 0 };
            if (doubles) { p.members = [{ id: 'p' + i + 'a', name: NAMES[i * 2 % 12], avatar: null }, { id: 'p' + i + 'b', name: NAMES[(i * 2 + 1) % 12], avatar: null }]; p.name = displayName(p.members); }
            return p;
        }),
        activeIdx: 0, throwsThisTurn: 0, currentRound: 1,
        isDoublesLineup: doubles, throwerIndices: Array(n).fill(0),
        phase: phase('playing'), lastThrow: null, helpVisible: false,
    };
    const emit = () => apply(JSON.parse(JSON.stringify(g)));
    let forced = null;
    const script = [];   // queued forced darts (api.queue)

    function spec() {
        const k = forced || script.shift() || pick(); forced = null;
        const num = BOARD[Math.floor(R() * 20)];
        switch (k) {
            case 'dbull': return { number: 'bull', multiplier: 2, sector: 'Bull' };
            case 'bull': return { number: 'bull', multiplier: 1, sector: '25' };
            case 'fire': return { number: num, multiplier: 3, sector: 'T' + num };
            case 'splash': return R() < 0.3 ? { number: num, multiplier: 2, sector: 'D' + num } : { number: num, multiplier: 1, sector: 'S' + num };
            case 'miss': return { miss: true };
            default: return { number: num, multiplier: 1, sector: 's' + num };
        }
    }
    function pick() {
        const r = R();
        return r < 0.04 ? 'dbull' : r < 0.11 ? 'bull' : r < 0.22 ? 'fire' : r < 0.42 ? 'splash' : r < 0.5 ? 'miss' : 'parade';
    }
    /** resolveQuackshotHit, as the server */
    function resolve(s) {
        if (s.miss) return { zone: 'miss', points: -1, bullseye: false, label: '−1', title: 'Splash!' };
        if (s.sector === 'Bull') return { zone: 'double_bull', points: 3, bullseye: true, label: '+3', title: 'Double Bullseye!' };
        if (s.sector === '25') return { zone: 'bull', points: 2, bullseye: true, label: '+2', title: 'Outer Bull!' };
        if (/^s\d/.test(s.sector)) return { zone: 'inner_single', points: 1, bullseye: false, label: '+1', title: null };
        if (s.multiplier === 3) return { zone: 'triple', points: -2, bullseye: false, label: '−2', title: 'Ring of Fire!' };
        return { zone: 'board', points: -1, bullseye: false, label: '−1', title: 'Splash!' };
    }

    function throwDart() {
        if (g.phase.type !== 'playing') return;
        const pl = g.players[g.activeIdx], s = spec(), hit = resolve(s);
        const mult = g.currentRound >= MAX ? 2 : 1, pts = hit.points * mult;
        g.throwsThisTurn++;
        pl.score += pts; if (hit.bullseye) pl.bullseyes++;
        const label = mult > 1 ? `${hit.label} ×2` : hit.label;
        g.lastThrow = { points: pts, basePoints: hit.points, roundMultiplier: mult, zone: hit.zone, label, bullseye: hit.bullseye, playerId: pl.id, playerName: pl.name,
            number: s.miss ? (hit.bullseye ? 'bull' : null) : s.number, multiplier: s.miss ? 1 : s.multiplier, sector: s.sector || null };
        const d = { playerName: pl.name, avatar: null, zone: hit.zone, points: pts, label, title: hit.title };
        if (hit.bullseye) { g.phase = phase('bullseye', { ...d, bullseyes: pl.bullseyes, winning: false }); emit(); T.later(afterThrow, OVERLAY_MS); return; }
        if (hit.zone === 'triple') { g.phase = phase('zone_hit', d); emit(); T.later(afterThrow, OVERLAY_MS); return; }
        if (hit.zone === 'board' || hit.zone === 'miss') { g.phase = phase('splash', d); emit(); T.later(afterThrow, OVERLAY_MS); return; }
        afterThrow(true);
    }
    /** quackshotContinueAfterThrow */
    function afterThrow(sameState = false) {
        if (g.throwsThisTurn < 3) { g.phase = phase('playing'); emit(); T.later(throwDart, 1100 + R() * 700); return; }
        let next = g.activeIdx + 1, round = g.currentRound, wrapped = false;
        if (next >= g.players.length) { next = 0; round++; wrapped = true; }
        if (round > MAX) { g.phase = phase('playing'); emit(); T.later(resolveMatch, 600); return; }
        if (wrapped) {
            g.phase = phase('round_announce', { gameType: 'quackshot', round, maxRounds: MAX, multiplier: round >= MAX ? 2 : 1, isLast: round >= MAX, eyebrow: 'CARNIVAL ROUND', title: `ROUND ${round}`, tags: round >= MAX ? ['FINAL ROUND', 'DOUBLE POINTS'] : [], subtitle: round >= MAX ? 'FINAL ROUND · DOUBLE POINTS' : '' });
            emit(); T.later(() => intermission(next), ROUND_MS); return;
        }
        intermission(next);
        void sameState;
    }
    function intermission(next) {
        const th = demoThrower(g, next);
        g.phase = phase('intermission', { nextPlayerIndex: next, nextPlayerName: th.name, nextTeamName: th.name, avatar: null });
        emit(); T.later(advance, NEXT_MS);
    }
    function advance() {
        advanceThrower(g, g.activeIdx);
        g.throwsThisTurn = 0; g.activeIdx++;
        if (g.activeIdx >= g.players.length) { g.activeIdx = 0; g.currentRound++; }
        g.lastThrow = null; g.phase = phase('playing'); emit();
        T.later(throwDart, 1300);
    }
    function resolveMatch() {
        const best = Math.max(...g.players.map((p) => p.score));
        const pool = g.players.filter((p) => p.score === best);
        if (pool.length > 1) g.phase = phase('draw', { contenders: pool.map((p) => ({ id: p.id, name: p.name, avatar: null, members: demoMembers(g, g.players.indexOf(p)), score: p.score })), reason: 'score' });
        else g.phase = phase('winner', { winnerId: pool[0].id, winnerName: pool[0].name, avatar: null, members: demoMembers(g, g.players.indexOf(pool[0])), reason: 'score' });
        emit();
    }

    emit();
    T.later(throwDart, 2200);
    const api = {
        state: () => g,
        pause: () => T.pause(), resume: () => T.resume(throwDart),
        set(i, o) { Object.assign(g.players[i], o); emit(); },
        /** the next darts, in order: e.g. queue(['parade', 'bull', 'splash']) */
        queue(kinds) { script.push(...kinds); },
        force(kind) {
            if (kind === 'winner' || kind === 'draw') {
                T.cancel();
                if (kind === 'draw') { g.players[0].score = 9; g.players[1].score = 9; g.players.slice(2).forEach((p) => (p.score = Math.min(p.score, 4))); }
                else g.players[0].score = Math.max(...g.players.map((p) => p.score)) + 3;
                g.currentRound = MAX; resolveMatch(); return;
            }
            if (kind === 'final' || kind === 'round') {
                T.cancel();
                if (kind === 'final') g.currentRound = MAX - 1;
                g.activeIdx = g.players.length - 1; g.throwsThisTurn = 2; g.phase = phase('playing'); emit();
                forced = 'parade'; T.later(throwDart, 600); return;
            }
            if (kind === 'dart3') { T.cancel(); g.throwsThisTurn = 2; g.phase = phase('playing'); emit(); forced = 'parade'; T.later(throwDart, 600); return; }
            forced = kind;
            if (g.phase.type === 'playing') { T.cancel(); T.later(throwDart, 300); }
        },
    };
    return api;
}
