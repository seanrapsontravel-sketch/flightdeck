// Zero Hour — shared scene constants (docs/plans/ZERO-HOUR.md §6–§8). Units are metres; the felt's top is y = 0.
//
// The layout is the standard single-zero betting layout: the zero is a tall cell at the wheel end, then twelve
// columns of three, 1-2-3 in the first column … 34-35-36 in the last, with the 3-6-9 … 36 row farthest from the
// players (the near row is 1-4-7 … 34). Each cell has six stack spots in a 3 × 2 grid, always in seat order (seat 1
// far-left … seat 6 near-right), so a player's chips sit in the same spot in every cell.
import * as THREE from 'three';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const ease = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
export const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- the layout
export const POCKETS = 37;
export const CELL_W = 0.16, CELL_D = 0.14;    // a numbered cell: 16 × 14 cm
export const COLS = 12, ROWS = 3;
export const ZERO_W = 0.16;                   // the zero's cell is a column wide and spans all three rows
export const LAYOUT_X0 = -0.84;               // left edge of the zero cell (the layout is centred on x = 0.2)
export const LAYOUT_Z0 = -CELL_D * ROWS / 2;  // far edge of the layout
export const LAYOUT_W = ZERO_W + COLS * CELL_W, LAYOUT_D = ROWS * CELL_D;
export const CHIP_R = 0.021, CHIP_H = 0.0036; // a 42 mm chip, 3.6 mm thick
export const STACK_CAP = 48;                  // chips drawn one by one per stack; the value is always in the DOM

/** a cell's rectangle on the felt: { x0, z0, x1, z1, cx, cz, w, d } */
export function cellRect(n) {
    if (n === 0) return rect(LAYOUT_X0, LAYOUT_Z0, LAYOUT_X0 + ZERO_W, LAYOUT_Z0 + LAYOUT_D);
    const col = Math.floor((n - 1) / 3), row = 2 - ((n - 1) % 3); // row 0 = the far row (3, 6, 9 …)
    const x0 = LAYOUT_X0 + ZERO_W + col * CELL_W, z0 = LAYOUT_Z0 + row * CELL_D;
    return rect(x0, z0, x0 + CELL_W, z0 + CELL_D);
}
function rect(x0, z0, x1, z1) { return { x0, z0, x1, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 }; }

/**
 * where seat s (0–5) stacks its chips in cell n. The cell's number is printed in its far band, so the spots use the
 * near two thirds; the zero's tall cell spreads its spots down its length.
 */
export function stackSpot(n, seat) {
    const r = cellRect(n);
    if (n === 0) {
        const col = seat % 2, row = Math.floor(seat / 2);
        return V(r.x0 + r.w * (0.3 + 0.4 * col), 0, r.z0 + r.d * (0.36 + 0.22 * row));
    }
    const col = seat % 3, row = Math.floor(seat / 3);
    return V(r.x0 + r.w * (0.2 + 0.3 * col), 0, r.z0 + r.d * (0.5 + 0.3 * row));
}

/** where a seat's cashier tray sits on the near rail (the sweep starts here) */
export function trayAt(seat, n) {
    const span = LAYOUT_W * 0.86, x = LAYOUT_X0 + LAYOUT_W * 0.07 + (n <= 1 ? span / 2 : (span * seat) / (n - 1));
    return V(x, 0.012, LAYOUT_Z0 + LAYOUT_D + 0.13);
}

// ---------------------------------------------------------------- the wheel and the wall
export const WHEEL_C = V(-1.27, 0, -0.02);    // the wheel's centre, at the layout's zero end (as on a real table)
export const WHEEL_R = 0.36;                  // bowl rim radius
export const BOARD_C = V(0.2, 0.98, -1.0);    // the dartboard on the salon wall behind the table, facing +z
export const BOARD_R = 0.2;                   // its double ring (a big board, so it reads in the master)

// ---------------------------------------------------------------- colours
export const GOLD = '#e7b85a', GOLD_HOT = '#ffcf6a', IVORY = '#efe6d2', FELT = '#0d5a3c';
// six player colours chosen to read on emerald felt and stay clear of the hot gold and the wheel's red/black/green;
// the seat glyph on every chip (1–6 pips) is the second cue for colour blindness
export const SEAT_COLORS = ['#e8edf2', '#2f6fe0', '#d8323c', '#8a4fe0', '#f08a24', '#23b8c8'];
export const SEAT_NAMES = ['ivory', 'cobalt', 'scarlet', 'violet', 'tangerine', 'teal'];
export const seatColor = (i) => SEAT_COLORS[((i % 6) + 6) % 6];

/** a canvas texture */
export function canvasTex(w, h, draw, { srgb = true } = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
}

/** a seeded random in [0, 1) from any string (stable per chip key) */
export function hash01(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
}

export const DISPLAY_FONT = '"Didot", "Bodoni 72", "Bodoni MT", "Playfair Display", "Times New Roman", serif';
export const SANS_FONT = '"Avenir Next", "Gill Sans", "Helvetica Neue", Arial, sans-serif';
