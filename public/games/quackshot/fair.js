// The fairground behind and beside the stall — the 2D page's bg photo made real — and the blue-hour sky over it.
// Everything here is background: kept quiet (low contrast, far enough to fall into the depth-of-field bokeh) so the
// target and the stations read first (Demolition lesson: quiet backgrounds).
//   sky        deep blue going to a dusky band on the horizon, slow cloud streaks lit from below by the fair
//   wheel      a Ferris wheel on the left, turning, bulbs on its rim and spokes
//   carousel   a striped canopy on the right, turning, ringed in bulbs, lit from inside
//   stalls     a row of distant booths with bulb strings; light poles; bunting
//   fireworks  round 6 (fx.js spawns them over the wheel; FINAL ROUND · DOUBLE POINTS)
import * as THREE from 'three';
import { Beacons } from '../lib3d/beacons.js';
import { NOISE } from '../limbo/common.js';
import { rng } from './common.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const WARM = ['#ffd38a', '#ffe9b8', '#ffb35c'], CANDY = ['#ff5a7a', '#ffd38a', '#7ad8ff', '#ffe9b8', '#ff9a3a'];

const SKY_VS = `varying vec3 vDir;void main(){vDir=normalize(position);vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_Position.z=gl_Position.w*.99999;}`;
const SKY_FS = `uniform float uTime;varying vec3 vDir;${NOISE}
void main(){
  vec3 d=normalize(vDir);float h=d.y;
  // blue hour: near-black navy overhead, cobalt mid-sky, a dusky violet then warm haze on the horizon
  vec3 zen=vec3(.006,.012,.05),mid=vec3(.02,.05,.2),low=vec3(.09,.07,.2),hor=vec3(.32,.14,.16);
  vec3 c=mix(hor,low,smoothstep(-.02,.06,h));c=mix(c,mid,smoothstep(.05,.3,h));c=mix(c,zen,smoothstep(.3,.85,h));
  // the fair's glow on the horizon, warmest behind the stall
  c+=vec3(.5,.24,.1)*exp(-max(h,0.)*14.)*(.55+.45*smoothstep(-.6,.4,-d.z));
  // cloud streaks: long, slow, their undersides lit by the fair
  vec2 uv=vec2(atan(d.x,-d.z)*2.2,h*7.)+vec2(uTime*.004,0.);
  float cl=smoothstep(.48,.78,gf(uv*vec2(1.,3.2)+vec2(0.,1.7)))*smoothstep(.02,.16,h)*(1.-smoothstep(.45,.8,h));
  c=mix(c,vec3(.05,.06,.16)+vec3(.2,.09,.07)*(1.-smoothstep(.05,.35,h)),cl*.75);
  // a few early stars overhead
  vec2 sp=floor(d.xz/max(h,.05)*90.);float st=step(.9975,gh(sp))*smoothstep(.35,.7,h)*(1.-cl);
  c+=vec3(.6,.7,1.)*st*.6;
  gl_FragColor=vec4(c,1.);
}`;

export class Fair {
    constructor(engine) {
        this.engine = engine;
        const S = engine.scene;
        this.group = new THREE.Group(); S.add(this.group);
        const R = rng(42);
        // sky dome (drawn behind everything)
        this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), new THREE.ShaderMaterial({ uniforms: { uTime: engine.time }, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false }));
        this.sky.renderOrder = -10; this.sky.frustumCulled = false;
        this.group.add(this.sky);
        S.background = null;
        // ground: dark trodden gravel, far out
        const ground = new THREE.Mesh(new THREE.CircleGeometry(300, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#17110f', roughness: 0.92 }));
        ground.position.y = -0.01; ground.receiveShadow = true; this.group.add(ground);
        this.lights = new Beacons(S, engine.time);
        this.dark = new THREE.MeshStandardMaterial({ color: '#2a2230', roughness: 0.7, metalness: 0.3 });
        this.buildWheel(R);
        this.buildCarousel(R);
        this.buildStalls(R);
        this.lights.build();
        this.lights.mat.uniforms.uScale.value = 1100;
    }

    /** a Ferris wheel, left and behind: rim, spokes, gondolas, A-frame; turns slowly */
    buildWheel(R) {
        const W = new THREE.Group(); W.position.set(-34, 0, -46); this.group.add(W);
        const r = 13, hub = r + 2.2;
        const steel = new THREE.MeshStandardMaterial({ color: '#c9c3cf', roughness: 0.45, metalness: 0.7 });
        // the A-frame legs
        for (const s of [-1, 1]) for (const z of [-1.6, 1.6]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, Math.hypot(hub, 5.5), 8), steel);
            leg.position.set(s * 2.75, hub / 2, z); leg.rotation.z = -s * Math.atan2(5.5, hub); W.add(leg);
        }
        const wheel = new THREE.Group(); wheel.position.y = hub; W.add(wheel); this.wheel = wheel;
        for (const z of [-1.2, 1.2]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.16, 8, 96), steel); rim.position.z = z; wheel.add(rim); }
        const n = 24;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU;
            const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, r, 5), steel);
            sp.position.set(Math.cos(a) * r / 2, Math.sin(a) * r / 2, 0); sp.rotation.z = a - Math.PI / 2; wheel.add(sp);
        }
        // bulbs ride the wheel: the Beacons points are added to the wheel group so they turn with it
        const bulbs = new Beacons(this.engine.scene, this.engine.time);
        for (let i = 0; i < 120; i++) { const a = (i / 120) * TAU; bulbs.add(V(Math.cos(a) * r, Math.sin(a) * r, 1.3), { color: CANDY[i % CANDY.length], size: 0.55, steady: 1 }); }
        for (let i = 0; i < n; i++) for (let k = 1; k < 6; k++) { const a = (i / n) * TAU, rr = (k / 6) * r; bulbs.add(V(Math.cos(a) * rr, Math.sin(a) * rr, 1.3), { color: WARM[k % 3], size: 0.4, rate: 0.6, phase: k / 6 + i * 0.01, steady: 0.35 }); }
        bulbs.add(V(0, 0, 1.5), { color: '#fff3d8', size: 2.6, steady: 1 });
        bulbs.build(); bulbs.mat.uniforms.uScale.value = 1100;
        this.engine.scene.remove(bulbs.points); wheel.add(bulbs.points);
        // gondolas hang from the rim (counter-rotated so they stay level)
        this.gondolas = [];
        const cabMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.2, emissive: new THREE.Color(c), emissiveIntensity: 0.25 });
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * TAU, g = new THREE.Group();
            g.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
            const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.7, 1.3, 10, 1, true), cabMat(CANDY[i % 5])); cab.position.y = -1.3; g.add(cab);
            const roof = new THREE.Mesh(new THREE.ConeGeometry(1.05, 0.6, 10), cabMat('#f2e6c9')); roof.position.y = -0.4; g.add(roof);
            wheel.add(g); this.gondolas.push(g);
        }
    }

    /** a carousel on the right: striped canopy, band of bulbs, lit from within; turns */
    buildCarousel(R) {
        const C = new THREE.Group(); C.position.set(30, 0, -36); this.group.add(C);
        const c = document.createElement('canvas'); c.width = 1024; c.height = 64;
        const g = c.getContext('2d'); const cols = ['#d3212f', '#f4ead2', '#1f8fc0', '#f4ead2'];
        for (let i = 0; i < 24; i++) { g.fillStyle = cols[i % 4]; g.fillRect((i * 1024) / 24, 0, 1024 / 24 + 1, 64); }
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
        const canvasMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.22, side: THREE.DoubleSide });
        const spin = new THREE.Group(); C.add(spin); this.carousel = spin;
        const canopy = new THREE.Mesh(new THREE.ConeGeometry(8.5, 4.2, 48, 1, true), canvasMat); canopy.position.y = 8.6; spin.add(canopy);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 1.1, 48, 1, true), canvasMat); band.position.y = 6.0; spin.add(band);
        const fin = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.8, 10), new THREE.MeshStandardMaterial({ color: '#e0b04a', metalness: 1, roughness: 0.3 })); fin.position.y = 11.5; spin.add(fin);
        const col = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 6.5, 16), new THREE.MeshStandardMaterial({ color: '#3a2a50', roughness: 0.5, emissive: new THREE.Color('#ff9a50'), emissiveIntensity: 0.2 })); col.position.y = 3.25; spin.add(col);
        const deck = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 8.4, 0.6, 48), new THREE.MeshStandardMaterial({ color: '#5a2a30', roughness: 0.6 })); deck.position.y = 0.3; spin.add(deck);
        for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5.4, 6), new THREE.MeshStandardMaterial({ color: '#e0b04a', metalness: 1, roughness: 0.3 })); pole.position.set(Math.cos(a) * 6.4, 3.2, Math.sin(a) * 6.4); spin.add(pole); }
        const bulbs = new Beacons(this.engine.scene, this.engine.time);
        for (let i = 0; i < 96; i++) { const a = (i / 96) * TAU; bulbs.add(V(Math.cos(a) * 8.6, 5.45, Math.sin(a) * 8.6), { color: WARM[i % 3], size: 0.45, rate: 1.2, phase: (i % 6) / 6, steady: 0.5 }); }
        for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; bulbs.add(V(Math.cos(a) * 4.6, 9.2, Math.sin(a) * 4.6), { color: CANDY[i % 5], size: 0.4, steady: 1 }); }
        bulbs.build(); bulbs.mat.uniforms.uScale.value = 1100;
        this.engine.scene.remove(bulbs.points); spin.add(bulbs.points);
        const glow = new THREE.PointLight('#ffb070', 160, 26, 2); glow.position.set(0, 4.5, 0); C.add(glow);
    }

    /** distant booths with bulb strings, light poles and bunting: the fair going on around the stall */
    buildStalls(R) {
        const roofCols = ['#d3212f', '#1f8fc0', '#f4c430', '#7a3ac8', '#2fa36a'];
        const booth = (x, z, w, rot) => {
            const G = new THREE.Group(); G.position.set(x, 0, z); G.rotation.y = rot; this.group.add(G);
            const body = new THREE.Mesh(new THREE.BoxGeometry(w, 3.2, 3), new THREE.MeshStandardMaterial({ color: '#2b2036', roughness: 0.8, emissive: new THREE.Color('#ffb070'), emissiveIntensity: 0.05 }));
            body.position.y = 1.6; G.add(body);
            // the booth's lit front: warm, striped, dim enough to sit back in the haze
            const fc = roofCols[Math.floor(R() * 5)];
            const ft = document.createElement('canvas'); ft.width = 64; ft.height = 16; const fg = ft.getContext('2d');
            for (let k = 0; k < 8; k++) { fg.fillStyle = k % 2 ? fc : '#ffe2b0'; fg.fillRect(k * 8, 0, 8, 16); }
            const ftex = new THREE.CanvasTexture(ft); ftex.colorSpace = THREE.SRGBColorSpace;
            const lit = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.86, 1.7), new THREE.MeshBasicMaterial({ map: ftex, color: new THREE.Color(0.55, 0.42, 0.32) }));
            lit.position.set(0, 1.6, 1.51); G.add(lit);
            const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.75, 1.6, 4, 1), new THREE.MeshStandardMaterial({ color: roofCols[Math.floor(R() * 5)], roughness: 0.7 }));
            roof.position.y = 4.0; roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 3 / w * 1.4); G.add(roof);
            for (let i = 0; i <= 10; i++) {
                const u = i / 10, p = V((u - 0.5) * w, 3.15 - Math.sin(u * Math.PI) * 0.35, 1.6).applyEuler(new THREE.Euler(0, rot, 0)).add(G.position);
                this.lights.add(p, { color: WARM[i % 3], size: 0.3, rate: 0.8, phase: u, steady: 0.6 });
            }
        };
        let x = -70;
        while (x < 70) { const w = 4 + R() * 3; if (Math.abs(x) > 12) booth(x, -62 - R() * 10, w, (R() - 0.5) * 0.3); x += w + 2 + R() * 4; }
        for (const [bx, bz, r] of [[-18, -24, 0.5], [-24, -14, 1.0], [20, -22, -0.6], [26, -12, -1.1], [-46, -30, 0.3], [48, -50, -0.2]]) booth(bx, bz, 4.5, r);
        // light poles with a cluster each, and bunting strung between them
        const poles = [[-14, -16], [-22, -30], [15, -18], [22, -32], [-40, -20], [40, -24]];
        const flagCols = ['#d3212f', '#f4c430', '#1f8fc0', '#2fa36a', '#f4ead2', '#ff5a9a'];
        const flags = []; const flagCol = [];
        for (const [px, pz] of poles) {
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 9, 6), this.dark); pole.position.set(px, 4.5, pz); this.group.add(pole);
            for (let k = 0; k < 4; k++) this.lights.add(V(px + (k - 1.5) * 0.4, 9.1, pz), { color: '#fff0d0', size: 0.9, steady: 1 });
        }
        const string = (a, b) => {
            for (let i = 0; i < 22; i++) {
                const u = (i + 0.5) / 22, p = V(a[0] + (b[0] - a[0]) * u, 8.4 - Math.sin(u * Math.PI) * 1.6, a[1] + (b[1] - a[1]) * u);
                flags.push(p); flagCol.push(flagCols[i % flagCols.length]);
            }
        };
        string(poles[0], poles[1]); string(poles[2], poles[3]); string(poles[0], poles[4]); string(poles[2], poles[5]);
        const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.32, 0, 0, 0.32, 0, 0, 0, -0.62, 0], 3)); tri.computeVertexNormals();
        const bunt = new THREE.InstancedMesh(tri, new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.12 }), flags.length);
        const o = new THREE.Object3D();
        flags.forEach((p, i) => { o.position.copy(p); o.rotation.set(0, R() * 0.6 - 0.3, R() * 0.2 - 0.1); o.updateMatrix(); bunt.setMatrixAt(i, o.matrix); bunt.setColorAt(i, new THREE.Color(flagCol[i])); });
        this.group.add(bunt);
        // far bokeh: a scatter of fair lights beyond everything
        for (let i = 0; i < 160; i++) {
            const a = (R() - 0.5) * Math.PI * 1.3, d = 75 + R() * 60;
            this.lights.add(V(Math.sin(a) * d, 0.8 + R() * 7, -Math.cos(a) * d), { color: CANDY[i % 5], size: 0.6 + R() * 0.8, rate: 0.3 + R(), phase: R(), steady: R() < 0.5 ? 1 : 0.4 });
        }
    }

    /** round 6: the whole fair runs faster */
    setFinal(on) { this.final = !!on; }

    update(dt) {
        const k = this.final ? 1.8 : 1;
        this.wheel.rotation.z += dt * 0.045 * k;
        for (const g of this.gondolas) g.rotation.z = -this.wheel.rotation.z;
        this.carousel.rotation.y += dt * 0.22 * k;
    }
}
