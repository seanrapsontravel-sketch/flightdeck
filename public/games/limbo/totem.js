// A player's totem on the sand: a stone plinth, a 2.5 m carved stack lacquered in the team colour (gold trims, eyes
// that glow in the team colour), an avatar shield on top, a carved name sign that lights up when it's their throw,
// and three tiki torches in front: their lives.
import * as THREE from 'three';
import { merge, V, FONT, initials, rng } from './common.js';
import { torchGeometry, woodMaterial } from './beach.js';
import { FireLight } from './fire.js';

const TIER = [0.72, 1.0, 0.82];
export const TOTEM_H = 0.5 + TIER.reduce((a, b) => a + b, 0);

/** an octagonal drum, slightly barrel-shaped, so the lacquer catches long highlights */
function drum(rB, rT, h, y0, bulge = 0.05) {
    const g = new THREE.CylinderGeometry(rT, rB, h, 8, 4).rotateY(Math.PI / 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
        const v = (p.getY(i) + h / 2) / h, k = 1 + bulge * Math.sin(Math.PI * v);
        p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    return g.translate(0, y0 + h / 2, 0).toNonIndexed();
}

/**
 * A stylised tiki totem in three drums: a grinning base, a big face, and a fierce head under a feather fan.
 * Parts by material: lac (team lacquer), gold (trims, eye rims, ear plugs), dark (recesses), bone (teeth, eye
 * whites), eyes (emissive pupils in the team colour).
 */
function totemGeometry() {
    const lac = [], gold = [], dark = [], bone = [], eyes = [];
    const box = (w, h, d, x, y, z, list, rz = 0, rx = 0) => list.push(new THREE.BoxGeometry(w, h, d).rotateX(rx).rotateZ(rz).translate(x, y, z).toNonIndexed());
    const ring = (r, y, list, h = 0.08) => list.push(new THREE.CylinderGeometry(r, r, h, 8).rotateY(Math.PI / 8).translate(0, y, 0).toNonIndexed());
    const almond = (x, y, z, w, h, list, rz = 0) => list.push(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(w, h, 0.05).rotateZ(rz).translate(x, y, z).toNonIndexed());
    const disc = (r, x, y, z, list, d = 0.05) => list.push(new THREE.CylinderGeometry(r, r, d, 16).rotateX(Math.PI / 2).translate(x, y, z).toNonIndexed());
    let y = 0.5;
    // ---- base: wide grin full of teeth, gold zigzag band
    const [h0, h1, h2] = TIER;
    lac.push(drum(0.6, 0.54, h0, y, 0.04));
    ring(0.62, y + 0.04, gold); ring(0.58, y + h0 - 0.03, gold, 0.06);
    {
        const fz = 0.56, my = y + 0.36;
        box(0.78, 0.26, 0.08, 0, my, fz, dark);
        for (let k = -4; k <= 4; k++) box(0.07, 0.09, 0.05, k * 0.085, my + 0.075, fz + 0.04, bone);
        for (let k = -3; k <= 3; k++) box(0.07, 0.08, 0.05, k * 0.085 + 0.04, my - 0.08, fz + 0.04, bone);
        box(0.88, 0.07, 0.07, 0, my + 0.17, fz + 0.02, lac); box(0.88, 0.07, 0.07, 0, my - 0.17, fz + 0.02, lac);
    }
    y += h0;
    // ---- face: heavy brow, big almond eyes ringed in gold, broad nose, pursed mouth, ear plugs
    lac.push(drum(0.5, 0.47, h1, y, 0.07));
    ring(0.53, y + h1 - 0.03, gold, 0.06);
    {
        const fz = 0.5, ey = y + 0.64;
        box(0.84, 0.12, 0.26, 0, ey + 0.15, fz - 0.06, lac, 0, -0.2);
        for (const s of [-1, 1]) {
            almond(s * 0.2, ey, fz + 0.02, 0.17, 0.11, gold, s * -0.15);
            almond(s * 0.2, ey, fz + 0.05, 0.13, 0.08, bone, s * -0.15);
            disc(0.045, s * 0.2, ey - 0.005, fz + 0.09, eyes, 0.03);
            disc(0.11, s * 0.55, ey - 0.05, 0, gold, 0.06); // ear plugs, on the sides
        }
        lac.push(new THREE.CylinderGeometry(0.06, 0.15, 0.32, 4).rotateY(Math.PI / 4).scale(1.2, 1, 0.7).translate(0, ey - 0.22, fz + 0.06).toNonIndexed());
        box(0.36, 0.12, 0.06, 0, y + 0.18, fz + 0.01, dark);
        box(0.42, 0.04, 0.06, 0, y + 0.25, fz + 0.03, gold); box(0.42, 0.04, 0.06, 0, y + 0.11, fz + 0.03, gold);
    }
    y += h1;
    // ---- head: fierce slanted brows, O mouth, a fan of carved feathers behind the shield
    lac.push(drum(0.46, 0.42, h2, y, 0.06));
    ring(0.47, y + h2 - 0.02, gold, 0.07);
    {
        const fz = 0.46, ey = y + 0.5;
        for (const s of [-1, 1]) {
            box(0.3, 0.07, 0.09, s * 0.17, ey + 0.11, fz + 0.02, gold, s * -0.32);
            almond(s * 0.16, ey, fz + 0.02, 0.1, 0.07, bone, s * 0.2);
            disc(0.03, s * 0.16, ey, fz + 0.06, eyes, 0.03);
        }
        disc(0.1, 0, y + 0.2, fz + 0.01, dark, 0.06); disc(0.12, 0, y + 0.2, fz - 0.005, gold, 0.05);
    }
    for (let k = -4; k <= 4; k++) {
        const L = 0.75 - Math.abs(k) * 0.06;
        const f = new THREE.BoxGeometry(0.13, L, 0.05).translate(0, L / 2, 0).rotateZ(k * 0.24).translate(k * 0.03, y + h2 - 0.05, -0.18).toNonIndexed();
        (Math.abs(k) % 2 ? gold : lac).push(f);
    }
    return { lac: merge(lac), gold: merge(gold), dark: merge(dark), bone: merge(bone), eyes: merge(eyes) };
}
let SHARED = null;

/** a canvas with the avatar (same-origin or data: only: anything else would taint WebGL) or initials */
function shieldTexture(name, avatar, color) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const drawInitials = () => {
        const g = ctx.createRadialGradient(128, 110, 20, 128, 128, 128); g.addColorStop(0, color); g.addColorStop(1, '#120c08');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
        ctx.font = `900 120px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(initials(name), 128, 136);
        ctx.fillStyle = '#fff6e6'; ctx.fillText(initials(name), 128, 136);
        tex.needsUpdate = true;
    };
    drawInitials();
    if (avatar && /^(data:image\/(png|jpe?g|webp|gif);|\/(?!\/))/i.test(avatar)) {
        const img = new Image();
        img.onload = () => { ctx.save(); ctx.beginPath(); ctx.arc(128, 128, 128, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(img, 0, 0, 256, 256); ctx.restore(); tex.needsUpdate = true; };
        img.src = avatar;
    }
    return tex;
}
function signTexture(name) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 192;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1024, 192);
    let size = 128;
    const text = String(name || 'PLAYER').toUpperCase();
    ctx.font = `900 ${size}px ${FONT}`;
    while (ctx.measureText(text).width > 940 && size > 40) { size -= 6; ctx.font = `900 ${size}px ${FONT}`; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    ctx.fillText(text, 512, 102);
    return new THREE.CanvasTexture(c);
}

export class Totem {
    /** pos: on the sand; face: the point it turns toward */
    constructor(engine, flames, { pos, face, color, name, avatar, index }) {
        const S = engine.scene;
        if (!SHARED) SHARED = totemGeometry();
        this.index = index; this.name = name;
        this.color = new THREE.Color(color);
        const g = new THREE.Group(); g.position.copy(pos);
        g.rotation.y = Math.atan2(face.x - pos.x, face.z - pos.z);
        this.group = g;
        // plinth: an octagonal stone drum with a bevelled cap
        const stone = new THREE.MeshStandardMaterial({ color: '#5c5a62', roughness: 0.8, flatShading: true });
        const plinth = new THREE.Mesh(merge([new THREE.CylinderGeometry(0.82, 0.95, 0.42, 8).translate(0, 0.21, 0).toNonIndexed(), new THREE.CylinderGeometry(0.74, 0.82, 0.08, 8).translate(0, 0.46, 0).toNonIndexed()]), stone);
        plinth.rotation.y = Math.PI / 8;
        this.lac = new THREE.MeshPhysicalMaterial({ color: this.color.clone().multiplyScalar(0.72), roughness: 0.38, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.6 });
        this.gold = new THREE.MeshStandardMaterial({ color: '#d6a24c', roughness: 0.28, metalness: 1 });
        this.eyeMat = new THREE.MeshBasicMaterial({ color: this.color.clone().multiplyScalar(4) });
        const dark = new THREE.MeshStandardMaterial({ color: '#120d0a', roughness: 0.6 });
        const bone = new THREE.MeshStandardMaterial({ color: '#d9c9a6', roughness: 0.45 });
        this.body = new THREE.Group();
        for (const [geo, mat] of [[SHARED.lac, this.lac], [SHARED.gold, this.gold], [SHARED.dark, dark], [SHARED.bone, bone], [SHARED.eyes, this.eyeMat]]) {
            const m = new THREE.Mesh(geo, mat); m.castShadow = mat !== this.eyeMat; m.receiveShadow = true; this.body.add(m);
        }
        // the shield: avatar disc in a gold rim, tilted slightly forward
        const shield = new THREE.Group(); shield.position.set(0, TOTEM_H + 0.5, 0.12); shield.rotation.x = -0.12;
        this.shieldTex = shieldTexture(name, avatar, color);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 40), new THREE.MeshStandardMaterial({ map: this.shieldTex, roughness: 0.4, emissive: '#ffffff', emissiveMap: this.shieldTex, emissiveIntensity: 0.35 }));
        disc.position.z = 0.035;
        const back = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.06, 40).rotateX(Math.PI / 2), this.lac);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 8, 48), this.gold); rim.position.z = 0.03;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 8).translate(0, -0.4, -0.05), this.gold);
        for (const o of [back, rim, stem]) o.castShadow = true;
        shield.add(back, disc, rim, stem);
        this.body.add(shield);
        // the carved body hangs off a pivot at the plinth's edge so it can topple onto the sand when they're out
        this.pivot = new THREE.Group(); this.pivot.position.set(0.62, 0.5, 0); this.body.position.set(-0.62, -0.5, 0);
        this.pivot.add(this.body);
        this.lift = new THREE.Group(); this.lift.add(plinth, this.pivot);
        g.add(this.lift);
        // the name sign: a plank on two stakes in front, the name burnt in, lit when it's their throw
        const sign = new THREE.Group(); sign.position.set(0, 0, 1.45);
        const plankMat = woodMaterial('#3e2c1e', { axis: 'x', scale: 2 });
        const plank = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.36, 0.06).translate(0, 0.62, 0), plankMat);
        for (const x of [-0.7, 0.7]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.07).translate(x, 0.31, -0.05), plankMat); st.castShadow = true; sign.add(st); }
        this.nameMat = new THREE.MeshBasicMaterial({ color: this.color.clone().multiplyScalar(0.6), alphaMap: signTexture(name), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        const label = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.32), this.nameMat); label.position.set(0, 0.62, 0.035);
        plank.castShadow = true;
        sign.add(plank, label); sign.rotation.x = -0.1;
        g.add(sign);
        S.add(g);
        g.updateMatrixWorld(true);

        // three life torches in a shallow arc in front of the totem, between it and the sign
        this.torches = [];
        const tg = torchGeometry(1.25), tmat = woodMaterial('#4d3b28', { rough: 0.8, axis: 'y', scale: 3 });
        [-0.95, 0, 0.95].forEach((x, i) => {
            const z = 0.95 - Math.abs(x) * 0.22;
            const m = new THREE.Mesh(tg, tmat); m.position.set(x, 0, z); m.castShadow = true; g.add(m);
            const wp = V(x, 1.25 + 0.22, z).applyMatrix4(g.matrixWorld);
            const f = flames.add({ p: wp, w: 0.34, h: 0.78, seed: index * 3 + i * 0.37 });
            this.torches.push({ f, lit: 1, level: 1, base: 0.78, mesh: m });
        });
        this.light = new FireLight(S, V(0, 1.9, 1.1).applyMatrix4(g.matrixWorld), { intensity: 9, color: '#ff9a4a' });
        this.flames = flames;
        this.active = 0; this.lives = 3;
        this.scene = S; this.out = 0; this.fall = -1; this.rise = 0; this.riseT = 0;
    }

    /** a lit torch's flame tip in world space (for smoke when it's snuffed) */
    torchTip(i) { return this.torches[i].f.p.clone(); }

    /** lives → torches; returns the indices of torches that just went out */
    setLives(n, snap = false) {
        const out = [];
        this.lives = n;
        this.torches.forEach((T, i) => { const lit = i < n ? 1 : 0; if (T.lit && !lit) out.push(i); T.lit = lit; if (snap) T.level = lit; });
        return out;
    }

    /** last life gone: the eyes die, then the totem topples sideways onto the sand (1.1 s, a designed fall + bounce) */
    knockOut() { this.out = 1; this.fall = 0; }
    /** the winner's totem rises on its plinth */
    raise() { this.rise = 1; }
    /** a new game: stand back up, lights on */
    revive() { this.out = 0; this.fall = -1; this.landed = false; this.pivot.rotation.z = 0; this.rise = 0; this.riseT = 0; this.lift.position.y = 0; }

    dispose() {
        this.scene.remove(this.group, this.light.light);
        for (const T of this.torches) this.flames.remove(T.f);
    }

    /** world-space point on top of the shield (where the ball leaps from) */
    get top() { return V(0, TOTEM_H + 0.95, 0.1).applyMatrix4(this.group.matrixWorld); }
    get head() { return V(0, TOTEM_H - 0.4, 0).applyMatrix4(this.group.matrixWorld); }

    setActive(on) { this.active = on ? 1 : 0; }

    update(dt, t) {
        let lit = 0;
        for (const T of this.torches) {
            T.level += (T.lit - T.level) * (1 - Math.exp(-dt * (T.lit ? 3 : 1.6)));
            T.f.h = T.base * (0.15 + 0.85 * T.level); T.f.intensity = T.level < 0.02 ? 0 : 0.35 + 0.75 * T.level;
            this.flames.write(T.f);
            lit += T.level;
        }
        this.light.base = 3 + 4 * lit; this.light.update(t);
        // the active player's name and eyes glow brighter
        this._a = (this._a ?? 0) + (this.active - (this._a ?? 0)) * (1 - Math.exp(-dt * 4));
        const a = this._a, pulse = 0.85 + 0.15 * Math.sin(t * 4);
        const dead = this.out ? 0.02 : 1;
        this.nameMat.color.copy(this.color).multiplyScalar((0.7 + a * 3.2 * pulse) * (this.out ? 0.25 : 1));
        this.eyeMat.color.copy(this.color).multiplyScalar((2.2 + a * 5 * pulse + this.rise * 4) * dead);
        // the fall: rotation grows with t² like a real topple, lands at ~100° (lying on the sand), one small bounce
        if (this.fall >= 0) {
            this.fall += dt;
            const T = 1.1, u = Math.min(1, this.fall / T), land = THREE.MathUtils.degToRad(100);
            let ang = land * u * u;
            if (u >= 1) { const k = this.fall - T; ang = land - Math.abs(Math.sin(k * 9)) * Math.exp(-k * 6) * 0.12; }
            this.pivot.rotation.z = -ang;
            if (!this.landed && u >= 1) { this.landed = true; this.onLand && this.onLand(); }
        }
        if (this.rise) { this.riseT = Math.min(1, this.riseT + dt / 1.4); this.lift.position.y = 0.7 * (1 - Math.pow(1 - this.riseT, 3)); }
    }
}
