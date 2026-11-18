// Camera direction. Shots are written in a tower's own frame (x across its face, z toward the yard's front) so the
// same framing works for any lane. Damping, trauma shake, the occlusion fallback and the rubble clearance live in
// lib3d/director.js; here: the shots, the towers as occluders, and pushing the lens out of tower volumes.
import { ShotDirector, V, ease, noise1 } from '../lib3d/director.js';

const FALLBACK = { strike2: 'strike', strike: 'hero', hero: 'wide', low: 'hero', close: 'hero', checkout: 'wide' };
const APERTURE = { establish: 0.22, wide: 0.28, hero: 0.75, low: 0.55, close: 1.5, strike: 0.5, strike2: 0.6, checkout: 0.3, crane: 0.35 };

export class Director extends ShotDirector {
    constructor(camera, ctx) {
        super(camera, {
            fallback: FALLBACK, aperture: APERTURE,
            // ride over rubble: stay clear above any debris near the lens
            clearance: { r: 2.5, lift: 1.3, items: () => (ctx.world ? ctx.world.bodies : []) },
        });
        this.ctx = ctx;
    }

    /** other towers block a shot of the subject (towers as cylinders, checked in plan) */
    occluders(p) {
        const subject = p.tower ?? this.ctx.towers[this.ctx.active ?? 0];
        return this.ctx.towers.filter((T) => T !== subject).map((T) => ({ x: T.group.position.x, z: T.group.position.z, r: 3.2, top: T.topY() + 0.6 }));
    }

    /** tower-local point → world */
    tw(T, x, y, z) { return V(x, y, z).applyMatrix4(T.group.matrixWorld); }

    compute() {
        const s = this.shot, p = s.p, t = s.t, c = this.clock, C = this.ctx;
        const T = p.tower ?? C.towers[C.active ?? 0];
        const hand = V(noise1(c * 0.5) * 0.12, noise1(c * 0.43 + 9) * 0.08, noise1(c * 0.37 + 3) * 0.1);
        switch (s.name) {
            case 'establish': {
                // slow crane: drifting sideways while descending and pushing in
                const u = ease(Math.min(t, 6) / 6), a = -0.42 + u * 0.3;
                return { pos: V(Math.sin(a) * (50 - u * 8), 17 - u * 6, Math.cos(a) * (50 - u * 8) - 6), look: V(0, 7 - u, -6), fov: 36, k: 3 };
            }
            case 'wide':
                return { pos: V(0, 8.5, 34).add(hand), look: V(0, 7, -5), fov: 40, k: 2 };
            case 'hero': {
                const top = T.topY(), a = 0.38 - Math.min(t, 12) * 0.012;
                return { pos: this.tw(T, Math.sin(a) * 15, 3.4 + top * 0.12, Math.cos(a) * 15).add(hand), look: this.tw(T, 0, top * 0.55, 0), fov: 36, k: 2.2, focus: T };
            }
            case 'low': {
                const top = T.topY();
                return { pos: this.tw(T, -3.4, 0.45, 8.2 - ease(t / 8) * 0.8).add(hand.multiplyScalar(0.5)), look: this.tw(T, 0.6, top * 0.62, 0), fov: 46, k: 2.5, focus: T };
            }
            case 'close': {
                const top = T.topY();
                // above the top floor, looking across it (and its crown) at the corner
                return { pos: this.tw(T, 3.8 - t * 0.12, top + 1.1, 4.6).add(hand.multiplyScalar(0.4)), look: this.tw(T, 0.6, top - 0.5, 0.4), fov: 32, k: 2.5, focusPt: this.tw(T, 1.2, top - 0.3, 1.2) };
            }
            case 'strike': {
                // from the front-left, across the tower top toward the ball coming in from the right
                const y = p.y ?? T.topY() - 0.5;
                return { pos: this.tw(T, -8, y + 1.6, 12.5).add(hand), look: this.tw(T, 2.2, y + 0.9, 0), fov: 43, k: 4, focus: T };
            }
            case 'strike2': {
                // low on the right-front: the ball comes in past the lens and through the top of the tower
                const y = p.y ?? T.topY() - 0.5;
                return { pos: this.tw(T, 11.5, y - 2.4, 11.5).add(hand), look: this.tw(T, 0.4, y + 1.6, 0), fov: 46, k: 4, focus: T };
            }
            case 'checkout': {
                // elevated, a little off-axis: the emptied plinth, the rubble and the fireworks above
                const a = 0.25 + t * 0.03;
                return { pos: this.tw(T, Math.sin(a) * 17, 7.5, Math.cos(a) * 17), look: this.tw(T, 0, 3.2 + Math.min(t, 3) * 1.2, 0), fov: 42, k: 2, focus: T };
            }
            case 'crane':
                return { pos: V(9, 2, 4), look: V(0, 22, -15), fov: 44, k: 2 };
        }
        return { pos: this.pos.clone(), look: this.look.clone(), fov: this.fov, k: 2 };
    }

    /** keep the camera out of tower volumes (plus a margin) */
    avoid(p) {
        for (const T of this.ctx.towers) {
            const l = p.clone().applyMatrix4(T.inv);
            const top = T.topY() + 1.2;
            if (l.y > top) continue;
            const hx = 3.4, hz = 2.9;
            if (Math.abs(l.x) < hx && Math.abs(l.z) < hz) {
                if (hx - Math.abs(l.x) < hz - Math.abs(l.z)) l.x = Math.sign(l.x || 1) * hx; else l.z = Math.sign(l.z || 1) * hz;
                p.copy(l.applyMatrix4(T.group.matrixWorld));
            }
        }
    }

    /** focus: a point, or the tower (at the look height) for character shots, or the look point */
    focusDistance(w) {
        if (w.focusPt) return this.pos.distanceTo(w.focusPt);
        if (w.focus) return this.pos.distanceTo(w.focus.group.position.clone().setY(this.look.y));
        return this.pos.distanceTo(this.look);
    }
}
