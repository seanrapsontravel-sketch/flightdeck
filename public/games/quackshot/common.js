// Shared constants and helpers for 3D Quackshot ("Duck Row").
//
// The target stands upright at the back of the stall, its face in the z = 0 plane facing the counter (+z), centred
// at (0, BOARD_Y, 0); board-plane (x, y) mm → world (x·MM, BOARD_Y + y·MM, 0). The double ring's outer wire (170 mm
// on a real board) sits at BOARD_R metres; the bulb-lit number ring runs out to RIM_R.
//
// Pure helpers (no three.js) live at the top so the bed unit test can import this file on its own.
import { RADII, dartPosition, wheelIndex, WHEEL } from '../lib3d/kit/darts.js';

export const BOARD_R = 2.0;                      // m: the double ring's outer edge
export const RIM_R = 2.5;                        // m: the number ring's outer edge
export const MM = BOARD_R / RADII.doubleOut;     // metres per real-board millimetre
export const BOARD_Y = 3.9;                     // m: the bull's height
export const COUNTER_Z = 5.4, COUNTER_TOP = 1.1; // the counter's front edge and top
export const FLIGHT_S = 0.34;                    // a dart's flight from the station to the board
export const FLASH_S = 1.41;                     // the 2D page's bed flash + tail: the 3D reaction owns this, then the card
export const CARD_S = 2.85;                      // the title card, inside the server's 3 s
export const MAX_ROUNDS = 6;

export const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
export function rng(seed = 1) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }
/** a stable 31-bit hash of strings/numbers: the same dart always lands in the same place, even after a reload */
export function hash(...parts) {
    let h = 2166136261;
    for (const c of parts.join('|')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return (h >>> 0) % 2147483646 + 1;
}

/** round → multiplier (src/engines/quackshot.js quackshotRoundMultiplier) */
export const roundMult = (r) => ((r || 1) >= MAX_ROUNDS ? 2 : 1);

/**
 * Which bed a Quackshot dart sits in, from what the server SCORED (lastThrow.zone) — not from a guess. The zone is the
 * truth; the number comes from lastThrow.number when it has one. Mapping (src/engines/quackshot.js resolveQuackshotHit):
 *   double_bull → bull · bull → outer_bull · inner_single → single_inner · triple → treble
 *   board → double (×2 or a D sector) else single_outer (a single with no sector is scored outer, so drawn outer)
 *   miss → the surround outside the doubles
 * A bot's random throw has a zone but no number: the number is picked from `key` (player, round, dart) so a reload
 * shows the same picture. Returns { bed, number }.
 */
export function bedFor(t, key = '') {
    const zone = t && t.zone;
    if (!zone || zone === 'miss') return { bed: 'miss', number: null };
    if (zone === 'double_bull') return { bed: 'bull', number: null };
    if (zone === 'bull') return { bed: 'outer_bull', number: null };
    let n = Number(t.number);
    if (wheelIndex(n) < 0) n = WHEEL[hash('n', key) % 20];
    if (zone === 'inner_single') return { bed: 'single_inner', number: n };
    if (zone === 'triple') return { bed: 'treble', number: n };
    const sector = typeof t.sector === 'string' ? t.sector : '';
    const dbl = Number(t.multiplier) === 2 || sector[0] === 'D';
    return { bed: dbl ? 'double' : 'single_outer', number: n };
}

const SECTOR = { bull: 'Bull', outer_bull: '25', single_inner: 's', single_outer: 'S', double: 'D', treble: 'T' };
/** board-plane position (mm) for a dart: its bed from bedFor, spread inside the bed by a seeded rnd */
export function dartSpot(t, key = '') {
    const b = bedFor(t, key);
    const r = rng(hash('p', key));
    if (b.bed === 'miss') return { ...dartPosition({ miss: true }, r), bed: 'miss', number: null };
    const pre = SECTOR[b.bed];
    const spec = b.number == null ? { number: 'bull', sector: pre, multiplier: b.bed === 'bull' ? 2 : 1 }
        : { number: b.number, sector: pre + b.number, multiplier: b.bed === 'treble' ? 3 : b.bed === 'double' ? 2 : 1 };
    return dartPosition(spec, r);
}

/** the scoring zone a bed belongs to (the inverse direction, for tests and the HUD) */
export const zoneOfBed = (bed) => ({ bull: 'double_bull', outer_bull: 'bull', single_inner: 'inner_single', treble: 'triple', single_outer: 'board', double: 'board', miss: 'miss' }[bed]);

/** the HUD's short label for a dart: "s17 · +1", "T5 · −2", "BULL · +3", "MISS · −1" */
export function dartText(t, key = '') {
    if (!t) return '';
    const b = bedFor(t, key);
    const where = b.bed === 'bull' ? 'BULL' : b.bed === 'outer_bull' ? '25' : b.bed === 'miss' ? 'MISS'
        : (b.bed === 'single_inner' ? 's' : b.bed === 'single_outer' ? 'S' : b.bed === 'double' ? 'D' : 'T') + b.number;
    return `${where} · ${t.label || ''}`;
}

// ---------------------------------------------------------------- colours, type
export const PALETTE = ['#FF3B4E', '#2BA4FF', '#FFB400', '#2FD27A', '#B45CFF', '#FF7A1A', '#00C9C9', '#FF4FB4'];
export const teamColor = (i) => ((typeof window !== 'undefined' && window.FC_PLAYER_COLORS && window.FC_PLAYER_COLORS[i % 8]) || PALETTE[i % 8]);
export const GOLD = '#ffc94a', CREAM = '#f4ead2', CANDY = '#d3212f', SEA = '#1f8fc0', FIRE = '#ff7a1a';
export const FONT = '"Avenir Next Condensed","DIN Condensed","Roboto Condensed","Arial Narrow",Arial,sans-serif';
