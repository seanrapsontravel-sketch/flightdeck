// Signed-distance sculpting: organic shapes (horse, jockey) are described as smooth unions of simple primitives,
// then polygonised once at load with surface nets. Normals come from the field's gradient, so the mesh shades
// like a sculpt rather than a set of joined primitives.

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const mix = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** polynomial smooth minimum: blends two surfaces within k of each other */
export function smin(a, b, k) {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
}

/** ellipsoid (IQ's bound): centre c, radii r */
export function ellipsoid(px, py, pz, c, r) {
    const x = (px - c[0]) / r[0], y = (py - c[1]) / r[1], z = (pz - c[2]) / r[2];
    const k0 = Math.sqrt(x * x + y * y + z * z);
    const x2 = x / r[0], y2 = y / r[1], z2 = z / r[2];
    const k1 = Math.sqrt(x2 * x2 + y2 * y2 + z2 * z2);
    return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2]);
}

export function sphere(px, py, pz, c, r) {
    const x = px - c[0], y = py - c[1], z = pz - c[2];
    return Math.sqrt(x * x + y * y + z * z) - r;
}

/** round cone (tapered capsule) from a (radius ra) to b (radius rb) */
export function roundCone(px, py, pz, a, b, ra, rb) {
    const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
    const l2 = bax * bax + bay * bay + baz * baz;
    const rr = ra - rb, a2 = l2 - rr * rr, il2 = 1 / l2;
    const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
    const y = pax * bax + pay * bay + paz * baz, z = y - l2;
    const xx = pax * l2 - bax * y, xy = pay * l2 - bay * y, xz = paz * l2 - baz * y;
    const x2 = xx * xx + xy * xy + xz * xz, y2 = y * y * l2, z2 = z * z * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
    if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
    return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - ra;
}

/** distance from p to segment ab and the parameter along it */
export function segDist(p, a, b) {
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const l2 = abx * abx + aby * aby + abz * abz || 1e-9;
    const t = clamp(((p[0] - a[0]) * abx + (p[1] - a[1]) * aby + (p[2] - a[2]) * abz) / l2, 0, 1);
    const dx = p[0] - a[0] - abx * t, dy = p[1] - a[1] - aby * t, dz = p[2] - a[2] - abz * t;
    return [Math.sqrt(dx * dx + dy * dy + dz * dz), t];
}

/**
 * Surface nets over [min,max] at the given cell size. f(x,y,z) < 0 inside.
 * Returns positions, normals (from the gradient) and triangle indices.
 */
export function surfaceNets(f, min, max, cell) {
    const nx = Math.ceil((max[0] - min[0]) / cell) + 1;
    const ny = Math.ceil((max[1] - min[1]) / cell) + 1;
    const nz = Math.ceil((max[2] - min[2]) / cell) + 1;
    const field = new Float32Array(nx * ny * nz);
    const id = (i, j, k) => i + nx * (j + ny * k);
    for (let k = 0; k < nz; k++) {
        const z = min[2] + k * cell;
        for (let j = 0; j < ny; j++) {
            const y = min[1] + j * cell;
            for (let i = 0; i < nx; i++) field[id(i, j, k)] = f(min[0] + i * cell, y, z);
        }
    }
    const cellVert = new Int32Array(nx * ny * nz).fill(-1);
    const pos = [];
    const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
    const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const v = new Float32Array(8);
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
            const o = corners[c];
            v[c] = field[id(i + o[0], j + o[1], k + o[2])];
            if (v[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of edges) {
            if ((v[a] < 0) === (v[b] < 0)) continue;
            const t = v[a] / (v[a] - v[b]);
            const oa = corners[a], ob = corners[b];
            sx += oa[0] + (ob[0] - oa[0]) * t; sy += oa[1] + (ob[1] - oa[1]) * t; sz += oa[2] + (ob[2] - oa[2]) * t; n++;
        }
        cellVert[id(i, j, k)] = pos.length / 3;
        pos.push(min[0] + (i + sx / n) * cell, min[1] + (j + sy / n) * cell, min[2] + (k + sz / n) * cell);
    }
    const idx = [];
    const quad = (a, b, c, d, flip) => {
        if (a < 0 || b < 0 || c < 0 || d < 0) return;
        if (flip) idx.push(a, d, c, a, c, b); else idx.push(a, b, c, a, c, d);
    };
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const s0 = field[id(i, j, k)] < 0;
        if (s0 === (field[id(i + 1, j, k)] < 0)) continue;
        quad(cellVert[id(i, j - 1, k - 1)], cellVert[id(i, j, k - 1)], cellVert[id(i, j, k)], cellVert[id(i, j - 1, k)], !s0);
    }
    for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
        const s0 = field[id(i, j, k)] < 0;
        if (s0 === (field[id(i, j + 1, k)] < 0)) continue;
        quad(cellVert[id(i - 1, j, k - 1)], cellVert[id(i - 1, j, k)], cellVert[id(i, j, k)], cellVert[id(i, j, k - 1)], !s0);
    }
    for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
        const s0 = field[id(i, j, k)] < 0;
        if (s0 === (field[id(i, j, k + 1)] < 0)) continue;
        quad(cellVert[id(i - 1, j - 1, k)], cellVert[id(i, j - 1, k)], cellVert[id(i, j, k)], cellVert[id(i - 1, j, k)], !s0);
    }
    const positions = new Float32Array(pos);
    // one relaxation pass toward the surface: project each vertex along the gradient onto f = 0
    const normals = new Float32Array(positions.length);
    const e = cell * 0.35;
    for (let p = 0; p < positions.length; p += 3) {
        let x = positions[p], y = positions[p + 1], z = positions[p + 2];
        for (let it = 0; it < 2; it++) {
            const d = f(x, y, z);
            let gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
            const gl = Math.hypot(gx, gy, gz) || 1;
            gx /= gl; gy /= gl; gz /= gl;
            const step = clamp(d, -cell * 0.5, cell * 0.5);
            x -= gx * step; y -= gy * step; z -= gz * step;
            normals[p] = gx; normals[p + 1] = gy; normals[p + 2] = gz;
        }
        positions[p] = x; positions[p + 1] = y; positions[p + 2] = z;
    }
    return { positions, normals, indices: pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx) };
}
