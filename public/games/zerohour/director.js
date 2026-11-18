// Zero Hour's cameras (docs/plans/ZERO-HOUR.md §8.2), on the kit's ShotDirector. The camera rests on the master
// during ordinary play; it moves for a hot dart (the board), the spin (table → wheel → ball → the winning cell) and
// the winner.
//   master — the table's long side: the whole layout and the wheel at its zero end (the board is in the porthole)
//   board  — the dartboard, for a hot dart
//   visit  — the thrower's tray and the near half of the table
//   table  — the pre-spin wide: every cell's leader colour, "ALL BETS ARE DOWN"
//   wheel  — the wheel's hero angle; ball — following the ball; cell — a number's stacks (the reveal, the winner)
import * as THREE from 'three';
import { ShotDirector, V } from '../lib3d/director.js';
import { LAYOUT_X0, LAYOUT_W, LAYOUT_Z0, LAYOUT_D, WHEEL_C, BOARD_C, cellRect, trayAt } from './common.js';

const MID_X = (WHEEL_C.x - 0.36 + LAYOUT_X0 + LAYOUT_W) / 2; // the middle of wheel + layout

export class Director extends ShotDirector {
    constructor(camera, { wheel, board }) {
        super(camera, { apertureDefault: 0.06, floor: 0.08, shake: { x: 0.01, y: 0.008, z: 0.005, roll: 0.004 }, start: { shot: 'master' } });
        this.wheel = wheel; this.board = board;
        this.aspect = camera.aspect || 16 / 9;
        this.nPlayers = 4;
        this.aperture = { master: 0.04, table: 0.04, wheel: 0.14, ball: 0.22, cell: 0.18, board: 0.1, visit: 0.12 };
    }

    compute() {
        const s = this.shot, p = s.p || {}, t = s.t;
        const drift = (a) => Math.sin(this.clock * 0.13) * a;
        switch (s.name) {
            case 'board': {
                return { pos: V(BOARD_C.x + 0.08, BOARD_C.y + 0.02, BOARD_C.z + 1.05), look: V(BOARD_C.x, BOARD_C.y - 0.01, BOARD_C.z), fov: 30, k: 3.2, focusPt: BOARD_C.clone() };
            }
            case 'visit': {
                const tr = trayAt(p.seat || 0, this.nPlayers);
                return { pos: V(tr.x * 0.7 + MID_X * 0.3, 0.62, tr.z + 0.95), look: V(tr.x * 0.6 + 0.2 * 0.4, 0.0, LAYOUT_Z0 + LAYOUT_D * 0.4), fov: 36, k: 2.2 };
            }
            case 'table': {
                return { pos: V(MID_X + drift(0.08), 2.35, 1.55), look: V(MID_X, -0.05, -0.08), fov: 42, k: 0.9 };
            }
            case 'wheel': {
                const c = this.wheel.centre(), a = 0.9 + t * 0.05;
                return { pos: V(c.x + Math.cos(a) * 0.78, 0.5, c.z + Math.sin(a) * 0.78), look: V(c.x, 0.03, c.z), fov: 34, k: 1.6, focusPt: c };
            }
            case 'ball': {
                const c = this.wheel.centre(), b = this.wheel.ballWorld();
                const dir = V(b.x - c.x, 0, b.z - c.z).normalize();
                // over the ball's shoulder from outside the wheel, a little ahead of it
                const side = V(-dir.z, 0, dir.x);
                const pos = V(c.x, 0, c.z).addScaledVector(dir, 0.55).addScaledVector(side, -0.12).setY(0.3);
                return { pos, look: V(b.x, b.y, b.z).lerp(c, 0.35), fov: 30, k: 2.4, focusPt: b };
            }
            case 'cell': {
                const r = cellRect(p.n || 0);
                return { pos: V(r.cx + 0.05, 0.42, r.cz + 0.5), look: V(r.cx, 0.02, r.cz), fov: 34, k: 1.5, focusPt: V(r.cx, 0.02, r.cz) };
            }
            case 'master':
            default: {
                // the whole layout and the wheel from high on the long side (the board is in the porthole inset)
                const look = V(MID_X + 0.05, -0.08, -0.06);
                const pos = V(MID_X + 0.05 + drift(0.02), 1.78, 1.42);
                const fov = this.aspect < 1.6 ? 46 : 39;
                return { pos, look, fov, k: 1.8 };
            }
        }
    }
}
