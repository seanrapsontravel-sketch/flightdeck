// Where a Shanghai dart sits, from what the server says it hit (src/engines/shanghai.js lastThrow). Pure: no three.js,
// so the bed unit test can import this file on its own.
//
// lastThrow: { points, hit, label ('+16' | '7' | 'MISS' | 'BULL'), number (1..20 | 'bull' | null), multiplier,
//              targetNumber, sector ('s20' | 'S20' | 'D20' | 'T20' | '25' | 'Bull' | …) | null, shanghai? }
//   - the number and multiplier decide the bed (multiplier 3 → treble, 2 → double)
//   - a single goes in the inner or outer single by `sector` (s / S); with no sector, a seeded pick (it never changes
//     the score), weighted by the beds' areas
//   - a bull's multiplier is ALWAYS 1 in Shanghai's lastThrow, so the inner bull comes only from sector ('Bull' / '50');
//     otherwise it's drawn in the outer bull (both score 0)
//   - a miss (number null, label MISS) sits outside the doubles
import { RADII, BEDS, dartPosition, wheelIndex, wedgeAngle, SLICE, WHEEL } from '../lib3d/kit/darts.js';

/** a stable 31-bit hash: the same dart always lands in the same place, even after a reload */
export function hash(...parts) {
    let h = 2166136261;
    for (const c of parts.join('|')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return (h >>> 0) % 2147483646 + 1;
}
/** seeded Park–Miller: () → [0, 1) */
export function seeded(seed = 1) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }

/** { bed, number }: bed ∈ bull | outer_bull | single_inner | treble | single_outer | double | miss */
export function bedFor(t, key = '') {
    if (!t || t.number == null || t.label === 'MISS') return { bed: 'miss', number: null };
    const sector = typeof t.sector === 'string' ? t.sector.trim() : '';
    if (t.number === 'bull' || t.number === 25 || t.number === 50) {
        return { bed: /^(bull|50|dbull|d25)$/i.test(sector) && !/^25$/.test(sector) ? 'bull' : 'outer_bull', number: null };
    }
    const n = Number(t.number);
    if (wheelIndex(n) < 0) return { bed: 'miss', number: null };
    const m = Number(t.multiplier) || 1;
    if (m === 3 || sector[0] === 'T') return { bed: 'treble', number: n };
    if (m === 2 || sector[0] === 'D') return { bed: 'double', number: n };
    if (sector[0] === 's' || /singleinner|^inner/i.test(sector)) return { bed: 'single_inner', number: n };
    if (sector[0] === 'S' || /singleouter|^outer/i.test(sector)) return { bed: 'single_outer', number: n };
    // no sector: inner or outer by a seeded pick, weighted by area (the inner single is the bigger bed)
    const [a0, a1] = BEDS.single_inner, [b0, b1] = BEDS.single_outer;
    const ai = a1 * a1 - a0 * a0, ao = b1 * b1 - b0 * b0;
    return { bed: seeded(hash('ring', key))() * (ai + ao) < ai ? 'single_inner' : 'single_outer', number: n };
}

const SECTOR = { bull: 'Bull', outer_bull: '25', single_inner: 's', single_outer: 'S', double: 'D', treble: 'T' };
/** board-plane position (mm) for a dart, spread inside its bed by a seeded rnd: { x, y, r, a, bed, number } */
export function dartSpot(t, key = '') {
    const b = bedFor(t, key), r = seeded(hash('p', key));
    if (b.bed === 'miss') return { ...dartPosition({ miss: true }, r), bed: 'miss', number: null };
    const pre = SECTOR[b.bed];
    const spec = b.number == null ? { number: 'bull', sector: pre, multiplier: b.bed === 'bull' ? 2 : 1 }
        : { number: b.number, sector: pre + b.number, multiplier: b.bed === 'treble' ? 3 : b.bed === 'double' ? 2 : 1 };
    return dartPosition(spec, r);
}

/** the HUD's line for a dart: "T5 · +15", "S5 · +5", "7 · 0", "D12 · 0", "MISS · 0", "25 · 0", "BULL · 0" */
export function dartText(t, key = '') {
    if (!t) return '';
    const b = bedFor(t, key);
    if (b.bed === 'miss') return 'MISS · 0';
    if (b.bed === 'bull') return 'BULL · 0';
    if (b.bed === 'outer_bull') return '25 · 0';
    const m = b.bed === 'treble' ? 'T' : b.bed === 'double' ? 'D' : t.hit ? 'S' : '';
    return `${m}${b.number} · ${t.hit ? '+' + (t.points || 0) : '0'}`;
}

/** the wedge (math angle, half-width) of a number, for the live-wedge glow and the bed camera */
export const wedgeOf = (n) => ({ a: wedgeAngle(n), half: SLICE / 2 });
export { RADII, WHEEL };
