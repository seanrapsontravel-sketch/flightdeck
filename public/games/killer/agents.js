// The agents: one hitman per player, in a dinner jacket in the team colour (velvet sheen, black satin lapels,
// white shirt, bow tie, black trousers), standing on a black plinth just outside the number ring on their own
// contract number, facing the board. Each player index has its own head silhouette — fedora, slicked hair, top
// hat, chignon, bowler, shaved head + shades — so players can be told apart without colour. Set in the floor in
// front of each agent: a brass medallion with the avatar (or initials); behind it, a brass name plate.
// States: active (a lift), killer (draws the pistol and levels it at the board, a crimson laser sight and a crimson
// ring at the base), fire (a strike: muzzle flash and kick), lost killer (the pistol drops to the floor), recoil
// (struck), shatter (out: chunks handed to the physics world), rise (winner, on a brass column).
// Static parts are merged per material, so an agent is about a dozen draws.
import * as THREE from 'three';
import { wedgeAngle } from '../lib3d/kit/darts.js';
import { mergeGeometries } from '../derby/merge.js';
import { AGENT_R, RING_OUT, LOOKS, SKIN, CRIMSON, GOLD, FONT, V, ease, initials } from './common.js';

const H = 1.62; // the figure's height to the top of the head (hats go above)

// the jacket's turned profile [radius, height], hem to collar; flattened front-to-back, broadened at the shoulders
const JACKET = [[0.16, 0.7], [0.172, 0.74], [0.165, 0.82], [0.152, 0.92], [0.158, 1.0], [0.178, 1.1], [0.19, 1.2], [0.2, 1.26], [0.19, 1.3], [0.15, 1.33], [0.09, 1.35], [0.05, 1.36]];
const SX = 1.08, SZ = 0.64;
const jr = (y) => {
    if (y <= JACKET[0][1]) return JACKET[0][0];
    for (let i = 1; i < JACKET.length; i++) {
        const [r1, y1] = JACKET[i], [r0, y0] = JACKET[i - 1];
        if (y <= y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
    }
    return JACKET[JACKET.length - 1][0];
};
/** a point on the jacket at height y, angle phi (0 = the front, +x = the figure's left), pushed out by k */
const onJacket = (y, phi, k = 1) => V(jr(y) * SX * k * Math.sin(phi), y, jr(y) * SZ * k * Math.cos(phi));

/** a patch of surface following the jacket (shirt front, lapels): y0..y1, phi from a(y) to b(y) */
function patch(y0, y1, a, b, k, ny = 14, nx = 8) {
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= ny; j++) {
        const y = y0 + (y1 - y0) * j / ny;
        for (let i = 0; i <= nx; i++) {
            const phi = a(y) + (b(y) - a(y)) * i / nx;
            const p = onJacket(y, phi, k);
            pos.push(p.x, p.y, p.z); uv.push(i / nx, j / ny);
        }
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const A = j * (nx + 1) + i, B = A + 1, C = A + nx + 1, D = C + 1;
        idx.push(A, B, C, B, D, C);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
}

const UP = V(0, 1, 0);
/** a capsule from a to b */
function limb(r, a, b, seg = 12) {
    const d = b.clone().sub(a), len = d.length();
    const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len), 4, seg);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
    return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}
const at = (g, x, y, z) => g.translate(x, y, z);

// the right arm (the figure's right is −x: it faces +z), in shoulder space: hangs along −y
const SHOULDER = V(-0.205, 1.25, 0);
const ELBOW = V(-0.02, -0.28, 0);
const WRIST = V(0, -0.25, 0.03);

/** head silhouettes: geometry lists per material, in figure space */
function headGeometry(look) {
    const out = { skin: [], hair: [], black: [], gold: [], glass: [] };
    const HY = 1.48;
    out.skin.push(new THREE.SphereGeometry(0.095, 28, 20).scale(0.92, 1.12, 1).translate(0, HY, 0));
    out.skin.push(new THREE.SphereGeometry(0.02, 10, 8).scale(0.6, 1, 0.9).translate(0.088, HY - 0.005, -0.005)); // ears
    out.skin.push(new THREE.SphereGeometry(0.02, 10, 8).scale(0.6, 1, 0.9).translate(-0.088, HY - 0.005, -0.005));
    out.skin.push(new THREE.SphereGeometry(0.016, 8, 6).scale(0.8, 1.2, 1).translate(0, HY - 0.005, 0.094)); // nose
    const cap = (tilt, th = 0.52) => new THREE.SphereGeometry(0.101, 28, 14, 0, Math.PI * 2, 0, Math.PI * th).scale(0.93, 1.12, 1.02).rotateX(tilt).translate(0, HY + 0.004, 0);
    const brim = (r, y, tilt = 0.06) => new THREE.CylinderGeometry(r, r, 0.012, 40).rotateX(tilt).translate(0, y, 0.004);
    const band = (r0, r1, y, h = 0.022) => new THREE.CylinderGeometry(r0, r1, h, 36, 1, true).translate(0, y, 0);
    switch (look) {
        case 'fedora': // a low pinched crown and a wide brim, snapped down at the front
            out.black.push(brim(0.19, 1.55, 0.1),
                new THREE.CylinderGeometry(0.088, 0.11, 0.075, 32).scale(1, 1, 1.12).translate(0, 1.592, 0),
                new THREE.SphereGeometry(0.088, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.32, 1.12).translate(0, 1.629, 0));
            out.black.push(new THREE.BoxGeometry(0.04, 0.03, 0.08).translate(0, 1.64, 0.02)); // the centre dent's ridge
            out.gold.push(band(0.1, 0.108, 1.568));
            break;
        case 'tophat':
            out.black.push(brim(0.15, 1.556, 0.04), new THREE.CylinderGeometry(0.102, 0.094, 0.21, 32).translate(0, 1.666, 0));
            out.gold.push(band(0.096, 0.097, 1.584, 0.03));
            break;
        case 'bowler':
            out.black.push(new THREE.TorusGeometry(0.128, 0.012, 8, 40).rotateX(Math.PI / 2).translate(0, 1.552, 0), brim(0.13, 1.551, 0),
                new THREE.SphereGeometry(0.11, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.92, 1).translate(0, 1.553, 0));
            out.gold.push(band(0.111, 0.111, 1.566, 0.018));
            break;
        case 'slick':
            out.hair.push(cap(-0.5, 0.42), new THREE.SphereGeometry(0.05, 14, 10).scale(1.5, 0.45, 1.3).rotateX(-0.5).translate(0, 1.582, 0.0));
            break;
        case 'bun':
            out.hair.push(cap(-0.45, 0.44), new THREE.SphereGeometry(0.048, 16, 12).translate(0, 1.53, -0.115),
                new THREE.TorusGeometry(0.03, 0.01, 8, 20).translate(0, 1.53, -0.09));
            break;
        default: // 'shades': shaved head, dark glasses, an earpiece
            out.glass.push(new THREE.BoxGeometry(0.07, 0.03, 0.02).rotateY(0.25).translate(0.036, HY + 0.018, 0.084),
                new THREE.BoxGeometry(0.07, 0.03, 0.02).rotateY(-0.25).translate(-0.036, HY + 0.018, 0.084));
            out.black.push(new THREE.BoxGeometry(0.02, 0.008, 0.01).translate(0, HY + 0.024, 0.093),
                new THREE.CylinderGeometry(0.004, 0.004, 0.09, 6).rotateZ(0.4).translate(-0.096, HY - 0.06, -0.01));
            break;
    }
    return out;
}

/** avatar (same-origin or data: only; anything else would taint WebGL) or initials, in a circle */
function medallionTexture(name, avatar, color) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const g = ctx.createRadialGradient(128, 100, 10, 128, 128, 128); g.addColorStop(0, color); g.addColorStop(1, '#070506');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    ctx.font = `900 118px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff3dc'; ctx.fillText(initials(name), 128, 138);
    tex.needsUpdate = true;
    if (avatar && /^(data:image\/(png|jpe?g|webp|gif);|\/(?!\/))/i.test(avatar)) {
        const img = new Image();
        img.onload = () => { ctx.save(); ctx.beginPath(); ctx.arc(128, 128, 128, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(img, 0, 0, 256, 256); ctx.restore(); tex.needsUpdate = true; };
        img.src = avatar;
    }
    return tex;
}
function plateTexture(name) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 160;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1024, 160);
    const text = String(name || 'PLAYER').toUpperCase();
    let size = 112; ctx.font = `800 ${size}px ${FONT}`;
    while (ctx.measureText(text).width > 960 && size > 36) { size -= 4; ctx.font = `800 ${size}px ${FONT}`; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    ctx.fillText(text, 512, 86);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
}

export class Agent {
    constructor(engine, { index, color, name, avatar, number }) {
        this.engine = engine; this.index = index; this.number = number; this.name = name;
        this.color = new THREE.Color(color);
        const a = wedgeAngle(number);
        this.angle = a;
        this.out = false; this.killer = false;
        this.home = V(Math.cos(a) * AGENT_R, 0, -Math.sin(a) * AGENT_R);
        this.inward = V(-Math.cos(a), 0, Math.sin(a)); // toward the board centre
        this.look = LOOKS[index % LOOKS.length];
        this.geos = []; this.mats = [];
        const keep = (x) => { (x.isMaterial ? this.mats : this.geos).push(x); return x; };

        const g = new THREE.Group();
        g.position.copy(this.home);
        engine.scene.add(g);
        this.group = g;
        this.piece = new THREE.Group(); g.add(this.piece);
        this.scale = 1.32; this.piece.scale.setScalar(this.scale);

        // materials
        const sheen = this.color.clone().lerp(new THREE.Color(1, 1, 1), 0.35);
        this.jacket = keep(new THREE.MeshPhysicalMaterial({ color: this.color, roughness: 0.62, metalness: 0, sheen: 1, sheenColor: sheen, sheenRoughness: 0.35, emissive: this.color, emissiveIntensity: 0 }));
        this.lacquer = this.jacket; // (the old name)
        this.black = keep(new THREE.MeshPhysicalMaterial({ color: '#0c0b0e', roughness: 0.32, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.18 }));
        this.white = keep(new THREE.MeshStandardMaterial({ color: '#efe9df', roughness: 0.55 }));
        this.skin = keep(new THREE.MeshStandardMaterial({ color: SKIN[index % SKIN.length], roughness: 0.55 }));
        this.hair = keep(new THREE.MeshPhysicalMaterial({ color: '#16100c', roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
        this.glass = keep(new THREE.MeshPhysicalMaterial({ color: '#050507', roughness: 0.05, metalness: 0.4, clearcoat: 1 }));
        this.gold = keep(new THREE.MeshStandardMaterial({ color: '#d4a24e', metalness: 1, roughness: 0.22, emissive: new THREE.Color(GOLD), emissiveIntensity: 0 }));
        this.gunmetal = keep(new THREE.MeshStandardMaterial({ color: '#2b2d31', metalness: 0.9, roughness: 0.32 }));

        // the static figure, by material
        const parts = { jacket: [], black: [], white: [], skin: [], hair: [], glass: [], gold: [] };
        // plinth + foot ring
        parts.black.push(new THREE.CylinderGeometry(0.38, 0.41, 0.05, 48).translate(0, 0.025, 0));
        parts.gold.push(new THREE.TorusGeometry(0.4, 0.02, 10, 64).rotateX(Math.PI / 2).translate(0, 0.05, 0));
        // shoes, trousers
        for (const s of [-1, 1]) {
            parts.black.push(new THREE.BoxGeometry(0.085, 0.06, 0.19).translate(s * 0.08, 0.08, 0.03));
            parts.black.push(new THREE.SphereGeometry(0.043, 12, 8).scale(1, 0.7, 1).translate(s * 0.08, 0.085, 0.12));
            parts.black.push(new THREE.CylinderGeometry(0.07, 0.058, 0.68, 20).translate(s * 0.08, 0.44, 0));
        }
        // jacket body
        parts.jacket.push(new THREE.LatheGeometry(JACKET.map(([r, y]) => new THREE.Vector2(r, y)), 40).scale(SX, 1, SZ));
        // the shirt's V, the lapels either side, the button, a pocket square
        const vw = (y) => 0.04 + (y - 1.0) / 0.335 * 0.5;
        const lw = (y) => 0.05 + 0.26 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, (y - 1.0) / 0.32))), 0.7);
        parts.white.push(patch(1.0, 1.305, (y) => -vw(y), vw, 1.012));
        parts.black.push(patch(1.0, 1.32, vw, (y) => vw(y) + lw(y), 1.022), patch(1.0, 1.32, (y) => -vw(y) - lw(y), (y) => -vw(y), 1.022));
        parts.black.push(at(new THREE.SphereGeometry(0.012, 10, 8), 0, 0.965, jr(0.965) * SZ * 1.03));
        parts.white.push(at(new THREE.BoxGeometry(0.05, 0.022, 0.008).rotateY(0.55), ...onJacket(1.16, 0.6, 1.03).toArray()));
        // neck, collar, bow tie
        parts.skin.push(new THREE.CylinderGeometry(0.042, 0.046, 0.1, 16).translate(0, 1.38, 0));
        parts.white.push(new THREE.CylinderGeometry(0.052, 0.07, 0.07, 20, 1, true).translate(0, 1.335, 0.006)); // the collar, over the shirt's top edge
        parts.black.push(new THREE.ConeGeometry(0.026, 0.048, 4).rotateZ(Math.PI / 2).translate(0.026, 1.345, 0.058),
            new THREE.ConeGeometry(0.026, 0.048, 4).rotateZ(-Math.PI / 2).translate(-0.026, 1.345, 0.058),
            new THREE.BoxGeometry(0.016, 0.022, 0.014).translate(0, 1.345, 0.06));
        // the left arm (static): sleeve, cuff, hand
        const lS = V(0.205, 1.25, 0), lE = V(0.228, 0.98, 0.01), lW = V(0.22, 0.74, 0.05);
        parts.jacket.push(limb(0.056, lS, lE), limb(0.05, lE, lW));
        parts.white.push(new THREE.CylinderGeometry(0.046, 0.046, 0.025, 16, 1, true).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, lW.clone().sub(lE).normalize())).translate(lW.x, lW.y + 0.005, lW.z));
        parts.skin.push(new THREE.SphereGeometry(0.04, 14, 10).scale(0.8, 1.2, 1).translate(lW.x, lW.y - 0.04, lW.z + 0.005));
        // the head
        const hd = headGeometry(this.look);
        for (const k of Object.keys(hd)) parts[k].push(...hd[k]);
        for (const [k, list] of Object.entries(parts)) {
            if (!list.length) continue;
            const geo = keep(mergeGeometries(list)); list.forEach((x) => x.dispose());
            const m = new THREE.Mesh(geo, this[k]); m.castShadow = true; m.receiveShadow = true;
            this.piece.add(m);
        }

        // the right arm: shoulder → elbow → hand, posed by update()
        this.shoulder = new THREE.Group(); this.shoulder.position.copy(SHOULDER); this.piece.add(this.shoulder);
        const up = new THREE.Mesh(keep(limb(0.056, V(), ELBOW)), this.jacket); up.castShadow = true;
        this.elbow = new THREE.Group(); this.elbow.position.copy(ELBOW); this.shoulder.add(up, this.elbow);
        const fore = new THREE.Mesh(keep(limb(0.05, V(), WRIST)), this.jacket); fore.castShadow = true;
        const cuff = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.046, 0.046, 0.025, 16, 1, true).translate(WRIST.x, WRIST.y + 0.005, WRIST.z)), this.white);
        const hand = new THREE.Mesh(keep(new THREE.SphereGeometry(0.04, 14, 10).scale(0.8, 1.2, 1).translate(WRIST.x, WRIST.y - 0.04, WRIST.z)), this.skin); hand.castShadow = true;
        this.elbow.add(fore, cuff, hand);
        // the pistol, in the hand: barrel along −y (the forearm), grip toward −z
        this.hand = new THREE.Group(); this.hand.position.set(WRIST.x, WRIST.y - 0.04, WRIST.z); this.elbow.add(this.hand);
        this.gun = new THREE.Group();
        const gunGeo = keep(mergeGeometries([
            new THREE.BoxGeometry(0.024, 0.032, 0.075).rotateX(-0.25).translate(0, 0.01, -0.012),   // grip
            new THREE.BoxGeometry(0.027, 0.15, 0.034).translate(0, -0.045, 0.04),                  // slide
            new THREE.BoxGeometry(0.008, 0.035, 0.022).translate(0, -0.01, 0.012),                 // trigger guard
            new THREE.CylinderGeometry(0.014, 0.014, 0.13, 14).translate(0, -0.185, 0.044),        // suppressor
        ]));
        const gunMesh = new THREE.Mesh(gunGeo, this.gunmetal); gunMesh.castShadow = true;
        this.gun.add(gunMesh);
        // the laser sight, from the muzzle along the barrel
        this.bladeMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(CRIMSON).multiplyScalar(5), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        this.beam = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.007, 0.007, 3.4, 6, 1, true).translate(0, -1.7, 0)), this.bladeMat);
        this.beam.position.set(0, -0.25, 0.044);
        this.flashMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0').multiplyScalar(6), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        this.flash = new THREE.Mesh(keep(new THREE.SphereGeometry(0.05, 10, 8).scale(1, 2.2, 1)), this.flashMat);
        this.flash.position.set(0, -0.31, 0.044);
        this.gun.add(this.beam, this.flash);
        this.hand.add(this.gun);
        this.gun.visible = false;
        this.blade = this.beam; // (the old name)

        // crimson ring on the floor round the base
        this.ringMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(CRIMSON).multiplyScalar(3), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -16 }));
        this.ring = new THREE.Mesh(keep(new THREE.RingGeometry(0.58, 0.64, 64).rotateX(-Math.PI / 2)), this.ringMat);
        this.ring.position.y = 0.02; g.add(this.ring);
        // the winner's column: brass, rising out of the floor under the agent
        this.column = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.52, 0.58, 1, 32, 1).translate(0, 0.5, 0)), this.gold);
        this.column.scale.y = 0.001; this.column.visible = false; this.column.castShadow = true; g.add(this.column);
        this.facing = Math.atan2(this.inward.x, this.inward.z); // the figure's +z toward the board
        this.piece.rotation.y = this.facing;

        // floor medallion (avatar) between the ring and the agent, and the name plate behind it
        const medR = RING_OUT + 0.3, plateR = AGENT_R + 0.72;
        this.medTex = medallionTexture(name, avatar, '#' + this.color.getHexString());
        this.medMat = keep(new THREE.MeshStandardMaterial({ map: this.medTex, roughness: 0.35, metalness: 0, emissive: new THREE.Color(1, 1, 1), emissiveMap: this.medTex, emissiveIntensity: 0.25, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
        this.med = new THREE.Mesh(keep(new THREE.CircleGeometry(0.24, 48).rotateX(-Math.PI / 2)), this.medMat);
        this.med.position.set(Math.cos(a) * medR, 0.014, -Math.sin(a) * medR);
        this.rimMat = keep(new THREE.MeshStandardMaterial({ color: '#d4a24e', metalness: 1, roughness: 0.22, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
        this.medRim = new THREE.Mesh(keep(new THREE.RingGeometry(0.24, 0.285, 48).rotateX(-Math.PI / 2)), this.rimMat);
        this.medRim.position.copy(this.med.position).setY(0.016);
        engine.scene.add(this.med, this.medRim);
        this.plateTex = plateTexture(name);
        this.plateMat = keep(new THREE.MeshStandardMaterial({ color: '#b98d4a', metalness: 1, roughness: 0.3, alphaMap: this.plateTex, transparent: true, emissive: new THREE.Color(GOLD), emissiveIntensity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -16 }));
        this.plate = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.5, 0.235).rotateX(-Math.PI / 2)), this.plateMat);
        this.plate.position.set(Math.cos(a) * plateR, 0.016, -Math.sin(a) * plateR);
        this.plateBack = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.6, 0.3).rotateX(-Math.PI / 2)), keep(new THREE.MeshStandardMaterial({ color: '#050405', roughness: 0.2, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 })));
        this.plateBack.position.copy(this.plate.position).setY(0.01);
        engine.scene.add(this.plateBack, this.plate);

        // motion state
        this.activeK = 0; this.activeTo = 0;
        this.killerK = 0; this.killerTo = 0;
        this.rec = 0;
        this.lift = 0; this.liftTo = 0;
        this.kick = 0;             // a shot's recoil
        this.drop = null;          // lost killer: the pistol falling to the floor
    }

    /** the head's world position (cameras aim here) */
    get top() { return this.group.position.clone().add(V(0, H * this.scale + 0.1 + this.lift, 0)); }
    get mid() { return this.group.position.clone().add(V(0, 0.9 * this.scale + this.lift, 0)); }

    setActive(on) { this.activeTo = on ? 1 : 0; }
    setKiller(on, instant = false) {
        const was = this.killerK > 0.5;
        this.killer = !!on; this.killerTo = on ? 1 : 0;
        if (on) this.holster();
        if (instant) this.killerK = this.killerTo;
        if (!on && !instant && was && !this.out) this.dropGun();
    }
    /** a strike: muzzle flash and kick */
    fire() { if (this.killerK > 0.5 && !this.out) this.kick = 1; }
    /** struck: tilt away from the board and spring back */
    recoil(a = 1) { this.rec = Math.min(1.4, this.rec + a); }
    /** the winner: lifted on a column */
    rise(on = true) { this.liftTo = on ? 1.1 : 0; }

    /** the pistol back in the hand (after a drop) */
    holster() {
        if (this.gun.parent !== this.hand) { this.hand.add(this.gun); this.gun.position.set(0, 0, 0); this.gun.rotation.set(0, 0, 0); this.gun.scale.setScalar(1); }
        this.drop = null;
    }
    /** lost killer: the pistol leaves the hand and falls to the floor, where it stays */
    dropGun() {
        this.piece.updateMatrixWorld(true);
        this.gun.visible = true;
        this.group.attach(this.gun);
        const out = this.inward.clone().negate();
        this.drop = { v: V(out.x * 0.6, 0.8, out.z * 0.6), w: V(6, 2, 4), t: 0 };
    }

    /** out: hide the figure and hand its chunks to the physics world, pushed away from the board */
    shatter(world, push = 1) {
        if (this.out) return;
        this.out = true;
        this.piece.visible = false; this.ringMat.opacity = 0; this.gun.visible = false;
        if (!world) return;
        const c = this.group.position, out = this.inward.clone().negate();
        const q = new THREE.Quaternion();
        const black = new THREE.Color('#141217'), white = new THREE.Color('#efe9df'), skin = new THREE.Color(SKIN[this.index % SKIN.length]);
        const sc = this.scale;
        // [height, radius there, pieces round the ring, colour]
        const rows = [[0.03, 0.34, 4, black], [0.1, 0.09, 2, black], [0.3, 0.1, 2, black], [0.56, 0.1, 2, black], [0.78, 0.15, 3, this.color], [0.96, 0.15, 3, this.color],
            [1.12, 0.17, 3, this.color], [1.22, 0.06, 1, white], [1.26, 0.2, 4, this.color], [1.42, 0.05, 1, skin], [1.5, 0.08, 2, skin], [1.6, 0.1, 1, this.look === 'slick' || this.look === 'bun' ? this.hair.color : this.look === 'shades' ? skin : black]];
        for (const [y, r, n, col] of rows) {
            for (let i = 0; i < n; i++) {
                const ang = (i / n) * Math.PI * 2 + y * 3;
                const off = V(Math.cos(ang) * r * 0.8 * sc, 0, Math.sin(ang) * r * 0.8 * sc);
                const p = c.clone().add(off).setY(y * sc + 0.05);
                q.setFromEuler(new THREE.Euler(Math.random() * 0.5, Math.random() * 3, Math.random() * 0.5));
                const s = Math.max(0.07, r * 2.2 / n) * sc;
                const v = out.clone().multiplyScalar((1.6 + Math.random() * 2.2) * push).add(off.clone().multiplyScalar(6)).add(V(0, 1.5 + Math.random() * 3 + y * 1.4, 0));
                const w = V((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
                world.add({ p, q, v, w, s: V(s, s * (0.8 + Math.random() * 0.6), s * 0.38), color: col });
            }
        }
    }
    revive() { this.out = false; this.piece.visible = true; }

    update(dt, t) {
        const k = 1 - Math.exp(-dt * 5);
        this.activeK += (this.activeTo - this.activeK) * k;
        // drawing is quick; lowering after a drop quicker still
        this.killerK += (this.killerTo - this.killerK) * (1 - Math.exp(-dt * (this.killerTo ? 3.2 : 6)));
        this.lift += (this.liftTo - this.lift) * (1 - Math.exp(-dt * 2.2));
        // recoil: a damped tilt away from the board
        this.rec = Math.max(0, this.rec - dt * 2.4);
        const tilt = Math.sin(this.rec * 5.5) * this.rec * 0.28;
        const ax = V(this.inward.z, 0, -this.inward.x); // tilt axis (tangent)
        this.piece.quaternion.setFromAxisAngle(ax, -tilt).multiply(new THREE.Quaternion().setFromAxisAngle(UP, this.facing));
        this.column.visible = this.lift > 0.01; this.column.scale.y = Math.max(0.001, this.lift);
        this.piece.position.y = this.lift + this.activeK * 0.06 + Math.sin(t * 2 + this.index) * 0.008 * this.activeK;
        this.jacket.emissiveIntensity = 0.04 + this.activeK * 0.1;
        this.gold.emissiveIntensity = this.activeK * 0.25 + this.killerK * 0.2;
        this.medMat.emissiveIntensity = 0.22 + this.activeK * 0.35;
        this.plateMat.emissiveIntensity = (0.35 + this.activeK * 1.1) * (this.out ? 0.15 : 1);
        this.medMat.color.setScalar(this.out ? 0.25 : 1);

        // the right arm: hanging, a little out and the elbow soft; as a killer, levelled at the board, a touch down
        const kk = this.out ? 0 : this.killerK, e = ease(kk);
        this.kick = Math.max(0, this.kick - dt * 5);
        const kickA = Math.sin(Math.min(1, this.kick) * Math.PI) * 0.35;
        const breathe = Math.sin(t * 1.3 + this.index * 1.7) * 0.015;
        this.shoulder.rotation.set(-e * (Math.PI / 2 - 0.32) - kickA + breathe * (1 - e), 0, -0.07 * (1 - e) + 0.12 * e);
        this.elbow.rotation.set(-0.16 * (1 - e) - kickA * 0.3, 0, 0);
        if (this.gun.parent === this.hand) this.gun.visible = kk > 0.3;
        this.bladeMat.opacity = this.gun.parent === this.hand ? Math.max(0, (kk - 0.6) / 0.4) * (0.75 + 0.25 * Math.sin(t * 9 + this.index)) : 0;
        this.flashMat.opacity = this.kick > 0.75 ? (this.kick - 0.75) * 4 : 0;
        this.flash.scale.setScalar(0.6 + this.kick);
        this.ringMat.opacity = kk * (0.75 + 0.25 * Math.sin(t * 2.4));
        this.ring.scale.setScalar(1 + (1 - kk) * 0.6);
        // lost killer: the pistol tumbles to the floor and lies there
        if (this.drop) {
            const D = this.drop; D.t += dt;
            D.v.y -= 9.8 * dt;
            this.gun.position.addScaledVector(D.v, dt);
            this.gun.rotation.x += D.w.x * dt; this.gun.rotation.y += D.w.y * dt; this.gun.rotation.z += D.w.z * dt;
            if (this.gun.position.y < 0.025) {
                this.gun.position.y = 0.025; this.gun.rotation.set(0, this.gun.rotation.y, Math.PI / 2); // flat on its side
                this.drop = null;
            }
        }
    }
    dispose() {
        this.engine.scene.remove(this.group, this.med, this.medRim, this.plate, this.plateBack);
        for (const m of this.mats) m.dispose();
        for (const x of this.geos) x.dispose();
        this.medTex.dispose(); this.plateTex.dispose();
    }
}
