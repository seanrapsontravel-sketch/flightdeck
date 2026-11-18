// Pieces every ?demo=1 simulator shares (lifted from Limbo's demo.js). A simulator emits the same gameData the host
// sends, on timers, so the view sees real transitions.
//   const T = demoTimer({ speed });  T.later(fn, ms)  T.pause()  T.resume(fallback)  T.stop()
export const NAMES = ['Alice', 'Ben', 'Chloe', 'Dev', 'Ella', 'Finn', 'Gus', 'Hana', 'Ivo', 'Jess', 'Kai', 'Lola'];
export const BOARD = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

/** seeded LCG: `const R = rng(seed); R()` → [0, 1) */
export function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** a phase envelope, as core.js makePhase */
export const phase = (type, data = {}) => ({ type, startedAt: Date.now(), data });

/** one pending timer at a time, scaled by speed; pausable */
export function demoTimer({ speed = 1 } = {}) {
    let timer = null, pending = null;
    const T = {
        stopped: false, paused: false, speed,
        get pending() { return pending; },
        later(fn, ms) { clearTimeout(timer); pending = fn; timer = setTimeout(() => { pending = null; if (!T.stopped && !T.paused) fn(); }, ms / T.speed); },
        cancel() { clearTimeout(timer); },
        stop() { T.stopped = true; clearTimeout(timer); },
        pause() { T.paused = true; clearTimeout(timer); },
        resume(fallback) { T.paused = false; if (pending) T.later(pending, 300); else if (fallback) T.later(fallback, 300); },
    };
    return T;
}

/** server-style doubles naming over a demo's own state */
export const demoMembers = (g, i) => (g.isDoublesLineup && g.players[i].members?.length ? g.players[i].members : [{ id: g.players[i].id, name: g.players[i].name, avatar: g.players[i].avatar }]);
export const demoThrower = (g, i) => { const m = demoMembers(g, i); return m[(g.throwerIndices[i] || 0) % m.length]; };
export const displayName = (m) => m.map((x) => x.name).join(' & ');
export function advanceThrower(g, i) { if (!g.isDoublesLineup) return; const m = demoMembers(g, i); if (m.length > 1) g.throwerIndices[i] = (g.throwerIndices[i] + 1) % m.length; }
