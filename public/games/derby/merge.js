// Minimal BufferGeometry merge (the subset of three's addon we need): attributes common to every input, indexed
// when every input is indexed, otherwise flattened to triangles.
import * as THREE from 'three';

export function mergeGeometries(list) {
    const indexed = list.every((g) => g.index);
    const geos = indexed ? list : list.map((g) => (g.index ? g.toNonIndexed() : g));
    const names = Object.keys(geos[0].attributes).filter((n) => geos.every((g) => g.attributes[n]));
    const out = new THREE.BufferGeometry();
    for (const n of names) {
        const size = geos[0].attributes[n].itemSize;
        const total = geos.reduce((s, g) => s + g.attributes[n].count, 0);
        const Arr = geos[0].attributes[n].array.constructor;
        const arr = new Arr(total * size);
        let o = 0;
        for (const g of geos) { const a = g.attributes[n]; for (let i = 0; i < a.count; i++) for (let k = 0; k < size; k++) arr[o++] = a.array[i * size + k]; }
        out.setAttribute(n, new THREE.BufferAttribute(arr, size));
    }
    if (indexed) {
        const total = geos.reduce((s, g) => s + g.index.count, 0);
        const idx = new Uint32Array(total);
        let o = 0, base = 0;
        for (const g of geos) { for (let i = 0; i < g.index.count; i++) idx[o++] = g.index.array[i] + base; base += g.attributes.position.count; }
        out.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    out.computeBoundingSphere();
    return out;
}
