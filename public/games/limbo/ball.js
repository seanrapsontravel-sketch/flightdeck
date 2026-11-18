// The limbo ball: the thrower's token. A big glossy sphere in their colour, a gold band, their avatar inset.
// Every move has a DESIGNED duration (Demolition lesson 1: never "whatever the physics gives"):
//   leap(from, to)   0.95 s  arc from the thrower's totem to the deck
//   rise(total)      0.1 s crouch + 0.48 s launch (overshoot) + settle — however far it goes
//   limbo()          1.5 s   dip, lean back, roll under the bar and out off the back of the deck into the lagoon
// Moves queue; the ball is "busy" until the queue drains. ballY(total) is the truth the ball converges to.
import * as THREE from 'three';
import { BALL_R, DECK_Y, ballY, barY, BAR_R, V, clamp01, ease, easeIn, easeOut, easeOutBack, FONT, initials } from './common.js';

function avatarTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    return { c, ctx: c.getContext('2d'), tex };
}

export class Ball {
    constructor(engine, fx) {
        this.engine = engine; this.fx = fx;
        const S = engine.scene;
        this.group = new THREE.Group(); S.add(this.group);
        this.spin = new THREE.Group(); this.group.add(this.spin);
        this.mat = new THREE.MeshPhysicalMaterial({ color: '#2BA4FF', roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.4 });
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 48, 32), this.mat);
        sphere.castShadow = true;
        const gold = new THREE.MeshStandardMaterial({ color: '#e0ad55', roughness: 0.22, metalness: 1 });
        const band = new THREE.Mesh(new THREE.TorusGeometry(BALL_R * 1.005, 0.035, 10, 64).rotateX(Math.PI / 2), gold);
        // avatar: a slightly domed inset on the front, ringed in gold
        this.av = avatarTexture();
        const capGeo = new THREE.SphereGeometry(BALL_R * 1.008, 32, 16, -0.72, 1.44, Math.PI / 2 - 0.72, 1.44);
        // remap the cap's uvs to a disc so the avatar sits square in it
        const uv = capGeo.attributes.uv, pa = capGeo.attributes.position;
        // (the patch is built facing −x: its z and y span the disc; turned to face +z afterwards)
        for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + pa.getZ(i) / (BALL_R * 1.32), 0.5 + pa.getY(i) / (BALL_R * 1.32));
        capGeo.rotateY(Math.PI / 2);
        this.capMat = new THREE.MeshStandardMaterial({ map: this.av.tex, roughness: 0.3, emissive: '#ffffff', emissiveMap: this.av.tex, emissiveIntensity: 0.3, alphaTest: 0.5, transparent: false });
        const cap = new THREE.Mesh(capGeo, this.capMat);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(BALL_R * 0.66, 0.022, 8, 48), gold); ring.position.z = BALL_R * 0.755;
        for (const o of [band, ring, cap]) o.castShadow = true;
        this.spin.add(sphere, band, cap, ring);
        this.color = new THREE.Color('#2BA4FF');
        // the hero glows a little in its own colour and spills it onto the deck around it
        // (at the centre: it can't light the ball's own outward-facing skin, only what's around it)
        this.glow = new THREE.PointLight('#2BA4FF', 4, 6, 2); this.group.add(this.glow);
        this.pos = V(0, ballY(0), 0); this.total = 0;
        this.squash = 1; this.sqV = 0; this.yaw = 0; this.roll = 0; this.rollV = 0; this.scorch = 0;
        this.tasks = []; this.task = null; this.visible = true;
        this.vel = V(); this.last = this.pos.clone();
        this.group.position.copy(this.pos);
    }

    setPlayer(color, name, avatar) {
        this.color.set(color); this.mat.color.copy(this.color);
        this.mat.emissive.copy(this.color).multiplyScalar(0.12); this.glow.color.copy(this.color);
        const { ctx, c, tex } = this.av;
        const g = ctx.createRadialGradient(128, 100, 10, 128, 128, 128); g.addColorStop(0, '#fff'); g.addColorStop(0.25, '#' + this.color.getHexString()); g.addColorStop(1, '#1a1208');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(128, 128, 126, 0, Math.PI * 2); ctx.fill();
        ctx.font = `900 150px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(initials(name), 128, 136); ctx.fillStyle = '#fff'; ctx.fillText(initials(name), 128, 136);
        tex.needsUpdate = true;
        if (avatar && /^(data:image\/(png|jpe?g|webp|gif);|\/(?!\/))/i.test(avatar)) {
            const img = new Image();
            img.onload = () => { ctx.save(); ctx.beginPath(); ctx.arc(128, 128, 120, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(img, 8, 8, 240, 240); ctx.restore(); tex.needsUpdate = true; };
            img.src = avatar;
        }
        void c;
    }

    get busy() { return !!this.task || this.tasks.length > 0; }
    queue(t) { this.tasks.push(t); return this; }
    clear() { this.tasks.length = 0; this.task = null; }

    /** jump straight to a total (forced states, snapping) */
    snap(total) { this.clear(); this.total = total; this.pos.set(0, ballY(total), 0); this.visible = true; this.roll = 0; }

    /** arc from `from` (world) to the deck spot for total 0 */
    leap(from, total = 0) {
        let a, b;
        return this.queue({
            dur: 0.95,
            start: () => { a = from.clone(); b = V(0, ballY(total), 0); this.visible = true; this.squash = 0.8; this.total = total; },
            update: (u) => {
                // along the line at an eased pace, lifted by a parabola (apex 2.4 m over the higher end)
                const e = ease(u), H = 2.4 + Math.abs(a.y - b.y) * 0.5;
                this.pos.lerpVectors(a, b, e);
                this.pos.y += 4 * e * (1 - e) * H;
                this.rollV = 9;
            },
            end: () => { this.pos.copy(b); this.kick(-1.2); this.fx && this.fx.dust(V(0, DECK_Y, 0), this.color); },
        });
    }

    /** a dart: crouch, launch to the new total with overshoot, settle. onPeak fires as it arrives. */
    rise(total, { onArrive } = {}) {
        let y0, y1;
        const crouch = 0.1, fly = 0.48;
        return this.queue({
            dur: crouch + fly,
            start: () => { y0 = this.pos.y; y1 = ballY(total); this.total = total; },
            update: (u, t) => {
                if (t < crouch) { this.squash = 1 - 0.2 * Math.sin((t / crouch) * Math.PI * 0.5); return; }
                const k = (t - crouch) / fly;
                if (this.squash < 0.95) { this.squash = 1.22; this.sqV = 0; }
                // overshoot scales a little with the jump but is capped, so a 60 still lands cleanly
                const s = 1.2 + Math.min(1.4, Math.abs(y1 - y0) * 0.35);
                this.pos.y = y0 + (y1 - y0) * easeOutBack(k, s);
                if (this.fx && k < 0.7) this.fx.trail(this.pos, this.color);
            },
            end: () => { this.pos.y = y1; this.kick(-0.8); onArrive && onArrive(); },
        });
    }

    /** the limbo: dip, lean back, roll under the bar and out into the lagoon (splash) */
    limbo({ onSplash } = {}) {
        let p0;
        const P = (u) => {
            // a smooth path in the y–z plane: dip low, glide back under the bar, off the deck edge, arc down into water
            // (u 0–.6 across the deck, then a hop off the edge and a drop into the water by u ≈ .9)
            const zEdge = -3.8, zEnd = -7.0, E = 0.6;
            const z = u < E ? THREE.MathUtils.lerp(p0.z, zEdge, ease(u / E)) : THREE.MathUtils.lerp(zEdge, zEnd, (u - E) / (1 - E));
            const low = DECK_Y + BALL_R;
            let y;
            if (u < 0.16) y = THREE.MathUtils.lerp(p0.y, low, easeOut(u / 0.16));
            else if (u < E) y = low + Math.sin(((u - 0.16) / (E - 0.16)) * Math.PI) * 0.12;
            else { const k = (u - E) / (1 - E); y = low + 1.1 * k - 3.4 * k * k; }
            return V(p0.x, y, z);
        };
        return this.queue({
            dur: 1.5,
            start: () => { p0 = this.pos.clone(); this.squash = 0.78; },
            update: (u) => {
                this.pos.copy(P(u));
                this.rollV = -8;
                if (u < 0.25) this.squash = 0.78; // leaning back, flattened
                if (this.fx && u > 0.15) this.fx.trail(this.pos, this.color);
                if (!this._splashed && this.pos.y < 0.1) { this._splashed = true; this.fx && this.fx.splash(V(this.pos.x, 0, this.pos.z), this.color); onSplash && onSplash(); }
            },
            end: () => { this._splashed = false; this.visible = false; },
        });
    }

    /** over the bar: crouch, then rocket up INTO the burning bar (0.1 + 0.3 s), onImpact at contact */
    slam(bar, { onImpact } = {}) {
        let y0, y1;
        return this.queue({
            dur: 0.4,
            start: () => { y0 = this.pos.y; y1 = barY(bar) - BAR_R - BALL_R + 0.12; this.total = bar; },
            update: (u, t) => {
                if (t < 0.1) { this.squash = 0.8; return; }
                const k = (t - 0.1) / 0.3;
                this.pos.y = y0 + (y1 - y0) * easeIn(Math.min(1, k * 1.15));
                if (this.fx) this.fx.trail(this.pos, this.color);
            },
            end: () => { this.pos.y = y1; this.squash = 0.6; onImpact && onImpact(); },
        });
    }

    /** scorched and smoking, it drops back to the deck (0.7 s, a heavy bounce) */
    fallBack() {
        let y0;
        return this.queue({
            dur: 0.7,
            start: () => { y0 = this.pos.y; this.scorch = 1; this.rollV = -3; },
            update: (u) => {
                const y1 = ballY(0), k = Math.min(1, u / 0.62);
                this.pos.y = u < 0.62 ? y0 + (y1 - y0) * easeIn(k) : y1 + Math.sin((u - 0.62) / 0.38 * Math.PI) * 0.18;
                if (this.fx && Math.random() < 0.5) this.fx.smoke(this.pos, 1, 0.5);
            },
            end: () => { this.pos.y = ballY(0); this.kick(-1); this.total = 0; },
        });
    }

    /** out: the ball cracks into lacquer shards and is gone */
    crack() {
        return this.queue({ dur: 0.15, start: () => { this.fx && this.fx.shards(this.pos, this.color); this.visible = false; }, update: () => {}, end: () => {} });
    }

    hide() { return this.queue({ dur: 0.01, start: () => { this.visible = false; }, update: () => {}, end: () => {} }); }

    /** sit on top of a totem, visible, ready to leap (the anticipation beat of a visit) */
    perch(p) {
        return this.queue({ dur: 0.25, start: () => { this.pos.copy(p); this.visible = true; this.squash = 0.5; this.rollV = 0; this.scorch = 0; }, update: () => {}, end: () => {} });
    }

    /** reappear on the deck (after a splash) with a little pop */
    pop(total = 0) {
        return this.queue({ dur: 0.3, start: () => { this.pos.set(0, ballY(total), 0); this.visible = true; this.total = total; this.squash = 0.4; }, update: () => {}, end: () => {} });
    }

    wait(dur) { return this.queue({ dur, start() {}, update() {}, end() {} }); }

    /** a squash impulse: negative = flatten then spring back */
    kick(v) { this.sqV += v * 6; }

    update(dt, camPos) {
        // run the move queue
        if (!this.task && this.tasks.length) { this.task = this.tasks.shift(); this.task.t = 0; this.task.start(); }
        if (this.task) {
            const T = this.task; T.t += dt;
            const u = clamp01(T.t / T.dur);
            T.update(u, T.t);
            if (u >= 1) { T.end(); this.task = null; }
        }
        // squash spring
        this.sqV += (1 - this.squash) * 260 * dt; this.sqV *= Math.exp(-dt * 14); this.squash += this.sqV * dt;
        const s = THREE.MathUtils.clamp(this.squash, 0.55, 1.45);
        this.vel.copy(this.pos).sub(this.last).divideScalar(Math.max(dt, 1e-4)); this.last.copy(this.pos);
        // yaw: keep the avatar turned toward the lens
        if (camPos) { const want = Math.atan2(camPos.x - this.pos.x, camPos.z - this.pos.z); let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * (1 - Math.exp(-dt * 5)); }
        this.group.visible = this.visible;
        // scorched: charred dark until the next visit
        const sc = this.scorch;
        this.mat.color.copy(this.color).multiplyScalar(1 - 0.82 * sc);
        this.mat.emissive.copy(this.color).multiplyScalar(0.12 * (1 - sc));
        this.glow.intensity = 4 * (1 - sc * 0.8);
        // squash about the bottom of the ball so it stays planted when it crouches
        this.group.position.set(this.pos.x, this.pos.y - BALL_R * (1 - s), this.pos.z);
        this.group.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
        this.group.rotation.set(0, this.yaw, 0);
        // roll while a move spins it; at rest, settle back to face-forward (the nearest whole turn)
        if (this.task && this.rollV) this.roll += this.rollV * dt;
        else { this.rollV = 0; const home = Math.round(this.roll / (Math.PI * 2)) * Math.PI * 2; this.roll += (home - this.roll) * (1 - Math.exp(-dt * 8)); }
        this.spin.rotation.x = this.roll;
    }
}
