// The table (docs/plans/ZERO-HOUR.md §7.1): an emerald felt top printed with the standard single-zero layout, a
// lacquered walnut rail with a brass inlay, and, per cell, two overlays the game drives from the state:
//   - the leader rim: the cell's border in the colour of whoever leads it (cells[].leader from the engine; never
//     computed here). Subtle all game, strong before the spin (the "winning-number map").
//   - the glow: a soft flash when chips land, when a cell is stolen, and on the winning number.
// Each seat has a cashier tray on the near rail, where a visit's chips appear before the sweep.
import * as THREE from 'three';
import {
    V, POCKETS, LAYOUT_X0, LAYOUT_Z0, LAYOUT_W, LAYOUT_D, cellRect, trayAt, WHEEL_C, WHEEL_R,
    GOLD, FELT, IVORY, canvasTex, DISPLAY_FONT, SANS_FONT, seatColor,
} from './common.js';
import { pocketColor } from './rules.mjs';

// the table top, in metres
export const TOP = { x0: WHEEL_C.x - WHEEL_R - 0.14, x1: LAYOUT_X0 + LAYOUT_W + 0.14, z0: LAYOUT_Z0 - 0.2, z1: LAYOUT_Z0 + LAYOUT_D + 0.3 };
const PPM = 1100; // felt texture pixels per metre

function roundedRect(x0, z0, x1, z1, r) {
    const s = new THREE.Shape();
    s.moveTo(x0 + r, z0); s.lineTo(x1 - r, z0); s.quadraticCurveTo(x1, z0, x1, z0 + r);
    s.lineTo(x1, z1 - r); s.quadraticCurveTo(x1, z1, x1 - r, z1); s.lineTo(x0 + r, z1);
    s.quadraticCurveTo(x0, z1, x0, z1 - r); s.lineTo(x0, z0 + r); s.quadraticCurveTo(x0, z0, x0 + r, z0);
    return s;
}

/** the printed felt: base cloth, the layout's brass lines, numbers on red / black / green lozenges, the house mark */
function feltTexture() {
    const W = Math.round((TOP.x1 - TOP.x0) * PPM), H = Math.round((TOP.z1 - TOP.z0) * PPM);
    const px = (x) => (x - TOP.x0) * PPM, pz = (z) => (z - TOP.z0) * PPM;
    return canvasTex(W, H, (g) => {
        g.fillStyle = FELT; g.fillRect(0, 0, W, H);
        // cloth: fine noise and a faint weave so the felt isn't a flat colour
        const img = g.getImageData(0, 0, W, H), d = img.data;
        let seed = 7;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < d.length; i += 4) {
            const n = (rnd() - 0.5) * 14 + (((i >> 2) % W) % 3 === 0 ? -3 : 0);
            d[i] += n; d[i + 1] += n * 1.2; d[i + 2] += n;
        }
        g.putImageData(img, 0, 0);
        // a vignette toward the rail
        const vg = g.createRadialGradient(W * 0.55, H * 0.45, H * 0.2, W * 0.55, H * 0.45, W * 0.62);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.38)');
        g.fillStyle = vg; g.fillRect(0, 0, W, H);
        // the wheel's well
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath(); g.arc(px(WHEEL_C.x), pz(WHEEL_C.z), (WHEEL_R + 0.03) * PPM, 0, Math.PI * 2); g.fill();
        // the layout: brass-gold lines
        g.strokeStyle = GOLD; g.lineCap = 'round';
        for (let n = 0; n < POCKETS; n++) {
            const r = cellRect(n);
            g.lineWidth = 0.004 * PPM;
            g.strokeRect(px(r.x0), pz(r.z0), r.w * PPM, r.d * PPM);
            // the number in the cell's far band, on its pocket colour
            const col = pocketColor(n), cx = px(r.cx), cy = pz(n === 0 ? r.cz - r.d * 0.28 : r.z0 + r.d * 0.24);
            const ew = (n === 0 ? 0.045 : 0.042) * PPM, eh = (n === 0 ? 0.06 : 0.028) * PPM;
            g.fillStyle = col === 'red' ? '#b01226' : col === 'black' ? '#101010' : '#0b7a3e';
            g.beginPath(); g.ellipse(cx, cy, ew, eh, 0, 0, Math.PI * 2); g.fill();
            g.lineWidth = 0.0022 * PPM; g.strokeStyle = GOLD; g.stroke();
            g.fillStyle = IVORY;
            g.font = `700 ${Math.round((n === 0 ? 0.06 : 0.044) * PPM)}px ${DISPLAY_FONT}`;
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText(String(n), cx, cy + 0.002 * PPM);
            g.strokeStyle = GOLD;
        }
        // an outer double rule round the layout
        g.lineWidth = 0.006 * PPM;
        g.strokeRect(px(LAYOUT_X0) - 0.012 * PPM, pz(LAYOUT_Z0) - 0.012 * PPM, (LAYOUT_W + 0.024) * PPM, (LAYOUT_D + 0.024) * PPM);
        // the house mark between the layout and the trays
        g.fillStyle = 'rgba(231,184,90,0.55)';
        g.font = `italic 600 ${Math.round(0.034 * PPM)}px ${DISPLAY_FONT}`;
        g.fillText('Salle Zéro', px(LAYOUT_X0 + LAYOUT_W * 0.5), pz(LAYOUT_Z0 + LAYOUT_D + 0.05));
        g.font = `600 ${Math.round(0.012 * PPM)}px ${SANS_FONT}`;
        g.fillStyle = 'rgba(231,184,90,0.4)';
        g.fillText('M  I  N  U  I  T', px(LAYOUT_X0 + LAYOUT_W * 0.5), pz(LAYOUT_Z0 + LAYOUT_D + 0.08));
    });
}

/** a rectangle-border alpha mask: white frame, clear inside */
function frameTexture(inset = 0.12) {
    return canvasTex(256, 224, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        const b = Math.round(w * inset * 0.5);
        g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
        g.clearRect(b, b, w - 2 * b, h - 2 * b);
        // a soft inner falloff so the rim glows rather than looks like tape
        const grd = g.createLinearGradient(0, 0, b * 3, 0);
        void grd;
    }, { srgb: false });
}
function glowTexture() {
    return canvasTex(256, 224, (g, w, h) => {
        const grd = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * 0.6);
        grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.3)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.fillRect(0, 0, w, h);
    }, { srgb: false });
}

/** a glow colour scaled by brightness, so a pale player colour (ivory) lights a cell instead of washing it white */
function glowTint(out, color) {
    out.set(color);
    const l = 0.2126 * out.r + 0.7152 * out.g + 0.0722 * out.b;
    return out.multiplyScalar(Math.min(1.6, 0.32 / Math.max(0.05, l)));
}

export class Table {
    constructor(engine) {
        this.scene = engine.scene;
        const root = (this.root = new THREE.Group());
        this.scene.add(root);
        // the felt top
        this.feltMat = new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.96, metalness: 0 });
        const w = TOP.x1 - TOP.x0, d = TOP.z1 - TOP.z0;
        const felt = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), this.feltMat);
        felt.position.set((TOP.x0 + TOP.x1) / 2, 0, (TOP.z0 + TOP.z1) / 2);
        felt.receiveShadow = true; root.add(felt);
        // the walnut rail and its brass inlay
        this.walnut = new THREE.MeshStandardMaterial({ color: '#4a2716', roughness: 0.3, metalness: 0 });
        this.brass = new THREE.MeshStandardMaterial({ color: '#c39443', roughness: 0.28, metalness: 1 });
        const R = 0.09;
        const outer = roundedRect(TOP.x0 - R, TOP.z0 - R, TOP.x1 + R, TOP.z1 + R, 0.16);
        outer.holes.push(roundedRect(TOP.x0, TOP.z0, TOP.x1, TOP.z1, 0.08));
        const rail = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.02, bevelSegments: 5, curveSegments: 12 }).rotateX(Math.PI / 2).translate(0, 0.045, 0), this.walnut);
        rail.castShadow = true; rail.receiveShadow = true; root.add(rail);
        const inlay = new THREE.Shape(); const io = roundedRect(TOP.x0 - 0.006, TOP.z0 - 0.006, TOP.x1 + 0.006, TOP.z1 + 0.006, 0.085);
        io.holes.push(roundedRect(TOP.x0 + 0.002, TOP.z0 + 0.002, TOP.x1 - 0.002, TOP.z1 - 0.002, 0.08)); void inlay;
        const brassLine = new THREE.Mesh(new THREE.ExtrudeGeometry(io, { depth: 0.004, bevelEnabled: false, curveSegments: 12 }).rotateX(Math.PI / 2).translate(0, 0.004, 0), this.brass);
        root.add(brassLine);
        // the table's body down to the floor (dark, mostly out of shot)
        const body = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.8, d + 0.1), new THREE.MeshStandardMaterial({ color: '#1c0f09', roughness: 0.6 }));
        body.position.set((TOP.x0 + TOP.x1) / 2, -0.42, (TOP.z0 + TOP.z1) / 2); root.add(body);

        // per-cell overlays
        const frame = frameTexture(), glow = glowTexture();
        this.cells = [];
        for (let n = 0; n < POCKETS; n++) {
            const r = cellRect(n);
            const rimMat = new THREE.MeshBasicMaterial({ color: '#ffffff', alphaMap: frame, transparent: true, opacity: 0, depthWrite: false });
            const rim = new THREE.Mesh(new THREE.PlaneGeometry(r.w - 0.004, r.d - 0.004).rotateX(-Math.PI / 2), rimMat);
            rim.position.set(r.cx, 0.0012, r.cz); rim.renderOrder = 2; root.add(rim);
            const glowMat = new THREE.MeshBasicMaterial({ color: '#ffffff', alphaMap: glow, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
            const gl = new THREE.Mesh(new THREE.PlaneGeometry(r.w * 1.05, r.d * 1.05).rotateX(-Math.PI / 2), glowMat);
            gl.position.set(r.cx, 0.0016, r.cz); gl.renderOrder = 3; root.add(gl);
            this.cells.push({ n, rim, rimMat, gl, glowMat, leader: null, tie: [], color: null, glow: 0, glowColor: new THREE.Color(), pulse: 0 });
        }
        this.mapLevel = 0.42; // rim strength: subtle in play, 1 before the spin
        this.mapTarget = 0.42;
        this.trays = [];
        this.time = 0;
    }

    /** a cashier tray per seat on the near rail */
    setPlayers(colors) {
        for (const t of this.trays) this.root.remove(t);
        this.trays = colors.map((c, s) => {
            const g = new THREE.Group();
            const p = trayAt(s, colors.length);
            const tray = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.014, 0.07), this.walnut);
            tray.position.y = 0.007; tray.castShadow = true; tray.receiveShadow = true; g.add(tray);
            const lip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.004, 0.006), new THREE.MeshStandardMaterial({ color: c, emissive: new THREE.Color(c), emissiveIntensity: 0.6, roughness: 0.4 }));
            lip.position.set(0, 0.016, 0.035); g.add(lip);
            g.position.set(p.x, 0, p.z);
            this.root.add(g);
            return g;
        });
    }

    /** a cell's leader (null = nobody; tie = the ids level on value and total) — colours come from the game */
    setLeader(n, color, tie = []) {
        const c = this.cells[n];
        c.color = color; c.tie = tie;
        if (color) { c.rimMat.color.set(color); const l = 0.2126 * c.rimMat.color.r + 0.7152 * c.rimMat.color.g + 0.0722 * c.rimMat.color.b; c.rimMat.color.multiplyScalar(l > 0.5 ? 0.85 : 1.4); }
        else if (tie.length) c.rimMat.color.set(GOLD);
    }
    /** a soft flash on a cell (landing chips, a steal, the winning number) */
    flash(n, color, strength = 1) {
        const c = this.cells[n]; if (!c) return;
        c.glow = Math.max(c.glow, strength); glowTint(c.glowColor, color || '#ffffff');
    }
    /** the winning number's glow stays on */
    hold(n, color) { const c = this.cells[n]; if (!c) return; c.hold = true; glowTint(c.glowColor, color || GOLD); c.glow = 1.2; }
    clearHolds() { for (const c of this.cells) c.hold = false; }
    /** the pre-spin map: rims at full strength (1) or subtle (0.42) */
    setMap(on) { this.mapTarget = on ? 1 : 0.42; }
    cellPos(n) { const r = cellRect(n); return V(r.cx, 0, r.cz); }

    update(dt) {
        this.time += dt;
        this.mapLevel += (this.mapTarget - this.mapLevel) * (1 - Math.exp(-dt * 3));
        for (const c of this.cells) {
            const on = c.color || c.tie.length;
            const target = on ? this.mapLevel * (c.tie.length ? 0.6 + 0.3 * Math.sin(this.time * 4) : 1) : 0;
            c.rimMat.opacity += (target - c.rimMat.opacity) * (1 - Math.exp(-dt * 8));
            if (c.hold) c.glow = 0.75 + 0.2 * Math.sin(this.time * 5);
            else c.glow = Math.max(0, c.glow - dt * 2.4);
            c.glowMat.opacity = Math.min(0.7, c.glow * 0.55);
            c.glowMat.color.copy(c.glowColor);
            c.rim.visible = c.rimMat.opacity > 0.01;
            c.gl.visible = c.glowMat.opacity > 0.01;
        }
    }
}
