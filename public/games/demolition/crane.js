// Tower cranes. One big crane stands behind the arc of towers and works every lane: its jib slews and its trolley
// runs out so the wrecking ball hangs beside whichever tower is up. Background cranes are the same model, idling.
// Lattice members are boxes whose faces are cut into chords, rungs and diagonals in the shader, so a whole mast is
// a single box that still throws a proper lattice shadow.
import * as THREE from 'three';

const LATTICE = `varying vec3 vLP;uniform vec3 uBox;uniform float uSeg;
bool latticeKeep(){
  vec3 h=uBox*.5;vec3 a=abs(vLP)/h;
  float t=.085;
  // which face are we on: the axis where we're at the surface
  float L=vLP.y+h.y;
  float across;float w;
  if(a.x>a.z){across=vLP.z;w=h.z;}else{across=vLP.x;w=h.x;}
  if(a.y>.999)return true;
  float chord=step(w-t,abs(across));
  float s=L/uSeg,fs=fract(s);float flip=mod(floor(s),2.);
  float rung=step(fs,t/uSeg)+step(1.-t/uSeg,fs);
  float u=across/(2.*w)+.5;if(flip>.5)u=1.-u;
  float diag=step(abs(fs-u),t/uSeg*1.6);
  return chord+rung+diag>.5;
}`;

function latticeMaterials(color, box, seg) {
    const U = { uBox: { value: new THREE.Vector3(...box) }, uSeg: { value: seg } };
    const inject = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP=position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + LATTICE)
            .replace('void main() {', 'void main() {\nif(!latticeKeep())discard;');
    };
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide });
    m.onBeforeCompile = inject; m.customProgramCacheKey = () => 'lat';
    const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    d.onBeforeCompile = inject; d.customProgramCacheKey = () => 'latd';
    return [m, d];
}

/** a lattice box with its long axis along local +y from 0 to len */
function lattice(w, len, d, color, seg = 1.6) {
    const [m, dm] = latticeMaterials(color, [w, len, d], seg);
    // the shader works in the box's own centred coordinates; the group's origin is the member's base
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, len, d), m);
    mesh.position.y = len / 2;
    const g = new THREE.Group(); g.add(mesh);
    mesh.customDepthMaterial = dm; mesh.castShadow = true;
    return g;
}

const YELLOW = '#b48a2c';

export class TowerCrane {
    /** base: Vector3, opts: mast height, jib length */
    constructor(scene, beacons, base, { mast = 26, jib = 32, counter = 11, color = YELLOW, hook = false } = {}) {
        this.root = new THREE.Group(); this.root.position.copy(base);
        this.mast = mast; this.jib = jib;
        const steel = new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 0.5, metalness: 0.7 });
        const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
        // foundation + mast
        const foot = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.8, 4.5), new THREE.MeshStandardMaterial({ color: '#3a3b3e', roughness: 0.9 }));
        foot.position.y = 0.4; foot.castShadow = foot.receiveShadow = true; this.root.add(foot);
        this.root.add(lattice(1.9, mast, 1.9, color, 1.9));
        // slewing part
        const slew = new THREE.Group(); slew.position.y = mast; this.root.add(slew); this.slew = slew;
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.6, 20), steel); ring.position.y = 0.3; slew.add(ring);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.7, 1.6), paint); cab.position.set(1.4, 1.2, 1.3); cab.castShadow = true; slew.add(cab);
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, 0.8) }));
        glass.position.set(1.4, 1.35, 2.11); slew.add(glass);
        // jib along +x, counter-jib along -x (lattice built along y, then laid down)
        const jibG = lattice(1.5, jib, 1.5, color, 1.6); jibG.rotation.z = -Math.PI / 2; jibG.position.set(0.8, 1.4, 0); slew.add(jibG);
        const cj = lattice(1.5, counter, 1.5, color, 1.6); cj.rotation.z = Math.PI / 2; cj.position.set(-0.8, 1.4, 0); slew.add(cj);
        const cw = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 1.8), new THREE.MeshStandardMaterial({ color: '#5b5c5e', roughness: 0.92 }));
        cw.position.set(-counter + 1.8, 0.9, 0); cw.castShadow = true; slew.add(cw);
        // peak + pendants
        const peak = lattice(1.2, 7, 1.2, color, 1.4); peak.position.set(0, 1.4, 0); slew.add(peak);
        const pend = (a, b) => {
            const len = a.distanceTo(b);
            const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 5), steel);
            c.position.copy(a).add(b).multiplyScalar(0.5);
            c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
            slew.add(c);
        };
        const top = new THREE.Vector3(0, 8.4, 0);
        pend(top, new THREE.Vector3(jib * 0.72, 2.1, 0)); pend(top, new THREE.Vector3(jib * 0.38, 2.1, 0)); pend(top, new THREE.Vector3(-counter + 0.6, 2.1, 0));
        // trolley
        this.trolley = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.7), steel);
        this.trolley.position.set(jib * 0.6, 0.45, 0); this.trolley.castShadow = true; slew.add(this.trolley);
        // aircraft warning lights: tips + peak (set as world points; updated by beacon positions each frame for the slewing ones)
        this.lights = [
            { local: new THREE.Vector3(jib + 0.6, 2.3, 0) }, { local: new THREE.Vector3(-counter, 2.3, 0) }, { local: new THREE.Vector3(0, 8.6, 0) },
        ];
        this.beacons = beacons;
        for (const L of this.lights) { L.b = { p: new THREE.Vector3(), color: new THREE.Color('#ff2a1a'), size: 0.9, rate: 0.75, phase: Math.random(), steady: 0 }; beacons.list.push(L.b); }
        scene.add(this.root);
        this.slewAngle = 0; this.slewTarget = 0; this.trolleyR = jib * 0.6; this.trolleyTarget = this.trolleyR;
        this.root.updateMatrixWorld(true);
        this.syncLights();
    }

    syncLights() {
        this.slew.updateMatrixWorld(true);
        for (const L of this.lights) L.b.p.copy(L.local).applyMatrix4(this.slew.matrixWorld);
    }
    /** beacons geometry has to be rebuilt-free: write positions straight into its buffer */
    pushLights() {
        const pts = this.beacons.points; if (!pts) return;
        const attr = pts.geometry.attributes.position;
        for (const L of this.lights) { const i = this.beacons.list.indexOf(L.b); attr.setXYZ(i, L.b.p.x, L.b.p.y, L.b.p.z); }
        attr.needsUpdate = true;
    }

    /** world point under the trolley's hook (pivot for the ball) */
    hookWorld(out) { return out.set(this.trolleyR, 0.1, 0).applyMatrix4(this.slew.matrixWorld); }

    /** aim the jib at a world xz and run the trolley to that radius */
    aimAt(x, z, snap = false) {
        const dx = x - this.root.position.x, dz = z - this.root.position.z;
        this.slewTarget = Math.atan2(-dz, dx);
        this.trolleyTarget = THREE.MathUtils.clamp(Math.hypot(dx, dz), 4, this.jib - 0.5);
        if (snap) { this.slewAngle = this.slewTarget; this.trolleyR = this.trolleyTarget; }
    }

    update(dt) {
        let d = this.slewTarget - this.slewAngle; d = Math.atan2(Math.sin(d), Math.cos(d));
        this.slewAngle += d * (1 - Math.exp(-2.4 * dt));
        this.trolleyR += (this.trolleyTarget - this.trolleyR) * (1 - Math.exp(-3 * dt));
        this.slew.rotation.y = this.slewAngle;
        this.trolley.position.x = this.trolleyR;
        this.syncLights(); this.pushLights();
    }
}

// ---------------------------------------------------------------- the wrecking ball rig hanging from a crane
export class BallRig {
    constructor(scene, crane) {
        this.crane = crane;
        this.R = 0.85;
        const steel = new THREE.MeshPhysicalMaterial({ color: '#34373c', roughness: 0.3, metalness: 1, clearcoat: 0.3, clearcoatRoughness: 0.4 });
        this.ball = new THREE.Group();
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(this.R, 48, 32), steel);
        sphere.castShadow = true; this.ball.add(sphere);
        const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 10, 20), steel);
        shackle.position.y = this.R + 0.15; shackle.castShadow = true; this.ball.add(shackle);
        const band = new THREE.Mesh(new THREE.TorusGeometry(this.R * 1.0, 0.05, 10, 48), new THREE.MeshStandardMaterial({ color: '#7a5c1a', roughness: 0.5, metalness: 0.6 }));
        band.rotation.x = Math.PI / 2; this.ball.add(band);
        scene.add(this.ball);
        const cableMat = new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.4, metalness: 0.8 });
        this.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 6).translate(0, 0.5, 0), cableMat);
        this.cable.castShadow = true; scene.add(this.cable);
        this.chain = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.35, metalness: 0.9 }));
        this.chain.castShadow = true; scene.add(this.chain);
        this.tag = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 5).translate(0, 0.5, 0), cableMat);
        scene.add(this.tag);
        this.tagOn = 1;
        // hook block on the cable just under the trolley
        this.block = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), new THREE.MeshStandardMaterial({ color: '#b48a2c', roughness: 0.5, metalness: 0.3 }));
        this.block.castShadow = true; scene.add(this.block);
    }

    /** place the ball (world) and stretch the cable from the hook to it; tagTo = where the tag line ties off */
    pose(ball, hook, tagTo, trolley) {
        this.ball.position.copy(ball);
        const top = ball.clone(); top.y += this.R + 0.3;
        // main cable: trolley down to the hook block; chain: hook block down to the ball
        stretch(this.cable, trolley || hook, hook);
        stretch(this.chain, hook, top);
        this.block.position.copy(hook).setY(hook.y + 0.35);
        // ball faces along its swing so the band reads
        this.ball.quaternion.copy(this.chain.quaternion);
        if (tagTo && this.tagOn > 0.01) { this.tag.visible = true; stretch(this.tag, ball, tagTo); } else this.tag.visible = false;
    }
}

function stretch(mesh, a, b) {
    const d = b.clone().sub(a), len = d.length();
    mesh.position.copy(a);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.divideScalar(len || 1));
    mesh.scale.set(1, len, 1);
}
