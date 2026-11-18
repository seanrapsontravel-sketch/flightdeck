// Planar reflection: before the main pass, the scene is rendered from the camera mirrored in a horizontal plane
// into a half-float target with mipmaps (so a material can blur it by roughness with textureLod). A material
// projects its world position with `texMat` to find its reflected texel.
//
// Shared by the 3D games: Demolition's wet asphalt, Limbo's lagoon and wet sand.
//   const refl = new Reflection(engine, { height: 0, scale: 0.5 });
//   refl.hide.push(mirrorMesh);      // the mirror surface itself (and anything that shouldn't reflect)
//   material uniforms: tRefl = refl.rt.texture, uReflMat = refl.texMat
import * as THREE from 'three';

const TV2 = new THREE.Vector2(), TV3 = new THREE.Vector3(), TV3b = new THREE.Vector3(), TV3c = new THREE.Vector3();

export class Reflection {
    /** height: the mirror plane's y; scale: target size relative to the drawing buffer (default ½, ⅓ on ?quality=low);
     *  clip: cut away everything below the plane in the mirrored pass (a lagoon over sloping sand needs it, or the
     *  sand under the water shows up in the reflection as hills) */
    constructor(engine, { height = 0, scale, clip = false } = {}) {
        this.engine = engine;
        this.height = height;
        this.clip = clip ? [new THREE.Plane(new THREE.Vector3(0, 1, 0), -height + 0.02)] : null;
        this.rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: true });
        this.rt.texture.generateMipmaps = true;
        this.rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
        this.cam = new THREE.PerspectiveCamera();
        this.texMat = new THREE.Matrix4();
        this.hide = [];
        // uniforms ({value: texture}) of materials that sample this reflection but must still be drawn INTO it (wet
        // sand at a waterline): during the mirrored pass they read a black texel instead, so there is no feedback loop
        this.guard = [];
        this.blank = null;              // made on first use (a new texture draws from Math.random for its uuid)
        this.scale = scale ?? (engine.low ? 0.33 : 0.5);
        this.enabled = true;
        engine.prePasses.push(() => this.render());
    }
    render() {
        const E = this.engine, R = E.renderer, cam = E.camera, h2 = this.height * 2;
        if (!this.enabled) return;
        const sz = R.getDrawingBufferSize(TV2);
        const w = Math.max(2, Math.round(sz.x * this.scale)), h = Math.max(2, Math.round(sz.y * this.scale));
        if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
        const vc = this.cam;
        cam.updateMatrixWorld();
        vc.position.copy(cam.position); vc.position.y = h2 - vc.position.y;
        const dir = TV3.set(0, 0, -1).applyQuaternion(cam.quaternion);
        const tgt = TV3b.copy(cam.position).addScaledVector(dir, 10); tgt.y = h2 - tgt.y;
        const up = TV3c.set(0, 1, 0).applyQuaternion(cam.quaternion); up.y = -up.y;
        vc.up.copy(up); vc.lookAt(tgt);
        vc.fov = cam.fov; vc.aspect = cam.aspect; vc.near = cam.near; vc.far = cam.far; vc.updateProjectionMatrix();
        vc.updateMatrixWorld();
        this.texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
        for (const o of this.hide) o.visible = false;
        if (this.guard.length && !this.blank) { this.blank = new THREE.DataTexture(new Uint8Array(4), 1, 1); this.blank.needsUpdate = true; }
        for (const u of this.guard) u.value = this.blank;
        const au = R.shadowMap.autoUpdate; R.shadowMap.autoUpdate = false;
        const prev = R.getRenderTarget(), planes = R.clippingPlanes;
        if (this.clip) R.clippingPlanes = this.clip;
        R.setRenderTarget(this.rt); R.clear(); R.render(E.scene, vc);
        R.setRenderTarget(prev);
        if (this.clip) R.clippingPlanes = planes;
        R.shadowMap.autoUpdate = au;
        for (const o of this.hide) o.visible = true;
        for (const u of this.guard) u.value = this.rt.texture;
    }
}
