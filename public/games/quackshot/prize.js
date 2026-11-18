// The prize: a won duck flying from the bull to its player's shelf. On an outer bull (+2) or double bull (+3) a rubber
// duck in the player's colour launches off the boss, spinning, on a ballistic arc, and lands in the next free slot on
// that player's prize shelf (it bounces once). The shelf only counts it when it lands, so the shelf and the HUD's duck
// count agree once everything has settled (nothing lies), and never before the duck arrives.
import * as THREE from 'three';
import { rubberDuck } from './duck.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Prizes {
    constructor(scene, fx) { this.scene = scene; this.fx = fx; this.list = []; }
    /** launch a duck from `from` to `to` (world); onLand fires once it has landed and bounced (the shelf takes over);
     *  gold = a sparkle trail */
    launch(from, to, color, { onLand, gold = false, dur = 1.25 } = {}) {
        const m = rubberDuck({ variant: 'A', lod: 1, body: color });
        m.scale.setScalar(0.2); m.position.copy(from);
        this.scene.add(m);
        const apex = Math.max(from.y, to.y) + 0.7 + from.distanceTo(to) * 0.06;   // stays under the marquee
        const rec = { m, from: from.clone(), to: to.clone(), apex, t: 0, dur, onLand, gold, landed: false, spin: 2.5 + Math.random() };
        this.list.push(rec);
        return rec;
    }
    get busy() { return this.list.length > 0; }
    /** the duck in the air (for the prize camera) */
    get flying() { return this.list.find((r) => !r.landed) || this.list[0] || null; }

    update(dt) {
        for (let i = this.list.length - 1; i >= 0; i--) {
            const r = this.list[i]; r.t += dt;
            const u = Math.min(1, r.t / r.dur);
            if (!r.landed) {
                // a parabola through `apex`, horizontal progress eased a little at the end
                const p = r.from.clone().lerp(r.to, u);
                const h0 = r.from.y, h1 = r.to.y, H = r.apex;
                p.y = (1 - u) * (1 - u) * h0 + 2 * (1 - u) * u * (2 * H - (h0 + h1) / 2) + u * u * h1;
                r.m.position.copy(p);
                r.m.rotation.set(Math.sin(u * 9) * 0.3, u * Math.PI * 2 * r.spin, Math.sin(u * 7) * 0.4);
                if (r.gold && this.fx && Math.random() < 0.8) this.fx.trail(p);
                if (u >= 1) { r.landed = true; r.t = 0; r.m.rotation.set(0, -Math.PI / 2 + 0.5, 0); }
            } else {
                // one bounce on the shelf, then hand over to the shelf's own instance
                const b = r.t / 0.3;
                r.m.position.y = r.to.y + Math.sin(Math.min(1, b) * Math.PI) * 0.12;
                if (b >= 1) { this.scene.remove(r.m); r.m.material.dispose(); this.list.splice(i, 1); if (r.onLand) r.onLand(r); }
            }
        }
    }
}
