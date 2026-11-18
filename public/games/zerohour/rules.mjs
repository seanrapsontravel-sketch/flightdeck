// Zero Hour — the rules. ONE copy, used three ways (docs/plans/ZERO-HOUR.md §3–§5):
//   - the server engine (src/engines/zerohour.js requires this file; Node >= 22.14 loads ES modules with require)
//   - the tests (tests/zerohour-*.test.cjs) and the balance script (scripts/zerohour-balance.cjs)
//   - the TV's ?demo=1 simulator (public/games/zerohour/demo.js)
// Pure: no I/O, no clock, no Math.random. Every random choice goes through `draw(label, n)`, which returns an
// integer in [0, n) and must be a deterministic function of (match secret, label). The server's draw is an HMAC of
// the match secret; the demo's is a seeded hash. Because a label names exactly one decision ("drop:p2:3:1" is
// player p2's round-3 drop #1), re-running a visit (a correction, a restart) lands every chip where it landed before.

export const ROUNDS = 5;
export const DARTS = 3;
/** one chip = 5 points; a visit's points become chips with nothing rounded away (the last chip carries the rest) */
export const CHIP = 5;
/** chips that land together on one number (§4: on 37 numbers, 2 keeps the best player the favourite, lets 3rd/4th
 * win sometimes, and keeps re-spins on an empty pocket rare) */
export const DROP = 2;
/** a standard single-zero (European) wheel: 0 and 1–36 */
export const POCKETS = 37;
/** hot numbers: 2 a round, drawn from the double figures 10–20, the same for everyone that round; a hot dart ×3 */
export const HOT_COUNT = 2, HOT_MIN = 10, HOT_MAX = 20, HOT_MULT = 3;
/** the standard European wheel's pocket order, clockwise from the zero */
export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
/** the standard red numbers (the rest of 1–36 are black; 0 is green) */
export const REDS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
export function pocketColor(n) {
    if (n === 0) return 'green';
    return REDS.includes(n) ? 'red' : 'black';
}

/** the two hot numbers for a round, distinct, from HOT_MIN..HOT_MAX, highest first */
export function drawHot(draw, round) {
    const pool = [];
    for (let n = HOT_MIN; n <= HOT_MAX; n++) pool.push(n);
    const out = [];
    for (let i = 0; i < HOT_COUNT; i++) out.push(pool.splice(draw(`hot:${round}:${i}`, pool.length), 1)[0]);
    return out.sort((a, b) => b - a);
}

/** what a dart scores: { number, multiplier, base, points, hot, label } — base is plain darts scoring, points after hot */
export function scoreDart(spec, hot = []) {
    if (!spec || spec.miss || spec.number == null) return { number: null, multiplier: 1, base: 0, points: 0, hot: false, label: 'MISS' };
    if (spec.number === 'bull' || spec.number === 25 || spec.number === 50) {
        const inner = spec.number === 50 || Number(spec.multiplier) >= 2;
        return { number: 'bull', multiplier: inner ? 2 : 1, base: inner ? 50 : 25, points: inner ? 50 : 25, hot: false, label: inner ? 'BULL' : '25' };
    }
    const number = Number(spec.number);
    if (!Number.isInteger(number) || number < 1 || number > 20) return { number: null, multiplier: 1, base: 0, points: 0, hot: false, label: 'MISS' };
    const m = Number(spec.multiplier);
    const multiplier = m === 3 ? 3 : m === 2 ? 2 : 1;
    const base = number * multiplier;
    const isHot = hot.includes(number);
    return { number, multiplier, base, points: isHot ? base * HOT_MULT : base, hot: isHot, label: (multiplier === 3 ? 'T' : multiplier === 2 ? 'D' : 'S') + number };
}

/**
 * A visit's points as drops: whole 5-point chips grouped DROP at a time (the last group may be smaller), plus the
 * remainder (points % 5) as one small chip that lands on its own. Sum of values === points, always.
 *   [{ k, chips, v, rem }]   chips = how many chips land together, v = their value
 */
export function visitDrops(points) {
    const p = Math.max(0, Math.floor(Number(points) || 0));
    const whole = Math.floor(p / CHIP), rest = p % CHIP;
    const out = [];
    for (let k = 0, left = whole; left > 0; k++) {
        const c = Math.min(DROP, left);
        out.push({ k, chips: c, v: c * CHIP, rem: false });
        left -= c;
    }
    if (rest) out.push({ k: 'r', chips: 1, v: rest, rem: true });
    return out;
}

/** where a visit's drops land: each drop's pocket is drawn from its own label, so drop k always lands in one place */
export function allocateVisit(draw, playerId, round, points) {
    return visitDrops(points).map((d) => ({
        ...d, round,
        pocket: draw(d.rem ? `rem:${playerId}:${round}` : `drop:${playerId}:${round}:${d.k}`, POCKETS),
    }));
}

/** totals[id] and the table: cells[pocket] = { pocket, byPlayer: { id: value } } from every player's drops */
export function tableOf(players) {
    const cells = Array.from({ length: POCKETS }, (_, pocket) => ({ pocket, byPlayer: {} }));
    for (const p of players) for (const d of p.drops || []) {
        const c = cells[d.pocket];
        c.byPlayer[p.id] = (c.byPlayer[p.id] || 0) + d.v;
    }
    return cells;
}

/**
 * Who leads a cell: the most value; level on value → the higher total points; level on both → `tie` (the ids, in
 * seat order) and no leader. `order` is the seat order (ids); `totals` id → total points.
 */
export function leaderOf(cell, totals, order) {
    let best = 0, ids = [];
    for (const id of order) {
        const v = cell.byPlayer[id] || 0;
        if (v <= 0) continue;
        if (v > best) { best = v; ids = [id]; } else if (v === best) ids.push(id);
    }
    if (!ids.length) return { leader: null, tie: [], value: 0 };
    if (ids.length === 1) return { leader: ids[0], tie: [], value: best };
    const top = Math.max(...ids.map((id) => totals[id] || 0));
    const still = ids.filter((id) => (totals[id] || 0) === top);
    return still.length === 1 ? { leader: still[0], tie: [], value: best, onTotal: true } : { leader: null, tie: still, value: best };
}

/**
 * Everything the TV shows about the table, derived in one place: per cell its leader, per player how many numbers
 * they lead and their exact chance (the spin is uniform over the 37 pockets and an empty pocket re-spins, so a
 * player's chance is the share of OCCUPIED pockets they lead; a pocket tied on value and total is a shootout among
 * the tied, shared equally), and the favourite (highest chance; then total points; then seat).
 */
export function summarise(players) {
    const order = players.map((p) => p.id);
    const totals = Object.fromEntries(players.map((p) => [p.id, p.total || 0]));
    const cells = tableOf(players).map((c) => ({ ...c, ...leaderOf(c, totals, order) }));
    const occupied = cells.filter((c) => c.leader || c.tie.length).length;
    const share = Object.fromEntries(order.map((id) => [id, 0]));
    const led = Object.fromEntries(order.map((id) => [id, 0]));
    for (const c of cells) {
        if (c.leader) { share[c.leader] += 1; led[c.leader] += 1; }
        else for (const id of c.tie) share[id] += 1 / c.tie.length;
    }
    const standings = players.map((p) => ({
        id: p.id, total: p.total || 0, numbersLed: led[p.id],
        chancePct: occupied ? Math.round((share[p.id] / occupied) * 1000) / 10 : 0,
        chance: occupied ? share[p.id] / occupied : 0,
    }));
    let favourite = null;
    for (const s of standings) {
        if (!s.chance) continue;
        const f = favourite && standings.find((x) => x.id === favourite);
        if (!f || s.chance > f.chance + 1e-12 || (Math.abs(s.chance - f.chance) <= 1e-12 && s.total > f.total)) favourite = s.id;
    }
    return { cells, standings, favourite, occupied };
}

/** pockets whose leader changed to `thrower` with this visit, from someone: [{ pocket, from, to, fromValue, value }] */
export function stealsBetween(before, after, thrower) {
    const out = [];
    for (let i = 0; i < POCKETS; i++) {
        const b = before[i], a = after[i];
        const was = b.leader || null, now = a.leader || null;
        if (was && now === thrower && was !== thrower) out.push({ pocket: i, from: was, to: thrower, fromValue: b.byPlayer[was] || 0, value: a.byPlayer[thrower] || 0 });
    }
    return out;
}

/**
 * The spin: uniform draws over the 37 pockets until one holds chips (an empty pocket is announced and re-spun; the
 * chips never move). The pockets come from labels spin:0, spin:1, … — fixed for the match, independent of the chips.
 * Returns the whole sequence; the last entry is the winning pocket. Assumes at least one pocket is occupied.
 */
export function spinDraws(draw, cells, max = 400) {
    const draws = [];
    for (let n = 0; n < max; n++) {
        const pocket = draw(`spin:${n}`, POCKETS);
        draws.push(pocket);
        const c = cells[pocket];
        if (Object.values(c.byPlayer).some((v) => v > 0)) return draws;
    }
    return draws; // unreachable with any chips on the table (P(400 empties) is < 1e-4 with a single chip down)
}

/**
 * Final placings for the winning pocket: by value on it (most first), then by total points; anyone with nothing on
 * it below everyone who has something there. Exactly level players share a place. Returns
 * { rows: [{ id, place, onPocket, total, pointsRank }], tiedTop: [ids] } — tiedTop lists the players level for 1st
 * on both value and total (a shootout decides them; length <= 1 when there's a clear winner).
 */
export function placingsFor(players, cells, pocket) {
    const cell = cells[pocket];
    const byPoints = players.slice().sort((a, b) => (b.total || 0) - (a.total || 0));
    const pointsRank = {};
    byPoints.forEach((p, i) => { pointsRank[p.id] = i && (byPoints[i - 1].total || 0) === (p.total || 0) ? pointsRank[byPoints[i - 1].id] : i + 1; });
    const rows = players.map((p, seat) => ({ id: p.id, seat, onPocket: cell.byPlayer[p.id] || 0, total: p.total || 0, pointsRank: pointsRank[p.id] }));
    rows.sort((a, b) => (b.onPocket - a.onPocket) || (b.total - a.total) || (a.seat - b.seat));
    rows.forEach((r, i) => {
        const prev = rows[i - 1];
        r.place = prev && prev.onPocket === r.onPocket && prev.total === r.total ? prev.place : i + 1;
    });
    const tiedTop = rows.filter((r) => r.place === 1 && r.onPocket > 0).map((r) => r.id);
    rows.forEach((r) => delete r.seat);
    return { rows, tiedTop: tiedTop.length > 1 ? tiedTop : [] };
}

/** the margin on the winning pocket (1st's value minus 2nd's, 2nd = 0 if nobody else is there) */
export function marginOf(rows) {
    const a = rows[0]?.onPocket || 0, b = rows[1]?.onPocket || 0;
    return a - b;
}

/** the two pockets either side of `pocket` on the wheel */
export function neighboursOf(pocket) {
    const i = WHEEL_ORDER.indexOf(pocket), n = WHEEL_ORDER.length;
    return [WHEEL_ORDER[(i - 1 + n) % n], WHEEL_ORDER[(i + 1) % n]];
}

/** a shootout dart's score: face value, no hot numbers (bull 25 / 50) */
export function shootoutScore(spec) {
    return scoreDart(spec, []).base;
}

/** a small seeded draw for the demo and the balance script: (seed, label, n) → [0, n), no crypto */
export function hashDraw(seed) {
    const s = String(seed);
    return (label, n) => {
        // xmur3 → mulberry32, rejection-free for small n (bias < 1e-8 for n <= 37)
        let h = 1779033703 ^ (s.length + label.length + 1);
        const str = s + '|' + label;
        for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
        h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16;
        let t = (h >>> 0) + 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
    };
}

/** spin timings (ms) the server's `spin` phase uses and the TV animates to; fast = testing */
export function spinDurations(respins, fast = false) {
    const k = fast ? 0.4 : 1;
    const d = { pre: 6000 * k, spin: 12000 * k, respin: 6000 * k, reveal: 5000 * k };
    d.total = d.pre + d.spin + respins * d.respin + d.reveal;
    return d;
}
/** after a visit's last dart, how long the sweep plays before the final spin begins (ms) */
export const SWEEP_MS = 3500;
