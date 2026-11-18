// Dartboard geometry: where a dart sits on a regulation board, from what the server says it hit. Shared by any 3D
// darts game (Killer's floor board first). Units are millimetres on a real board; scale to the scene by R / 170.
//
// Board plane: x to the right, y up toward the 20. Numbers run clockwise from the 20 at the top
// (DARTBOARD_WHEEL, as src/engines/core.js). Each wedge is 18°.
//
// What the server says (lastThrow): number (1..20, 'bull' or null), multiplier (dart × round in Killer, so use
// dartMultiplier when there is one), miss, and sometimes sector: 's20' inner single, 'S20' outer single, 'D20',
// 'T20', '25' / '50' / 'Bull' / 'bull'. With no sector a single goes in the inner or outer single bed by `rnd`.
export const WHEEL = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
export const SLICE = Math.PI / 10; // 18°

/** regulation radii, mm from the centre (the wire centres) */
export const RADII = { bull: 6.35, outerBull: 15.9, trebleIn: 99, trebleOut: 107, doubleIn: 162, doubleOut: 170, missOut: 200 };

/** the radial range of each bed, with the wire thickness kept clear so a dart never sits on a wire */
const WIRE = 1.2;
export const BEDS = {
    bull: [0, RADII.bull - WIRE],
    outer_bull: [RADII.bull + WIRE, RADII.outerBull - WIRE],
    single_inner: [RADII.outerBull + WIRE, RADII.trebleIn - WIRE],
    treble: [RADII.trebleIn + WIRE, RADII.trebleOut - WIRE],
    single_outer: [RADII.trebleOut + WIRE, RADII.doubleIn - WIRE],
    double: [RADII.doubleIn + WIRE, RADII.doubleOut - WIRE],
    miss: [RADII.doubleOut + 6, RADII.missOut - 4],
};

/** wheel index of a number (−1 if it isn't one) */
export const wheelIndex = (n) => WHEEL.indexOf(Number(n));
/** a number's wedge centre as a math angle (radians from +x, counter-clockwise): the 20 is at +π/2 */
export const wedgeAngle = (n) => Math.PI / 2 - wheelIndex(n) * SLICE;
/** the number whose wedge contains math angle a */
export function numberAt(a) {
    const cw = Math.PI / 2 - a; // clockwise from the top
    const k = Math.round(cw / SLICE);
    return WHEEL[((k % 20) + 20) % 20];
}

/** which bed a lastThrow-shaped dart landed in: { bed, number } (number null for bulls and misses) */
export function bedOf(t) {
    if (!t || t.miss || t.number == null) return { bed: 'miss', number: null };
    const sector = typeof t.sector === 'string' ? t.sector.trim() : '';
    const dm = Number(t.dartMultiplier ?? t.multiplier) || 1;
    if (t.number === 'bull' || t.number === 25 || t.number === 50 || /^(bull|25|50)$/i.test(sector)) {
        const inner = sector === '50' || sector === 'Bull' || (!/^(bull|25)$/.test(sector) && dm >= 2);
        return { bed: inner ? 'bull' : 'outer_bull', number: null };
    }
    const n = Number(t.number);
    if (wheelIndex(n) < 0) return { bed: 'miss', number: null };
    if (dm === 3 || sector[0] === 'T') return { bed: 'treble', number: n };
    if (dm === 2 || sector[0] === 'D') return { bed: 'double', number: n };
    if (sector[0] === 's') return { bed: 'single_inner', number: n };
    if (sector[0] === 'S') return { bed: 'single_outer', number: n };
    return { bed: null, number: n }; // a single with no sector: inner or outer, the caller's rnd decides
}

/**
 * Where on the board a dart sits: { x, y, r, a, bed, number } in mm (board plane). `rnd` () → [0,1) spreads darts
 * inside their bed (angle within the wedge, radius within the bed) so three darts in one bed don't stack.
 * Misses land in the dark ring outside the doubles, at a random angle.
 */
export function dartPosition(t, rnd = Math.random) {
    let { bed, number } = bedOf(t);
    if (bed === null) {
        // the inner single is the bigger bed: weight by area
        const [a0, a1] = BEDS.single_inner, [b0, b1] = BEDS.single_outer;
        const ai = a1 * a1 - a0 * a0, ao = b1 * b1 - b0 * b0;
        bed = rnd() * (ai + ao) < ai ? 'single_inner' : 'single_outer';
    }
    const [r0, r1] = BEDS[bed];
    // uniform over the bed's area, kept a little off its wires
    const m = Math.min(2, (r1 - r0) * 0.15);
    const lo = r0 + m, hi = Math.max(lo, r1 - m);
    const r = Math.sqrt(lo * lo + rnd() * (hi * hi - lo * lo));
    let a;
    if (number != null) {
        // angular margin: keep the dart's shaft clear of the radial wires (1.5 mm of arc at its radius, at least 1.5°)
        const half = SLICE / 2 - Math.max(0.026, 1.5 / Math.max(r, 1));
        a = wedgeAngle(number) + (rnd() * 2 - 1) * Math.max(0, half);
    } else a = rnd() * Math.PI * 2;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, r, a, bed, number };
}

/** the bed and number at a board-plane point (mm): the inverse of dartPosition, for tests */
export function hitAt(x, y) {
    const r = Math.hypot(x, y);
    if (r <= RADII.bull) return { bed: 'bull', number: null };
    if (r <= RADII.outerBull) return { bed: 'outer_bull', number: null };
    if (r > RADII.doubleOut) return { bed: 'miss', number: null };
    const number = numberAt(Math.atan2(y, x));
    const bed = r < RADII.trebleIn ? 'single_inner' : r <= RADII.trebleOut ? 'treble' : r < RADII.doubleIn ? 'single_outer' : 'double';
    return { bed, number };
}
