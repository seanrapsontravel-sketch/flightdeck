// Demo simulator: plays a Demolition game without a server or a dartboard, emitting the same gameData the host
// sends (see docs/plans/DEMOLITION-3D.md §3). Each lane starts at 180 and must hit exactly 0; going below 0 busts
// back to the score at the start of the visit; a checkout triggers the final round for lanes that haven't thrown;
// several checkouts in a round go to a sudden-death playoff from 60.
//   startDemo(emit, { players, speed, seed, loop }) → { stop, pause, resume, state }
const OVERLAY_EVENT_MS = 3000, NEXT_PLAYER_MS = 2500, PLAYOFF_MS = 3000;
const NAMES = ['Alice', 'Ben', 'Chloe', 'Dev', 'Ella', 'Finn'];

function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function startDemo(emit, { players = 4, speed = 1, seed = Date.now(), loop = true, dartMs = 2900 } = {}) {
    const R = rng(seed);
    let g, timer = null, stopped = false, paused = false;

    function fresh() {
        const n = Math.max(1, Math.min(6, players));
        const teams = Array.from({ length: n }, (_, i) => [{ id: 'p' + i, name: NAMES[i], avatar: '' }]);
        g = {
            gameType: 'demolition', teams, teamScores: teams.map(() => 180), activeTurnIndex: 0, dartsThrownThisTurn: 0,
            roundInitialScores: teams.map(() => 180), turnStartingScores: teams.map(() => 180),
            teamsActedThisRound: teams.map(() => false), checkedOutThisRound: teams.map(() => false),
            finishRoundMode: false, isPlayoff: false, isDoublesLineup: false, throwerIndices: teams.map(() => 0),
            helpVisible: false, lastThrow: null, phase: { type: 'playing', data: {} },
        };
    }
    const send = () => emit(JSON.parse(JSON.stringify(g)));
    const name = (i) => g.teams[i].map((p) => p.name).join(' & ');
    const later = (fn, ms) => { clearTimeout(timer); timer = setTimeout(() => { if (!stopped && !paused) fn(); }, ms / speed); };

    /** a club player: mostly singles, some doubles/trebles, the odd miss; goes for the finish when it's on */
    function pickDart(score) {
        if (score <= 40 && R() < 0.45) {
            if (score <= 20) return { number: score, multiplier: 1 };
            if (score % 2 === 0) return { number: score / 2, multiplier: 2 };
            if (score === 25 || score === 50) return { number: 25, multiplier: score === 50 ? 2 : 1 };
        }
        const r = R();
        if (r < 0.08) return { number: 0, multiplier: 0 };
        if (r < 0.11) return { number: 25, multiplier: R() < 0.3 ? 2 : 1 };
        const number = 1 + Math.floor(R() * 20);
        const multiplier = r < 0.72 ? 1 : r < 0.87 ? 2 : 3;
        return { number, multiplier };
    }

    function throwDart() {
        const a = g.activeTurnIndex, s = g.teamScores[a];
        const d = pickDart(s), value = d.number * d.multiplier;
        g.turnStartingScores = g.teamScores.slice();
        if (value > s) {
            g.teamScores[a] = g.roundInitialScores[a];
            g.lastThrow = { score: value, bust: true, checkout: false, miss: false, number: d.number, multiplier: d.multiplier };
            g.dartsThrownThisTurn++;
            g.phase = { type: 'bust', data: { teamIndex: a, teamName: name(a), avatar: '' } };
            send();
            return later(endVisit, OVERLAY_EVENT_MS);
        }
        g.teamScores[a] = s - value;
        g.dartsThrownThisTurn++;
        g.lastThrow = { score: value, bust: false, checkout: g.teamScores[a] === 0, miss: value === 0, number: d.number, multiplier: d.multiplier };
        send();
        if (g.teamScores[a] === 0) {
            g.checkedOutThisRound[a] = true;
            return later(() => { g.phase = { type: 'checkout', data: { teamIndex: a, teamName: name(a), avatar: '' } }; send(); later(() => { g.finishRoundMode = true; endVisit(); }, OVERLAY_EVENT_MS); }, 900);
        }
        if (g.dartsThrownThisTurn >= 3) return later(endVisit, Math.max(700, value * 15 + 450) + 400);
        later(throwDart, dartMs);
    }

    function endVisit() {
        const a = g.activeTurnIndex;
        g.teamsActedThisRound[a] = true;
        const n = g.teams.length;
        let next;
        if (g.finishRoundMode) {
            // final round: only the lanes after this one, which haven't thrown this round yet, get a visit
            next = -1;
            for (let j = a + 1; j < n; j++) if (!g.teamsActedThisRound[j]) { next = j; break; }
            if (next < 0) return resolve();
        } else {
            next = (a + 1) % n;
            if (next === 0) { g.teamsActedThisRound = g.teams.map(() => false); g.checkedOutThisRound = g.teams.map(() => false); }
        }
        g.phase = { type: 'intermission', data: { nextTeamIndex: next, nextTeamName: name(next), avatar: '' } };
        send();
        later(() => startVisit(next), NEXT_PLAYER_MS);
    }

    function startVisit(i) {
        g.activeTurnIndex = i; g.dartsThrownThisTurn = 0;
        g.roundInitialScores[i] = g.teamScores[i];
        g.turnStartingScores = g.teamScores.slice();
        g.phase = { type: 'playing', data: {} }; g.lastThrow = null;
        send();
        later(throwDart, dartMs * 0.8);
    }

    function resolve() {
        const winners = g.checkedOutThisRound.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
        if (winners.length === 1) {
            const w = winners[0];
            g.phase = { type: 'winner', data: { teamIndex: w, winnerName: name(w), avatar: '', members: g.teams[w].map((p) => p.name), avatars: [] } };
            send();
            if (loop) later(() => { fresh(); send(); later(throwDart, dartMs); }, 12000);
            return;
        }
        g.phase = { type: 'playoff', data: { contenderNames: winners.map(name), startScore: 60 } };
        send();
        later(() => {
            g.teams = winners.map((i) => g.teams[i]);
            const n = g.teams.length;
            Object.assign(g, {
                teamScores: Array(n).fill(60), roundInitialScores: Array(n).fill(60), turnStartingScores: Array(n).fill(60),
                teamsActedThisRound: Array(n).fill(false), checkedOutThisRound: Array(n).fill(false), throwerIndices: Array(n).fill(0),
                finishRoundMode: false, isPlayoff: true, activeTurnIndex: 0, dartsThrownThisTurn: 0, lastThrow: null,
            });
            startVisit(0);
        }, PLAYOFF_MS);
    }

    fresh(); send();
    later(throwDart, dartMs * 1.2);
    return {
        stop() { stopped = true; clearTimeout(timer); },
        pause() { paused = true; clearTimeout(timer); },
        resume() { if (!paused) return; paused = false; later(throwDart, 200); },
        state: () => g,
        /** jump a lane's score (for testing near-finish): __demolitionDemo.set(0, 32) */
        set(i, score) { g.teamScores[i] = score; g.roundInitialScores[i] = score; send(); },
    };
}
