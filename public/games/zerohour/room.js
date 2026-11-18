// The salon, greybox (docs/plans/ZERO-HOUR.md §6; the full Belle Époque room is Milestone 3): a parquet floor, a
// burgundy wall with a walnut wainscot and gilt rails, two pilasters framing the board, wall sconces, and a pool of
// warm light over the table. The room is held dark so the table reads; the lamp dims for the spin.
import * as THREE from 'three';
import { V, BOARD_C } from './common.js';
import { TOP } from './table.js';

export class Room {
    constructor(engine) {
        this.engine = engine;
        const s = engine.scene, root = (this.root = new THREE.Group());
        s.add(root);
        const FLOOR_Y = -0.86, WALL_Z = BOARD_C.z - 0.03;
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 10).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2b1810', roughness: 0.55 }));
        floor.position.set(0, FLOOR_Y, 1.5); floor.receiveShadow = true; root.add(floor);
        const wallMat = new THREE.MeshStandardMaterial({ color: '#3a1014', roughness: 0.85 });
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 4.4), wallMat);
        wall.position.set(0, FLOOR_Y + 2.2, WALL_Z); wall.receiveShadow = true; root.add(wall);
        const walnut = new THREE.MeshStandardMaterial({ color: '#3b1f12', roughness: 0.35 });
        const gilt = new THREE.MeshStandardMaterial({ color: '#c99a45', roughness: 0.3, metalness: 1 });
        const wains = new THREE.Mesh(new THREE.BoxGeometry(14, 1.0, 0.04), walnut);
        wains.position.set(0, FLOOR_Y + 0.5, WALL_Z + 0.02); wains.receiveShadow = true; root.add(wains);
        for (const y of [FLOOR_Y + 1.0, FLOOR_Y + 2.95]) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(14, 0.03, 0.03), gilt); rail.position.set(0, y, WALL_Z + 0.04); root.add(rail);
        }
        // pilasters either side of the board, and two more out toward the edges of the shot
        for (const x of [BOARD_C.x - 0.75, BOARD_C.x + 0.75, BOARD_C.x - 2.4, BOARD_C.x + 2.2]) {
            const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.4, 0.08), walnut); p.position.set(x, FLOOR_Y + 1.7, WALL_Z + 0.05); p.castShadow = true; root.add(p);
            const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.12), gilt); cap.position.set(x, FLOOR_Y + 3.05, WALL_Z + 0.07); root.add(cap);
            const base = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.11), gilt); base.position.set(x, FLOOR_Y + 1.06, WALL_Z + 0.07); root.add(base);
        }
        // sconces: warm emissive shades (bloom does the glow)
        this.sconceMat = new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: new THREE.Color('#ffb85c'), emissiveIntensity: 2.2, roughness: 0.6 });
        for (const x of [BOARD_C.x - 1.4, BOARD_C.x + 1.4]) {
            const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.12, 24, 1, true), this.sconceMat);
            shade.position.set(x, BOARD_C.y + 0.35, WALL_Z + 0.14); root.add(shade);
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.12), gilt); arm.position.set(x, BOARD_C.y + 0.28, WALL_Z + 0.07); root.add(arm);
        }
        // the lamp over the table: a long brass-and-glass shade, and a warm spot that pools on the felt
        const shade = new THREE.Mesh(new THREE.BoxGeometry(TOP.x1 - TOP.x0 - 0.4, 0.05, 0.22), gilt);
        shade.position.set((TOP.x0 + TOP.x1) / 2, 2.9, 0); root.add(shade);
        this.lampGlass = new THREE.MeshStandardMaterial({ color: '#fff0d0', emissive: new THREE.Color('#ffd28a'), emissiveIntensity: 1.6 });
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(TOP.x1 - TOP.x0 - 0.45, 0.18).rotateX(Math.PI / 2), this.lampGlass);
        glass.position.set((TOP.x0 + TOP.x1) / 2, 2.874, 0); root.add(glass);
        // a spot on the wheel for the spin (made now at 0, so turning it on never recompiles a shader)
        this.wheelSpot = new THREE.SpotLight('#ffe2b0', 0, 4, 0.42, 0.6, 1.2);
        this.wheelSpot.position.set(TOP.x0 + 0.45, 2.0, 0.3);
        this.wheelSpot.target.position.set(TOP.x0 + 0.5, 0, 0);
        s.add(this.wheelSpot, this.wheelSpot.target);
        this.dim = 0; this.dimTarget = 0;
        this.keyBase = engine.sun.intensity; this.hemiBase = engine.hemi.intensity;
    }
    /** 0 = the room in play; 1 = the spin (the room dims, a spot finds the wheel) */
    setDim(k) { this.dimTarget = k; }
    update(dt) {
        this.dim += (this.dimTarget - this.dim) * (1 - Math.exp(-dt * 1.5));
        const d = this.dim;
        this.engine.sun.intensity = this.keyBase * (1 - 0.55 * d);
        this.engine.hemi.intensity = this.hemiBase * (1 - 0.6 * d);
        this.sconceMat.emissiveIntensity = 2.2 * (1 - 0.6 * d);
        this.lampGlass.emissiveIntensity = 1.6 * (1 - 0.5 * d);
        this.wheelSpot.intensity = 9 * d;
    }
}
