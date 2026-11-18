// A team's tower: stepped art-deco blocks on a lit plinth, the team's name on an LED ticker, a ring of light on the
// ground and a crown (beacon, flag, rooftop name sign) riding on the highest block still standing.
//
// The standing tower is always laid out from the score: blocks are in build order, bottom floor first, so a score of
// n is exactly the first n blocks (mesh.count = n). Destruction removes from the top; physics only ever owns copies.
import * as THREE from 'three';
import { blockMesh, FLOOR_H, CELL } from './blocks.js';

export const PLINTH_H = 0.5;

/** floors: [cols, rows, scaleXZ] bottom to top */
const SPEC = {
    main: [...Array(13).fill([4, 3, 1]), [3, 3, 1], [3, 3, 1], [2, 2, 1], [1, 1, 0.72], [1, 1, 0.46]],
    playoff: [[4, 3, 1], [4, 3, 1], [4, 3, 1], [3, 3, 1], [3, 3, 1], [2, 2, 1], [1, 1, 0.72], [1, 1, 0.46]],
};

function buildLayout(spec) {
    const blocks = [], floors = [];
    spec.forEach(([cols, rows, s], f) => {
        const y = PLINTH_H + f * FLOOR_H + FLOOR_H / 2;
        const start = blocks.length;
        // back row first, left to right, so the front-right block of the top floor is always the first to go
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
            blocks.push({ x: (i - (cols - 1) / 2) * CELL, y, z: (j - (rows - 1) / 2) * CELL, s, floor: f });
        }
        floors.push({ start, count: cols * rows, cols, rows, s, y, x0: -cols / 2 * CELL, z0: -rows / 2 * CELL });
    });
    return { blocks, floors, total: blocks.length };
}
export const LAYOUTS = { main: buildLayout(SPEC.main), playoff: buildLayout(SPEC.playoff) };

// ---------------------------------------------------------------- canvas text (ticker + sign)
function textCanvas(text, { w = 1024, h = 128, font = '900 92px "Avenir Next Condensed","DIN Condensed","Arial Narrow",Arial,sans-serif', pad = 0 } = {}) {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    ctx.font = font;
    const tw = Math.ceil(ctx.measureText(text).width) + pad * 2;
    c.width = Math.max(w, THREE.MathUtils.ceilPowerOfTwo(tw)); c.height = h;
    ctx.font = font; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, h);
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(text, c.width / 2, h / 2 + 4);
    return { canvas: c, textW: tw };
}

const LED_FS = `uniform sampler2D tMap;uniform vec3 uCol;uniform float uTime,uScroll,uAspect,uDots;varying vec2 vUv;
void main(){
  vec2 grid=vec2(uDots*uAspect,uDots);
  vec2 uv=vUv;uv.x=fract(uv.x+uTime*.07*uScroll);
  vec2 cell=floor(uv*grid)+.5,f=fract(uv*grid)-.5;
  float on=texture2D(tMap,cell/grid).r;
  float dot_=1.-smoothstep(.28,.42,length(f));
  vec3 off=vec3(.012,.012,.016);
  vec3 c=mix(off,uCol*5.,on)*dot_+off*.4;
  gl_FragColor=vec4(c,1.);
}`;
const LED_VS = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';

export class Tower {
    constructor(engine, material, { index, color, name, layout = 'main' }) {
        this.engine = engine; this.index = index; this.name = name;
        this.color = new THREE.Color(color);
        this.group = new THREE.Group();
        this.layoutName = layout; this.layout = LAYOUTS[layout];
        this.mesh = blockMesh(material, LAYOUTS.main.total);
        this.group.add(this.mesh);
        this.standing = this.layout.total;
        this.anim = null; // build-in animation per block
        this.fillBlocks();
        this.buildPlinth();
        this.buildCrown();
        this.crownY = this.topY(); this.crownV = 0; this.crownX = 0; this.crownZ = 0;
        this.inv = new THREE.Matrix4();
    }

    place(x, z, yaw) {
        this.group.position.set(x, 0, z); this.group.rotation.y = yaw;
        this.group.updateMatrixWorld(true);
        this.inv.copy(this.group.matrixWorld).invert();
    }

    fillBlocks() {
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), hsl = {};
        this.color.getHSL(hsl);
        const seed = this.mesh.userData.seed;
        this.layout.blocks.forEach((b, i) => {
            m.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(b.s, 1, b.s));
            this.mesh.setMatrixAt(i, m);
            // a touch of value variation brick to brick so the facade doesn't read as one plastic slab
            const v = Math.sin(i * 12.9898 + this.index * 7.1) * 43758.5453 % 1;
            c.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l * (0.93 + Math.abs(v) * 0.12), 0, 1));
            this.mesh.setColorAt(i, c);
            seed.array[i] = 1 + i + this.index * 1000;
        });
        this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; seed.needsUpdate = true;
        this.mesh.count = this.standing;
    }

    setLayout(name) { this.layoutName = name; this.layout = LAYOUTS[name]; this.standing = Math.min(this.standing, this.layout.total); this.fillBlocks(); }

    setStanding(n) {
        this.standing = THREE.MathUtils.clamp(n | 0, 0, this.layout.total);
        if (!this.anim) this.mesh.count = this.standing;
    }

    /** local transform of block i (for handing it to physics) */
    blockWorld(i, outPos, outQuat, outScale) {
        const b = this.layout.blocks[i];
        outPos.set(b.x, b.y, b.z).applyMatrix4(this.group.matrixWorld);
        outQuat.setFromEuler(this.group.rotation);
        if (outScale) outScale.set(b.s, 1, b.s);
        return b;
    }

    /** world-space height of the top of the highest standing block */
    topY(n = this.standing) { return n <= 0 ? PLINTH_H : this.layout.blocks[n - 1].y + FLOOR_H / 2; }

    /** centroid (local x,z) of the highest standing floor */
    topCentroid(n = this.standing) {
        if (n <= 0) return [0, 0];
        const f = this.layout.blocks[n - 1].floor, F = this.layout.floors[f];
        let x = 0, z = 0, k = 0;
        for (let i = F.start; i < Math.min(n, F.start + F.count); i++) { x += this.layout.blocks[i].x; z += this.layout.blocks[i].z; k++; }
        return [x / k, z / k];
    }

    /**
     * static collision for debris: if world point p is inside a standing block (or the plinth), return the push-out
     * {nx,ny,nz,depth} in world space; else null
     */
    solidAt(p, out) {
        const l = TMP.copy(p).applyMatrix4(this.inv);
        if (l.y < PLINTH_H) {
            const hx = 2.8, hz = 2.3;
            if (Math.abs(l.x) < hx && Math.abs(l.z) < hz && l.y > 0) return this.push(l, 0, PLINTH_H / 2, 0, hx, PLINTH_H / 2, hz, out);
            return null;
        }
        const f = Math.floor((l.y - PLINTH_H) / FLOOR_H), L = this.layout;
        if (f < 0 || f >= L.floors.length) return null;
        const F = L.floors[f];
        if (F.start >= this.standing) return null;
        const half = CELL * F.s / 2;
        let ci, cj;
        if (F.cols === 1) { if (Math.abs(l.x) > half || Math.abs(l.z) > half) return null; ci = 0; cj = 0; }
        else {
            ci = Math.floor((l.x - F.x0) / CELL); cj = Math.floor((l.z - F.z0) / CELL);
            if (ci < 0 || cj < 0 || ci >= F.cols || cj >= F.rows) return null;
        }
        const idx = F.start + cj * F.cols + ci;
        if (idx >= this.standing) return null;
        const b = L.blocks[idx];
        return this.push(l, b.x, b.y, b.z, half, FLOOR_H / 2, half, out);
    }
    push(l, cx, cy, cz, hx, hy, hz, out) {
        const dx = l.x - cx, dy = l.y - cy, dz = l.z - cz;
        const px = hx - Math.abs(dx), py = hy - Math.abs(dy), pz = hz - Math.abs(dz);
        if (px <= 0 || py <= 0 || pz <= 0) return null;
        let n;
        if (py <= px && py <= pz) { n = TMPN.set(0, Math.sign(dy) || 1, 0); out.depth = py; }
        else if (px <= pz) { n = TMPN.set(Math.sign(dx) || 1, 0, 0); out.depth = px; }
        else { n = TMPN.set(0, 0, Math.sign(dz) || 1); out.depth = pz; }
        n.transformDirection(this.group.matrixWorld);
        out.nx = n.x; out.ny = n.y; out.nz = n.z;
        return out;
    }

    // ------------------------------------------------------------ plinth, ticker, ground ring
    buildPlinth() {
        const g = this.group;
        const conc = new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.82, metalness: 0 });
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(5.6, PLINTH_H, 4.6), conc);
        plinth.position.y = PLINTH_H / 2; plinth.castShadow = plinth.receiveShadow = true;
        g.add(plinth);
        // steel kerb with a hazard band on top edge
        const kerb = new THREE.Mesh(new THREE.BoxGeometry(5.7, 0.06, 4.7), new THREE.MeshStandardMaterial({ color: '#15171b', roughness: 0.4, metalness: 0.7 }));
        kerb.position.y = PLINTH_H + 0.03; kerb.receiveShadow = true; g.add(kerb);
        // LED ticker on the front face
        const W = 4.8, H = 0.3;
        const { canvas, textW } = textCanvas(this.name.toUpperCase(), { w: 64 * W / H, h: 64, font: '900 50px "Avenir Next Condensed","DIN Condensed","Arial Narrow",Arial,sans-serif', pad: 30 });
        const tex = new THREE.CanvasTexture(canvas); tex.wrapS = THREE.RepeatWrapping; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
        // long names scroll; short ones sit centred
        this.ledU = { tMap: { value: tex }, uCol: { value: this.color.clone() }, uTime: this.engine.time, uScroll: { value: textW > 64 * W / H ? 1 : 0 }, uAspect: { value: W / H }, uDots: { value: 22 } };
        const led = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.ShaderMaterial({ uniforms: this.ledU, vertexShader: LED_VS, fragmentShader: LED_FS }));
        led.position.set(0, PLINTH_H * 0.5, 2.302);
        g.add(led);
        // ring of light on the ground in the team colour
        const ringU = { uCol: { value: this.color.clone() }, uTime: this.engine.time, uPulse: { value: 0 } };
        const ring = new THREE.Mesh(new THREE.RingGeometry(3.3, 4.6, 96, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
            uniforms: ringU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
            vertexShader: 'varying vec2 vP;void main(){vP=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
            fragmentShader: `uniform vec3 uCol;uniform float uTime,uPulse;varying vec2 vP;
void main(){float r=length(vP),a=atan(vP.y,vP.x);
  float line=exp(-pow((r-3.62)/.035,2.))*1.6+exp(-pow((r-3.62)/.32,2.))*.22;
  float dash=step(.5,fract(a*9.549+uTime*.15))*exp(-pow((r-4.15)/.05,2.))*.9;
  float k=(line+dash)*(1.+uPulse*2.);
  gl_FragColor=vec4(uCol*k*1.4,1.);}`,
        }));
        ring.position.y = 0.012; ring.renderOrder = 2;
        this.ring = ring; this.ringU = ringU;
        g.add(ring);
    }

    // ------------------------------------------------------------ crown
    buildCrown() {
        const c = new THREE.Group();
        const steel = new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.35, metalness: 0.85 });
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.14, 24), steel);
        base.position.y = 0.07; base.castShadow = true; c.add(base);
        const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.2, 20), steel);
        housing.position.y = 0.24; c.add(housing);
        const hc = this.color.clone().multiplyScalar(9);
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.22, 20), new THREE.MeshBasicMaterial({ color: hc }));
        lens.position.y = 0.45; c.add(lens);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.155, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), steel);
        cap.position.y = 0.56; c.add(cap);
        // rotating sweep: two crossed additive fans out of the lens
        const sweep = new THREE.Group(); sweep.position.y = 0.45;
        const fanMat = new THREE.ShaderMaterial({
            uniforms: { uCol: { value: this.color.clone() } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
            vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
            fragmentShader: 'uniform vec3 uCol;varying vec2 vUv;void main(){float x=vUv.x,y=abs(vUv.y-.5)*2.;float k=pow(1.-x,2.)*exp(-y*y/(.02+x*.5)*1.);gl_FragColor=vec4(uCol*k*1.6,1.);}',
        });
        for (const s of [1, -1]) {
            const fan = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.7).translate(1.2 + 0.15, 0, 0), fanMat);
            fan.rotation.y = s > 0 ? 0 : Math.PI; sweep.add(fan);
        }
        c.add(sweep); this.sweep = sweep;
        // flag on a pole at the back corner
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 2.1, 8), steel);
        pole.position.set(-0.32, 1.05, -0.2); pole.castShadow = true; c.add(pole);
        const flagMat = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.7, side: THREE.DoubleSide, emissive: this.color, emissiveIntensity: 0.25 });
        const flagU = { uTime: this.engine.time };
        flagMat.onBeforeCompile = (sh) => {
            Object.assign(sh.uniforms, flagU);
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
                .replace('#include <begin_vertex>', `#include <begin_vertex>
float fx=position.x+.55;transformed.z+=sin(fx*4.2-uTime*7.)*.09*fx+sin(fx*9.-uTime*11.)*.025*fx;transformed.y-=fx*fx*.06;`);
            sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
{float d=abs(vFlagUv.y-.5)-(.5-vFlagUv.x*.9);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.92),step(0.,d)*step(d,.09));}`)
                .replace('#include <common>', '#include <common>\nvarying vec2 vFlagUv;');
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vFlagUv;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvFlagUv=uv;');
        };
        flagMat.customProgramCacheKey = () => 'dflag';
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.62, 16, 4), flagMat);
        flag.position.set(-0.32 + 0.55, 1.75, -0.2); flag.castShadow = true;
        c.add(flag); this.flag = flag;
        // rooftop name sign: open frame letters on two legs, facing the yard
        const { canvas } = textCanvas(this.name.toUpperCase(), { w: 512, h: 128, font: '900 96px "Avenir Next Condensed","DIN Condensed","Arial Narrow",Arial,sans-serif', pad: 20 });
        const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
        const aspect = canvas.width / canvas.height;
        const sw = Math.min(2.6, 0.42 * aspect), sh = sw / aspect;
        const signMat = new THREE.ShaderMaterial({
            uniforms: { tMap: { value: tex }, uCol: { value: this.color.clone() }, uPow: { value: 1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
            vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
            fragmentShader: `uniform sampler2D tMap;uniform vec3 uCol;uniform float uPow;varying vec2 vUv;
void main(){float a=texture2D(tMap,vUv).r;float g=0.;for(int i=0;i<8;i++){float an=float(i)*.785;g+=texture2D(tMap,vUv+vec2(cos(an),sin(an))*.012).r;}g/=8.;
  vec3 c=vec3(1.,.97,.92)*a*6.+uCol*g*(1.-a)*3.;gl_FragColor=vec4(c*uPow,max(a,g*.6));}`,
        });
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), signMat);
        sign.position.set(0, 0.95, 0.42); c.add(sign);
        for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.75, 0.04), steel); leg.position.set(s * sw * 0.35, 0.45, 0.4); c.add(leg); }
        this.crown = c;
        this.group.add(c);
    }

    // ------------------------------------------------------------ drop-in rebuild (blocks fall into place floor by floor)
    /** blocks from index `from` up to n drop into place (from = 0: the whole tower; a bust passes the current height) */
    dropIn(n, { from = 0, stagger = 0.012, height = 7 } = {}) {
        from = Math.min(from, this.standing);
        this.setStanding(n);
        this.anim = { t: 0, n, from, stagger, height };
        this.mesh.count = n;
        this.crownY = this.topY(n) + height + 2; this.crownV = 0;
    }

    dispose(shared) {
        this.group.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
            for (const m of ms) { if (m === shared) continue; for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose(); if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value && u.value.isTexture) u.value.dispose(); m.dispose(); }
        });
    }

    update(dt, t) {
        this.sweep.rotation.y = t * 2.6 + this.index;
        // crown rides on the top floor; falls under gravity and bounces when floors are taken from under it
        const target = this.topY(), [cx, cz] = this.topCentroid();
        this.crownX += (cx - this.crownX) * (1 - Math.exp(-6 * dt)); this.crownZ += (cz - this.crownZ) * (1 - Math.exp(-6 * dt));
        if (this.crownY > target + 0.001 || this.crownV > 0) {
            this.crownV -= 22 * dt; this.crownY += this.crownV * dt;
            if (this.crownY <= target) { this.crownY = target; this.crownV = this.crownV < -2 ? -this.crownV * 0.28 : 0; }
        } else this.crownY = target;
        this.crown.position.set(this.crownX, this.crownY, this.crownZ);
        this.crown.visible = this.standing > 0;
        if (this.anim) this.animate(dt);
    }

    animate(dt) {
        const A = this.anim; A.t += dt;
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
        let done = true;
        for (let i = 0; i < A.n; i++) {
            const b = this.layout.blocks[i];
            const lt = i < A.from ? 99 : A.t - (i - A.from) * A.stagger;
            let y = b.y;
            if (lt < 0) { y = b.y + A.height + 40; done = false; }
            else {
                // fall, then two quick bounces
                const T = Math.sqrt(2 * A.height / 30);
                if (lt < T) { y = b.y + A.height - 15 * lt * lt; done = false; }
                else { const u = lt - T, b1 = 0.16; if (u < b1 * 2) { y = b.y + Math.max(0, 0.18 * (1 - ((u - b1) / b1) ** 2)); done = false; } }
            }
            m.compose(p.set(b.x, y, b.z), q, s.set(b.s, 1, b.s));
            this.mesh.setMatrixAt(i, m);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
        if (done) { this.anim = null; this.fillBlocks(); }
        return done;
    }
}

const TMP = new THREE.Vector3(), TMPN = new THREE.Vector3();
