// The prize towers: one per player (or team), in a shallow arc either side of the oche ring. Each is a glass
// column holding fifteen LED rungs — the player's own money tree. Rungs light in the player's colour up to their
// rung; the next rung pulses gold while it's their question; the top rung is the million and lights gold.
// A plinth carries the name and the prize. The active tower is spotlit; the rest dim.
// The DOM HUD is the readable truth; the towers are its picture (truth() compares them).
import * as THREE from 'three';
import { LADDER, canvasTex, glowMat, moneyShort } from './common.js';

const RUNGS = LADDER.length, SEG_H = 0.2, SEG_GAP = 0.05, BASE_H = 0.9, W = 0.82;
export const TOWER_H = BASE_H + RUNGS * (SEG_H + SEG_GAP) + 0.25;

function plate(name, prize, color) {
    return canvasTex(512, 256, (g, w, h) => {
        g.fillStyle = '#05071a'; g.fillRect(0, 0, w, h);
        g.fillStyle = color; g.fillRect(0, 0, w, 10);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        let size = 78; g.font = `900 ${size}px "Avenir Next Condensed","DIN Condensed",Impact,sans-serif`;
        const label = String(name || '').toUpperCase();
        while (g.measureText(label).width > w - 30 && size > 30) { size -= 4; g.font = `900 ${size}px "Avenir Next Condensed","DIN Condensed",Impact,sans-serif`; }
        g.fillStyle = '#ffffff'; g.fillText(label, w / 2, 86);
        g.font = '900 84px "Avenir Next Condensed","DIN Condensed",Impact,sans-serif';
        g.fillStyle = '#ffc94d'; g.fillText(prize, w / 2, 182);
    });
}

export class Towers {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group(); scene.add(this.group);
        this.list = [];
        this.glass = new THREE.MeshPhysicalMaterial({ color: '#9fb4ff', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.12, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
        this.frame = new THREE.MeshStandardMaterial({ color: '#202533', metalness: 1, roughness: 0.25 });
        this.segGeo = new THREE.BoxGeometry(W - 0.16, SEG_H, 0.12);
        this.beamGeo = new THREE.CylinderGeometry(0.25, 1.1, 1, 24, 1, true).translate(0, -0.5, 0);
        this.clock = 0;
    }

    /** where tower i of n stands: left half outer → inner, right half inner → outer (reading order left to right) */
    static place(i, n) {
        const left = Math.ceil(n / 2), right = n - left;
        if (i < left) { const k = left - 1 - i; return new THREE.Vector3(-(3.55 + k * 1.35), 0, 0.5 + k * 0.85); }
        const k = i - left; void right; return new THREE.Vector3(3.55 + k * 1.35, 0, 0.5 + k * 0.85);
    }

    setPlayers(players) {
        for (const t of this.list) { this.group.remove(t.g); t.plateTex.dispose(); }
        this.list = [];
        const n = players.length;
        players.forEach((p, i) => {
            const g = new THREE.Group(); g.position.copy(Towers.place(i, n));
            g.rotation.y = -Math.atan2(g.position.x, 12 - g.position.z) * 0.9; // turned toward the audience
            this.group.add(g);
            const color = new THREE.Color(p.color);
            // plinth with the name plate
            const plinth = new THREE.Mesh(new THREE.BoxGeometry(W + 0.12, BASE_H, W + 0.12), new THREE.MeshPhysicalMaterial({ color: '#0a0c16', metalness: 0.6, roughness: 0.25, clearcoat: 0.8 }));
            plinth.position.y = BASE_H / 2; plinth.castShadow = plinth.receiveShadow = true; g.add(plinth);
            const plateTex = plate(p.name, '£0', p.color);
            const plateMat = new THREE.MeshBasicMaterial({ map: plateTex, toneMapped: false });
            const pl = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.06, (W + 0.06) / 2), plateMat);
            pl.position.set(0, BASE_H * 0.5, (W + 0.12) / 2 + 0.003); g.add(pl);
            const trim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.14, 0.03, W + 0.14), glowMat(color, 1)); trim.position.y = BASE_H; g.add(trim);
            // the glass column and its frame
            const colH = RUNGS * (SEG_H + SEG_GAP) + 0.1;
            const glass = new THREE.Mesh(new THREE.BoxGeometry(W, colH, 0.3), this.glass); glass.position.y = BASE_H + colH / 2; g.add(glass);
            for (const sx of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, colH + 0.1, 0.32), this.frame); rail.position.set(sx * W / 2, BASE_H + colH / 2, 0); g.add(rail); }
            const cap = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.08, 0.36), this.frame); cap.position.y = BASE_H + colH + 0.04; g.add(cap);
            // the rungs
            const segs = [];
            for (let r = 0; r < RUNGS; r++) {
                const m = new THREE.MeshStandardMaterial({ color: '#05060c', emissive: color.clone(), emissiveIntensity: 0.0, roughness: 0.4, metalness: 0.2 });
                const s = new THREE.Mesh(this.segGeo, m); s.position.y = BASE_H + 0.08 + r * (SEG_H + SEG_GAP) + SEG_H / 2; g.add(s); segs.push(m);
            }
            // a spot from above when active, and a pool of light on the floor
            const beam = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(0.18), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
            beam.position.y = 9; beam.scale.set(1, 9, 1); g.add(beam);
            const pool = new THREE.Mesh(new THREE.CircleGeometry(1.1, 48).rotateX(-Math.PI / 2), glowMat(color, 0)); pool.position.y = 0.012; g.add(pool);
            this.list.push({ g, segs, color, plateTex, plateMat, name: p.name, rung: 0, shownRung: 0, prize: 0, active: false, act: 0, beam, pool, next: false, winner: false });
        });
    }
    setRung(i, rung, animate = false) {
        const t = this.list[i]; if (!t) return;
        if (animate && rung !== t.shownRung) t.climb = { from: t.shownRung, to: rung, t: 0 };
        else { t.climb = null; t.shownRung = rung; }
        t.rung = rung;
        const prize = rung > 0 ? LADDER[Math.min(rung, RUNGS) - 1] : 0;
        if (prize !== t.prize) {
            t.prize = prize; t.plateTex.dispose();
            t.plateTex = plate(t.name, moneyShort(prize), '#' + t.color.getHexString());
            t.plateMat.map = t.plateTex; t.plateMat.needsUpdate = true;
        }
    }
    setActive(i, questionLive = false) { this.list.forEach((t, k) => { t.active = k === i; t.next = k === i && questionLive; }); }
    setWinners(idx) { this.list.forEach((t, k) => { t.winner = idx.includes(k); }); }
    top(i) { const t = this.list[i]; return t ? t.g.localToWorld(new THREE.Vector3(0, TOWER_H, 0)) : new THREE.Vector3(); }
    base(i) { const t = this.list[i]; return t ? t.g.position.clone() : new THREE.Vector3(); }
    rungPoint(i, r) { const t = this.list[i]; return t ? t.g.localToWorld(new THREE.Vector3(0, BASE_H + 0.08 + Math.max(0, r - 1) * (SEG_H + SEG_GAP) + SEG_H / 2, 0.2)) : new THREE.Vector3(); }
    get busy() { return this.list.some((t) => t.climb); }
    shown(i) { const t = this.list[i]; return t ? t.shownRung : null; }

    update(dt) {
        this.clock += dt;
        const c = this.clock;
        for (const t of this.list) {
            if (t.climb) { t.climb.t += dt; const u = Math.min(1, t.climb.t / 0.7); t.shownRung = t.climb.from + (t.climb.to - t.climb.from) * u; if (u >= 1) { t.shownRung = t.climb.to; t.climb = null; } }
            t.act += ((t.active || t.winner ? 1 : 0) - t.act) * (1 - Math.exp(-dt * 4));
            const lit = t.shownRung;
            t.segs.forEach((m, r) => {
                const on = r < Math.floor(lit + 1e-6) ? 1 : r < lit ? lit - r : 0;
                const top = r === RUNGS - 1;
                const isNext = t.next && r === Math.round(t.rung);
                m.emissive.copy(top && on > 0 ? new THREE.Color('#ffc94d') : isNext ? new THREE.Color('#ffc94d') : t.color);
                const winnerSweep = t.winner ? 0.6 + 0.6 * Math.max(0, Math.sin(c * 5 - r * 0.5)) : 0;
                m.emissiveIntensity = on > 0 ? (1.4 + 1.2 * t.act) * on + winnerSweep : isNext ? 0.8 + 0.8 * Math.sin(c * 6) : 0.05 + 0.05 * t.act;
            });
            t.beam.material.opacity = t.act * 0.9;
            t.beam.visible = t.act > 0.02;
            t.pool.material.opacity = 0.18 * t.act;
        }
    }
}
