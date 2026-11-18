// The pool: a striped tin trough of water along the foot of the target, between the board and the counter (the bg
// photo's duck pond). Rubber ducks bob in it; a miss lands in it with a plume (plan §4: "a miss splashes into the pool
// in front"). The water is a glossy surface with a scrolling normal map, so it catches the bulbs in the image light.
import * as THREE from 'three';
import { rubberDuckInstances } from './duck.js';
import { rng } from './common.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
export const POOL = { x0: -5.6, x1: 5.6, z0: 0.35, z1: 2.5, y: 0.95 };

function normalTexture() {
    // a tileable ripple normal map from summed sines
    const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), img = g.createImageData(N, N);
    const h = (x, y) => Math.sin((x / N) * TAU * 3 + Math.sin((y / N) * TAU * 2) * 1.2) * 0.5 + Math.sin((y / N) * TAU * 5 + (x / N) * TAU) * 0.35 + Math.sin(((x + y) / N) * TAU * 7) * 0.15;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
        const n = new THREE.Vector3(-dx * 2, -dy * 2, 1).normalize(), i = (y * N + x) * 4;
        img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 1);
    return t;
}

export class Pool {
    constructor(engine) {
        this.engine = engine;
        const G = (this.group = new THREE.Group()); engine.scene.add(G);
        const P = POOL, w = P.x1 - P.x0, d = P.z1 - P.z0, cx = (P.x0 + P.x1) / 2, cz = (P.z0 + P.z1) / 2;
        // the trough: candy-striped tin sides, a gilt lip
        const sc = document.createElement('canvas'); sc.width = 1024; sc.height = 16; const sg = sc.getContext('2d');
        for (let i = 0; i < 32; i++) { sg.fillStyle = i % 2 ? '#f4ead2' : '#1f8fc0'; sg.fillRect(i * 32, 0, 33, 16); }
        const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
        const tin = new THREE.MeshPhysicalMaterial({ map: st, roughness: 0.35, metalness: 0.2, clearcoat: 0.5 });
        const front = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, P.y + 0.12, 0.08), tin); front.position.set(cx, (P.y + 0.12) / 2, P.z1); G.add(front);
        for (const x of [P.x0 - 0.06, P.x1 + 0.06]) { const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, P.y + 0.12, d), tin); side.position.set(x, (P.y + 0.12) / 2, cz); G.add(side); }
        const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, w + 0.25, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e2b24e', metalness: 0.95, roughness: 0.28 }));
        lip.position.set(cx, P.y + 0.12, P.z1); G.add(lip);
        // the water
        this.normal = normalTexture();
        this.water = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshPhysicalMaterial({ color: '#0a3550', roughness: 0.06, metalness: 0.05, normalMap: this.normal, normalScale: new THREE.Vector2(0.35, 0.35), clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.5 }));
        this.water.rotation.x = -Math.PI / 2; this.water.position.set(cx, P.y, cz); this.water.receiveShadow = true; G.add(this.water);
        // rubber ducks bobbing
        const R = rng(23);
        this.n = 9;
        this.ducks = rubberDuckInstances(this.n, { variant: 'A', lod: 2 });
        this.bob = [];
        for (let i = 0; i < this.n; i++) this.bob.push({ x: P.x0 + 0.6 + ((i + R() * 0.6) / this.n) * (w - 1.2), z: P.z0 + 0.4 + R() * (d - 0.8), yaw: R() * TAU, ph: R() * TAU, s: 0.28 + R() * 0.08, vx: (R() - 0.5) * 0.06 });
        G.add(this.ducks);
        // ripples: expanding rings on the surface
        this.rings = [];
        this.ringGeo = new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2);
        this.time = 0;
    }

    /** where a missed dart comes down: under where it would have hit, in the water */
    landing(x) { const P = POOL; return V(Math.max(P.x0 + 0.4, Math.min(P.x1 - 0.4, x * 1.3)), P.y, (P.z0 + P.z1) / 2 + 0.2); }

    /** a plume where something hit the water */
    plume(p, fx) {
        for (let k = 0; k < 3; k++) {
            const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: '#d8f2ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
            m.position.set(p.x, POOL.y + 0.01, p.z); this.group.add(m);
            this.rings.push({ m, t: -k * 0.18 });
        }
        if (fx) fx.plume(V(p.x, POOL.y, p.z));
    }
    get busy() { return this.rings.length > 0; }

    update(dt) {
        this.time += dt;
        this.normal.offset.set(this.time * 0.02, this.time * 0.013);
        const o = new THREE.Object3D(), P = POOL;
        this.bob.forEach((b, i) => {
            b.x += b.vx * dt; if (b.x < P.x0 + 0.4 || b.x > P.x1 - 0.4) b.vx = -b.vx;
            o.position.set(b.x, P.y - 0.02 + Math.sin(this.time * 1.6 + b.ph) * 0.015, b.z);
            o.rotation.set(Math.sin(this.time * 1.3 + b.ph) * 0.06, b.yaw + this.time * 0.05, Math.sin(this.time * 1.1 + b.ph * 2) * 0.05);
            o.scale.setScalar(b.s); o.updateMatrix(); this.ducks.setMatrixAt(i, o.matrix);
        });
        this.ducks.instanceMatrix.needsUpdate = true;
        for (let i = this.rings.length - 1; i >= 0; i--) {
            const r = this.rings[i]; r.t += dt;
            const u = Math.max(0, r.t) / 1.2;
            r.m.scale.setScalar(0.05 + u * 1.1); r.m.material.opacity = r.t < 0 ? 0 : 0.6 * (1 - u);
            if (u >= 1) { this.group.remove(r.m); r.m.material.dispose(); this.rings.splice(i, 1); }
        }
    }
}
