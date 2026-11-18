// The ducks — the only characters in Quackshot.
//
// Rubber duck: ONE signed-distance sculpt (derby/sdf.js: ellipsoids + round cones blended with smooth-min, meshed with
// surface nets), parametrised so Milestone 0 can show 2–3 proportion/beak variants of the same build. Paint (bill,
// eyes and their highlights) is done in the shader from object-space position, so it stays crisp at any LOD and the
// body colour can be tinted per instance (parade yellow, each player's prize colour) without separate models.
//
// Tin prize duck: hard-surface — a pressed-tin profile (extruded Shape with a rolled bevel edge) on a hinge, gilt and
// enamel-painted from a canvas. Not organic, so it is not sculpted.
//
// Duck space: metres for a 1 m-long duck (scale per use), +x forward (beak), +y up, +z the duck's right, origin at
// the middle of the flat base.
import * as THREE from 'three';
import { clamp, ellipsoid, roundCone, smin, sphere, surfaceNets } from '../derby/sdf.js';

const smax = (a, b, k) => -smin(-a, -b, k);

/** ellipsoid whose long axis is pitched by `a` radians in the x–y plane (positive = front end up) */
function tiltEllipsoid(x, y, z, c, r, a) {
    const dx = x - c[0], dy = y - c[1], ca = Math.cos(a), sa = Math.sin(a);
    return ellipsoid(dx * ca + dy * sa, -dx * sa + dy * ca, z - c[2], [0, 0, 0], r);
}

// ---------------------------------------------------------------- the variants (Milestone 0 shows all three)
// Each is the same sculpt with different proportions. Numbers are duck-space metres.
export const VARIANTS = {
    // A — the bg photo's duck: big round head set forward over a full chest, wide smiling bill, tail flicked high.
    A: {
        label: 'A · Classic',
        body: { c: [-0.03, 0.22, 0], r: [0.47, 0.25, 0.37] },
        chest: { c: [0.2, 0.27, 0], r: [0.3, 0.26, 0.34] },
        rump: { c: [-0.24, 0.28, 0], r: [0.27, 0.23, 0.33] },
        tail: { a: [-0.28, 0.32], b: [-0.55, 0.5], ra: 0.2, rb: 0.05, k: 0.14, squash: 1.2 },
        wing: { c: [-0.1, 0.27, 0.31], r: [0.24, 0.09, 0.06], a: -0.25, k: 0.025 },
        head: { c: [0.2, 0.7, 0], r: [0.27, 0.245, 0.238], back: [-0.08, 0.01, 0.92], neck: 0.06 },
        cheek: { c: [0.34, 0.62, 0.12], r: [0.1, 0.075, 0.09] },
        bill: { c: [0.49, 0.64, 0], r: [0.135, 0.066, 0.132], a: 0.16, flare: 0.3 },
        lip: { c: [0.465, 0.575, 0], r: [0.1, 0.052, 0.112], a: 0.04 },
        eye: { dir: [0.55, 0.45, 0.7], rx: 0.036, ry: 0.05, tilt: 0.12 },
    },
    // B — chubbier and cuter: a bigger head sat further back, a short round body, a small rounded bill.
    B: {
        label: 'B · Chubby',
        body: { c: [-0.03, 0.23, 0], r: [0.43, 0.26, 0.38] },
        chest: { c: [0.16, 0.28, 0], r: [0.29, 0.27, 0.35] },
        rump: { c: [-0.22, 0.29, 0], r: [0.25, 0.24, 0.34] },
        tail: { a: [-0.26, 0.33], b: [-0.5, 0.5], ra: 0.2, rb: 0.055, k: 0.14, squash: 1.18 },
        wing: { c: [-0.08, 0.28, 0.32], r: [0.22, 0.095, 0.06], a: -0.24, k: 0.025 },
        head: { c: [0.15, 0.73, 0], r: [0.295, 0.272, 0.262], back: [-0.06, 0.01, 0.94], neck: 0.07 },
        cheek: { c: [0.3, 0.64, 0.14], r: [0.11, 0.085, 0.1] },
        bill: { c: [0.45, 0.66, 0], r: [0.11, 0.064, 0.118], a: 0.14, flare: 0.22 },
        lip: { c: [0.43, 0.598, 0], r: [0.082, 0.05, 0.098], a: 0.04 },
        eye: { dir: [0.52, 0.46, 0.72], rx: 0.04, ry: 0.054, tilt: 0.08 },
    },
    // C — vintage/sleek: a longer, lower boat of a body, the head smaller and further forward, a long flat bill, a
    // sharper tail flick and a more defined wing.
    C: {
        label: 'C · Vintage',
        body: { c: [-0.04, 0.2, 0], r: [0.51, 0.23, 0.34] },
        chest: { c: [0.22, 0.25, 0], r: [0.3, 0.245, 0.31] },
        rump: { c: [-0.28, 0.26, 0], r: [0.28, 0.21, 0.3] },
        tail: { a: [-0.32, 0.29], b: [-0.62, 0.52], ra: 0.18, rb: 0.035, k: 0.13, squash: 1.3 },
        wing: { c: [-0.12, 0.26, 0.285], r: [0.28, 0.085, 0.065], a: -0.3, k: 0.022 },
        head: { c: [0.25, 0.66, 0], r: [0.245, 0.225, 0.215], back: [-0.075, 0.012, 0.92], neck: 0.055 },
        cheek: { c: [0.38, 0.59, 0.11], r: [0.09, 0.07, 0.08] },
        bill: { c: [0.535, 0.6, 0], r: [0.155, 0.054, 0.122], a: 0.13, flare: 0.4 },
        lip: { c: [0.505, 0.548, 0], r: [0.118, 0.044, 0.1], a: 0.03 },
        eye: { dir: [0.55, 0.43, 0.7], rx: 0.032, ry: 0.046, tilt: 0.15 },
    },
};

// ---------------------------------------------------------------- the sculpt
function parts(V) {
    const H = V.head, B = V.bill, L = V.lip, W = V.wing, T = V.tail, C = V.cheek;
    const backC = [H.c[0] + H.back[0], H.c[1] + H.back[1], 0], backR = H.r.map((r) => r * H.back[2]);
    function bodyD(x, y, z) {
        let d = ellipsoid(x, y, z, V.body.c, V.body.r);
        d = smin(d, ellipsoid(x, y, z, V.chest.c, V.chest.r), 0.12);
        d = smin(d, ellipsoid(x, y, z, V.rump.c, V.rump.r), 0.16);
        // the tail: a tapered cone flicked up and back, a little flattened side to side
        d = smin(d, roundCone(x, y, z * T.squash, [T.a[0], T.a[1], 0], [T.b[0], T.b[1], 0], T.ra, T.rb), T.k);
        // embossed wings, rising toward the tail
        const az = Math.abs(z);
        d = smin(d, tiltEllipsoid(x, y, az, W.c, W.r, W.a), W.k);
        // flat base with a rounded edge
        d = smax(d, 0.004 - y, 0.05); // 4 mm up so the base never shares a plane with whatever it sits on
        return d;
    }
    function headD(x, y, z) {
        let d = ellipsoid(x, y, z, H.c, H.r);
        d = smin(d, ellipsoid(x, y, z, backC, backR), 0.09);   // the head runs back a little: not a ball
        d = smin(d, ellipsoid(x, y, Math.abs(z), C.c, C.r), 0.1); // cheeks under the eyes, blended wide so no ridge
        return d;
    }
    function billD(x, y, z) {
        // upper bill: a wide flat spatula, flaring toward the tip, tip turned up
        const s = clamp((x - (B.c[0] - B.r[0] * 0.6)) / (B.r[0] * 1.6), 0, 1);
        const zf = z / (1 + B.flare * s);
        let d = tiltEllipsoid(x, y, zf, B.c, B.r, B.a);
        // lower lip, tucked under; a narrow crease between the two is the smile line
        d = smin(d, tiltEllipsoid(x, y, z / (1 + B.flare * 0.6 * s), L.c, L.r, L.a), 0.012);
        // mouth groove at the front: a thin slot carved between bill and lip
        const gy = (B.c[1] + L.c[1]) / 2 - 0.006, gx = L.c[0] + L.r[0] * 0.55;
        d = smax(d, -tiltEllipsoid(x, y, z, [gx + 0.04, gy, 0], [0.09, 0.0075, L.r[2] * 1.12], 0.1), 0.008);
        // nostrils: two small dents near the base of the bill
        const nx = B.c[0] - B.r[0] * 0.35, ny = B.c[1] + B.r[1] * 0.75 + (nx - B.c[0]) * Math.tan(B.a);
        d = smax(d, -sphere(x, y, Math.abs(z), [nx, ny + 0.008, 0.032], 0.011), 0.006);
        return d;
    }
    function full(x, y, z) {
        // head into body: a tight blend, so a real crease stays where the head overhangs the chest and back
        let d = smin(bodyD(x, y, z), headD(x, y, z), H.neck);
        d = smin(d, billD(x, y, z), 0.04);
        return d;
    }
    return { bodyD, headD, billD, full };
}

/** march from the head centre along `dir` to the surface — where the painted eye sits */
function surfacePoint(f, c, dir) {
    const n = new THREE.Vector3(...dir).normalize();
    let t = 0.6; // start outside the head and march in
    for (let i = 0; i < 64; i++) { const d = f(c[0] + n.x * t, c[1] + n.y * t, c[2] + n.z * t); if (Math.abs(d) < 1e-5) break; t -= d * 0.9; }
    return new THREE.Vector3(c[0] + n.x * t, c[1] + n.y * t, c[2] + n.z * t);
}
function gradient(f, p, e = 0.002) {
    return new THREE.Vector3(
        f(p.x + e, p.y, p.z) - f(p.x - e, p.y, p.z),
        f(p.x, p.y + e, p.z) - f(p.x, p.y - e, p.z),
        f(p.x, p.y, p.z + e) - f(p.x, p.y, p.z - e)).normalize();
}

const geoCache = new Map();
/**
 * The rubber duck mesh for a variant at a level of detail (0 = hero close-up, 1 = mid, 2 = far).
 * Attributes: position, normal (from the field's gradient), aBill (1 on the bill, 0 on the body, soft across the seam).
 * userData.eye: the right eye's centre/normal/radii in duck space (the shader mirrors it).
 */
export function rubberDuckGeometry(variant = 'A', lod = 0) {
    const key = variant + lod;
    if (geoCache.has(key)) return geoCache.get(key);
    const V = VARIANTS[variant];
    const P = parts(V);
    const cell = [0.0075, 0.016, 0.034][lod];
    const net = surfaceNets(P.full, [-0.72, -0.04, -0.42], [0.76, 1.06, 0.42], cell);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(net.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(net.normals, 3));
    g.setIndex(new THREE.BufferAttribute(net.indices, 1));
    // which paint: the bill wherever it's the nearer surface
    const n = net.positions.length / 3, bill = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const x = net.positions[i * 3], y = net.positions[i * 3 + 1], z = net.positions[i * 3 + 2];
        const rest = smin(P.bodyD(x, y, z), P.headD(x, y, z), V.head.neck);
        const s = P.billD(x, y, z) - rest;
        bill[i] = 1 - clamp((s + 0.005) / 0.01, 0, 1);
    }
    g.setAttribute('aBill', new THREE.BufferAttribute(bill, 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    const E = V.eye;
    const ec = surfacePoint(P.headD, V.head.c, E.dir);
    g.userData.eye = { c: ec, n: gradient(P.full, ec), rx: E.rx, ry: E.ry, tilt: E.tilt };
    g.userData.variant = variant;
    g.userData.head = { c: new THREE.Vector3(...V.head.c), r: Math.max(...V.head.r) };
    geoCache.set(key, g);
    return g;
}

// ---------------------------------------------------------------- vinyl material with painted bill and eyes
export const DUCK_YELLOW = '#ffc300';
export const BILL_ORANGE = '#ff6a12';

/**
 * Glossy vinyl. `body` tints the duck (instanced meshes multiply by their instance colour too). The eyes are an
 * analytic decal: an ellipse on the head around userData.eye, a black pupil with a white catch-light.
 */
export function duckMaterial(geo, { body = DUCK_YELLOW, bill = BILL_ORANGE } = {}) {
    const e = geo.userData.eye;
    const up = new THREE.Vector3(0, 1, 0);
    const U = up.clone().addScaledVector(e.n, -up.dot(e.n)).normalize();
    const Vv = new THREE.Vector3().crossVectors(e.n, U).normalize();
    // tilt the ellipse (top leaning toward the bill)
    const Ut = U.clone().multiplyScalar(Math.cos(e.tilt)).addScaledVector(Vv, Math.sin(e.tilt));
    const Vt = new THREE.Vector3().crossVectors(e.n, Ut).normalize();
    const u = {
        uBody: { value: new THREE.Color(body) }, uBill: { value: new THREE.Color(bill) },
        uEyeC: { value: e.c.clone() }, uEyeN: { value: e.n.clone() }, uEyeU: { value: Ut }, uEyeV: { value: Vt },
        uEyeR: { value: new THREE.Vector2(e.rx, e.ry) },
    };
    const m = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, roughness: 0.3, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.1,
        sheen: 0, sheenRoughness: 0.45, sheenColor: new THREE.Color('#ffd98a'), envMapIntensity: 1.0,
    });
    m.userData.u = u;
    m.onBeforeCompile = (s) => {
        Object.assign(s.uniforms, u);
        s.vertexShader = s.vertexShader
            .replace('#include <common>', '#include <common>\nattribute float aBill; varying float vBill; varying vec3 vDuck;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBill = aBill; vDuck = position;');
        s.fragmentShader = s.fragmentShader
            .replace('#include <common>', `#include <common>
uniform vec3 uBody, uBill, uEyeC, uEyeN, uEyeU, uEyeV; uniform vec2 uEyeR; varying float vBill; varying vec3 vDuck;
float vEye; float vGlint;`)
            .replace('#include <color_fragment>', `
    vec3 bodyCol = uBody;
#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
    bodyCol *= vColor.rgb;
#endif
    // eyes: mirror to the right side, project onto the eye's tangent plane, elliptical pupil + catch-light
    vec3 q = vec3(vDuck.xy, abs(vDuck.z)) - uEyeC;
    float h = dot(q, uEyeN);
    vec2 e = vec2(dot(q, uEyeV), dot(q, uEyeU)) / uEyeR;
    float r = length(e);
    float aa = max(fwidth(r), 1e-4);
    vEye = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, r)) * step(-0.03, h);
    vec2 g = (e - vec2(0.32, 0.42)) * 3.4;     // catch-light up and toward the bill
    float rg = length(g);
    float ag = max(fwidth(rg), 1e-4);
    vGlint = (1.0 - smoothstep(1.0 - ag, 1.0 + ag, rg)) * vEye;
    float billMask = smoothstep(0.35, 0.65, vBill);
    diffuseColor.rgb = mix(bodyCol, uBill, billMask);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.011, 0.02), vEye);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), vGlint);`)
            .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
    roughnessFactor = mix(roughnessFactor, 0.12, vEye);   // painted eyes are glossier than the vinyl`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
    // vinyl warmth: light scattered through the thin wall shows at grazing angles, as a warm glow (not a cool rim)
    float graze = 1.0 - abs(dot(normal, normalize(vViewPosition)));
    totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.55, 0.18) * 0.06 * graze * graze * (1.0 - vEye);
    totalEmissiveRadiance += vec3(1.0) * vGlint * 0.35;`);
    };
    m.customProgramCacheKey = () => 'qs-duck';
    return m;
}

/** one rubber duck (a Mesh). For crowds, use rubberDuckInstances. */
export function rubberDuck({ variant = 'A', lod = 0, body } = {}) {
    const g = rubberDuckGeometry(variant, lod);
    const m = new THREE.Mesh(g, duckMaterial(g, { body }));
    m.castShadow = true; m.receiveShadow = true;
    return m;
}

/** many ducks in one draw: tint per instance with setColorAt (multiplies the white body) */
export function rubberDuckInstances(count, { variant = 'A', lod = 1 } = {}) {
    const g = rubberDuckGeometry(variant, lod);
    const im = new THREE.InstancedMesh(g, duckMaterial(g, { body: '#ffffff' }), count);
    im.castShadow = true; im.receiveShadow = true;
    // three computes an InstancedMesh's bounding sphere once (all instances at the origin) and never again, so
    // culling would hide ducks placed away from the origin whenever the origin is off-screen
    im.frustumCulled = false;
    const c = new THREE.Color(DUCK_YELLOW);
    for (let i = 0; i < count; i++) im.setColorAt(i, c);
    return im;
}

// ---------------------------------------------------------------- the tin prize duck (hard surface)
// A shooting-gallery knockdown: a duck in profile pressed from sheet tin, edges rolled, standing on a hinge plate.
// Profile is drawn in metres for a 0.5 m-tall duck facing +x; extruded along z.
function tinProfile() {
    const s = new THREE.Shape();
    s.moveTo(-0.16, 0.02);
    s.lineTo(0.15, 0.02);
    s.bezierCurveTo(0.22, 0.03, 0.26, 0.09, 0.25, 0.15);           // chest
    s.bezierCurveTo(0.24, 0.2, 0.19, 0.23, 0.14, 0.245);            // up to the neck front
    s.bezierCurveTo(0.17, 0.26, 0.2, 0.27, 0.235, 0.268);           // under the bill
    s.bezierCurveTo(0.27, 0.268, 0.3, 0.28, 0.31, 0.3);             // bill tip, turned up
    s.bezierCurveTo(0.29, 0.315, 0.24, 0.312, 0.205, 0.318);        // top of the bill
    s.bezierCurveTo(0.21, 0.37, 0.18, 0.425, 0.12, 0.43);           // forehead → crown
    s.bezierCurveTo(0.06, 0.435, 0.025, 0.4, 0.025, 0.355);         // back of the head
    s.bezierCurveTo(0.025, 0.3, 0.05, 0.27, 0.045, 0.245);          // nape
    s.bezierCurveTo(-0.02, 0.22, -0.12, 0.23, -0.2, 0.27);          // back
    s.bezierCurveTo(-0.24, 0.29, -0.27, 0.31, -0.285, 0.33);        // tail tip
    s.bezierCurveTo(-0.29, 0.25, -0.26, 0.17, -0.23, 0.12);         // under the tail
    s.bezierCurveTo(-0.21, 0.08, -0.2, 0.04, -0.16, 0.02);
    return s;
}

let tinCache = null;
function tinGeometry() {
    if (tinCache) return tinCache;
    const g = new THREE.ExtrudeGeometry(tinProfile(), {
        depth: 0.006, curveSegments: 28, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.007, bevelSegments: 4,
    });
    g.translate(0, 0, -0.003);
    g.computeVertexNormals();
    // UVs on the faces are the shape's x/y: map the profile's box to 0..1
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + 0.31) / 0.64, (uv.getY(i) + 0.01) / 0.46);
    tinCache = g;
    return g;
}

const TIN_FINISH = {
    // enamel: cream body, red-orange bill, gilt wing scallops and rim — the classic gallery duck
    enamel: { body: '#efe4c8', bill: '#e2401d', wing: 'gold', rimGold: true },
    // the golden duck: all gilt, enamel eye only
    gold: { body: 'gold', bill: 'gold', wing: 'goldDark', rimGold: true },
};

function tinTextures(finish) {
    const F = TIN_FINISH[finish];
    const N = 1024, W = 0.64, H = 0.46;
    const col = document.createElement('canvas'); col.width = col.height = N;
    const mr = document.createElement('canvas'); mr.width = mr.height = N;   // g = roughness, b = metalness
    const c = col.getContext('2d'), r = mr.getContext('2d');
    const X = (x) => ((x + 0.31) / W) * N, Y = (y) => (1 - (y + 0.01) / H) * N;
    const GOLD = '#f2c55a', GOLD_DK = '#c8922e';
    const paint = (fill, metal, rough, draw) => {
        const isGold = fill === 'gold' || fill === 'goldDark';
        c.fillStyle = fill === 'gold' ? GOLD : fill === 'goldDark' ? GOLD_DK : fill;
        r.fillStyle = `rgb(0,${Math.round((isGold ? 0.34 : rough) * 255)},${isGold ? 166 : Math.round(metal * 255)})`;
        c.beginPath(); r.beginPath(); draw(c); draw(r); c.fill(); r.fill();
    };
    const all = (g) => { g.rect(0, 0, N, N); };
    paint(F.body, 0, 0.22, all);
    // the bill
    paint(F.bill, 0, 0.2, (g) => { g.moveTo(X(0.19), Y(0.26)); g.lineTo(X(0.33), Y(0.27)); g.lineTo(X(0.33), Y(0.33)); g.lineTo(X(0.19), Y(0.33)); g.closePath(); });
    // wing: three gilt scallops
    for (const [x, y, rr] of [[-0.06, 0.15, 0.085], [-0.1, 0.165, 0.07], [-0.135, 0.18, 0.055]]) {
        paint(F.wing, 1, 0.3, (g) => { g.ellipse(X(x), Y(y), (rr / W) * N * 1.25, (rr / H) * N * 0.62, -0.25, 0, Math.PI * 2); });
        paint(F.body === 'gold' ? 'gold' : F.body, 0, 0.22, (g) => { g.ellipse(X(x + 0.012), Y(y + 0.006), (rr / W) * N * 1.05, (rr / H) * N * 0.46, -0.25, 0, Math.PI * 2); });
    }
    // eye: black enamel with a white catch-light, ringed in gilt
    paint('gold', 1, 0.3, (g) => { g.arc(X(0.135), Y(0.36), 40, 0, Math.PI * 2); });
    paint('#0b0b10', 0, 0.12, (g) => { g.arc(X(0.135), Y(0.36), 30, 0, Math.PI * 2); });
    paint('#ffffff', 0, 0.12, (g) => { g.arc(X(0.145), Y(0.372), 10, 0, Math.PI * 2); });
    // a gilt pinstripe around the body just inside the rolled edge
    if (F.rimGold) {
        c.save(); r.save();
        const path = new Path2D(), pts = tinProfile().getPoints(64);
        pts.forEach((p, i) => (i ? path.lineTo(X(p.x), Y(p.y)) : path.moveTo(X(p.x), Y(p.y))));
        path.closePath();
        c.lineWidth = r.lineWidth = 18; c.strokeStyle = GOLD; r.strokeStyle = 'rgb(0,77,255)';
        c.stroke(path); r.stroke(path);
        c.restore(); r.restore();
    }
    // wear and orange-peel: faint speckle in roughness so the gilt doesn't read as chrome
    const img = r.getImageData(0, 0, N, N), d = img.data;
    let s = 1234567;
    for (let i = 0; i < d.length; i += 4) { s = (s * 16807) % 2147483647; d[i + 1] = clamp(d[i + 1] + ((s / 2147483647) - 0.5) * 30, 0, 255); }
    r.putImageData(img, 0, 0);
    const map = new THREE.CanvasTexture(col); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    const mrt = new THREE.CanvasTexture(mr); mrt.anisotropy = 8;
    return { map, mrt };
}

/**
 * A tin knockdown duck on its hinge (a Group). finish: 'enamel' | 'gold'. The group's origin is the hinge axis;
 * knock it down by rotating `userData.leaf` about x (it falls backward, toward −z).
 */
export function tinDuck({ finish = 'enamel', height = 0.5 } = {}) {
    const k = height / 0.5;
    const G = new THREE.Group();
    const { map, mrt } = tinTextures(finish);
    const face = new THREE.MeshPhysicalMaterial({ map, roughnessMap: mrt, metalnessMap: mrt, roughness: 1, metalness: 1, clearcoat: 0.35, clearcoatRoughness: 0.15, envMapIntensity: 1.4 });
    const rim = new THREE.MeshStandardMaterial({ color: '#f2c55a', roughness: 0.3, metalness: 0.75, envMapIntensity: 1.4 });
    const leaf = new THREE.Group();
    const duck = new THREE.Mesh(tinGeometry(), [face, rim]);
    duck.castShadow = true; duck.receiveShadow = true;
    duck.position.y = 0.01;
    leaf.add(duck);
    // hinge plate + knuckle (hard surface)
    const brass = new THREE.MeshStandardMaterial({ color: '#b8893a', roughness: 0.38, metalness: 1 });
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 0.012), brass); tab.position.set(0, 0.012, 0); leaf.add(tab);
    const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 16).rotateZ(Math.PI / 2), brass);
    G.add(knuckle);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 0.09), brass); base.position.set(0, -0.012, -0.03); G.add(base);
    for (const m of [tab, knuckle, base]) { m.castShadow = true; m.receiveShadow = true; }
    G.add(leaf);
    G.scale.setScalar(k);
    G.userData.leaf = leaf;
    return G;
}
