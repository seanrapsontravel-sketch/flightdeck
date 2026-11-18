// Racegoers for the instanced crowd: low-poly people lofted from stacked ellipse rings, so they keep a human
// silhouette (shoulders, waist, separate legs, head on a neck) at a few hundred vertices each. One geometry holds
// both a suit (trousers, jacket, shirt and tie) and a dress (skirt, bare legs, long hair); the vertex shader folds
// away the parts an instance doesn't wear. Facing +z (the track). Parts (aPart):
//   0 trousers  1 jacket / bodice  2 face  3 sleeve  4 hat  5 short hair  6 shoes  7 hand  8 skirt  9 bare legs
//   10 neck  11 long hair
import * as THREE from 'three';
import { mergeGeometries } from './merge.js';

const TAU = Math.PI * 2;

/** rings: [y, cx, cz, rx, rz]; angle 0 faces +z */
function loft(rings, n, part, caps = [true, true]) {
    const pos = [], idx = [];
    for (const [y, cx, cz, rx, rz] of rings) for (let j = 0; j < n; j++) {
        const a = (j / n) * TAU;
        pos.push(cx + rx * Math.sin(a), y, cz + rz * Math.cos(a));
    }
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < n; j++) {
        const a = i * n + j, b = i * n + ((j + 1) % n), c = a + n, d = b + n;
        // rings run downward or upward; wind so the outside faces out either way
        if (rings[i + 1][0] > rings[i][0]) idx.push(a, b, d, a, d, c); else idx.push(a, d, b, a, c, d);
    }
    const up = rings[rings.length - 1][0] > rings[0][0];
    const cap = (ri, top) => {
        const [y, cx, cz] = rings[ri], c = pos.length / 3;
        pos.push(cx, y, cz);
        for (let j = 0; j < n; j++) {
            const a = ri * n + j, b = ri * n + ((j + 1) % n);
            if (top === up) idx.push(a, b, c); else idx.push(b, a, c);
        }
    };
    if (caps[0]) cap(0, false);
    if (caps[1]) cap(rings.length - 1, true);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return tag(g, part);
}
function tag(g, part) {
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1));
    return g;
}
/** a sphere shaped by fn(x, y, z on the unit sphere) → [x, y, z] */
function blob(w, h, part, fn) {
    const g = new THREE.SphereGeometry(1, w, h);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const q = fn(p.getX(i), p.getY(i), p.getZ(i)); p.setXYZ(i, q[0], q[1], q[2]); }
    g.computeVertexNormals();
    return tag(g, part);
}

export function personGeometry(detail = 'hi') {
    const hi = detail === 'hi';
    const N = hi ? 14 : 9, L = hi ? 8 : 5;
    const parts = [];
    // jacket / bodice: hips, a waist, the chest, square shoulders sloping in to the collar
    parts.push(loft([
        [0.9, 0, -0.005, 0.165, 0.115], [1.0, 0, 0, 0.152, 0.104], [1.12, 0, 0.008, 0.158, 0.11], [1.25, 0, 0.014, 0.176, 0.118],
        [1.35, 0, 0.006, 0.196, 0.11], [1.42, 0, 0, 0.19, 0.094], [1.47, 0, 0, 0.115, 0.074], [1.5, 0, 0, 0.06, 0.05],
    ], N, 1));
    // neck and head: a jaw narrower than the skull, a nose
    parts.push(loft([[1.46, 0, 0, 0.05, 0.05], [1.585, 0, 0.006, 0.044, 0.047]], L, 10, [false, false]));
    parts.push(blob(hi ? 12 : 8, hi ? 9 : 6, 2, (x, y, z) => {
        const jaw = y < 0 ? 1 - 0.28 * -y : 1;
        let zz = z * jaw;
        if (z > 0.6 && y > -0.45 && y < 0.15 && Math.abs(x) < 0.35) zz += 0.22 * (1 - Math.abs(x) / 0.35) * (1 - Math.abs(y + 0.15) / 0.3);
        return [x * 0.088 * jaw, 1.625 + y * 0.112, 0.012 + zz * 0.098];
    }));
    // hair: a short cap for most, a long fall behind for some
    parts.push(blob(hi ? 12 : 8, hi ? 6 : 4, 5, (x, y, z) => {
        const yy = Math.max(y, -0.25 + 0.75 * (z + 1) / 2);   // hairline: the forehead in front, the nape behind
        return [x * 0.095, 1.632 + yy * 0.118, 0.004 + z * 0.104];
    }));
    parts.push(loft([[1.69, 0, -0.012, 0.098, 0.1], [1.58, 0, -0.035, 0.108, 0.085], [1.45, 0, -0.06, 0.1, 0.045]], N, 11, [false, true]));
    // sleeves hanging from the shoulder (the vertex shader swings them up for a cheer), and hands
    for (const s of [1, -1]) {
        parts.push(loft([[1.44, 0.2 * s, 0, 0.055, 0.056], [1.3, 0.21 * s, 0.004, 0.05, 0.051], [1.12, 0.214 * s, 0.022, 0.043, 0.046], [0.95, 0.212 * s, 0.045, 0.038, 0.04], [0.85, 0.208 * s, 0.055, 0.033, 0.036]], L, 3));
        parts.push(blob(6, 5, 7, (x, y, z) => [0.207 * s + x * 0.032, 0.8 + y * 0.052, 0.058 + z * 0.028]));
    }
    if (hi) {
        for (const s of [1, -1]) {
            // trousers: thigh to ankle, a slight break over the shoe
            parts.push(loft([[0.95, 0.088 * s, 0, 0.088, 0.098], [0.75, 0.09 * s, 0.005, 0.074, 0.08], [0.5, 0.09 * s, 0.01, 0.06, 0.065], [0.3, 0.09 * s, -0.004, 0.054, 0.058], [0.07, 0.09 * s, 0, 0.05, 0.055]], L, 0));
            // bare legs under a dress
            parts.push(loft([[0.62, 0.075 * s, 0, 0.056, 0.06], [0.36, 0.078 * s, -0.005, 0.045, 0.052], [0.08, 0.08 * s, 0, 0.032, 0.038]], L, 9));
            parts.push(blob(7, 5, 6, (x, y, z) => [0.086 * s + x * 0.048, 0.042 + y * 0.042, 0.04 + z * 0.105]));
        }
        // skirt flaring from the waist
        parts.push(loft([[1.02, 0, 0.004, 0.15, 0.108], [0.86, 0, 0.01, 0.19, 0.15], [0.66, 0, 0.012, 0.225, 0.19], [0.52, 0, 0.012, 0.235, 0.2]], N, 8));
    }
    // hat: a lathed brim and crown (the shader varies the crown from a trilby to a top hat)
    const prof = [[0.0, 1.708], [0.19, 1.708], [0.2, 1.716], [0.13, 1.722], [0.112, 1.732], [0.104, 1.84], [0.0, 1.845]].map(([r, y]) => new THREE.Vector2(r, y));
    const hat = new THREE.LatheGeometry(prof, hi ? 12 : 8);
    hat.translate(0, 0, -0.004);
    parts.push(tag(hat, 4));
    return mergeGeometries(parts.map((g) => (g.index ? g : indexify(g))));
}
function indexify(g) {
    const n = g.attributes.position.count, idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
}

/** shader patch shared by both crowd meshes: wardrobe, cheering, colours */
export function crowdMaterial(time, excite) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.82 });
    mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = time; sh.uniforms.uEx = excite;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime,uEx;attribute float aPart;attribute float aSkin;varying float vPart;varying float vSkin;varying vec3 vP;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
vPart=aPart;vSkin=aSkin;vP=position;
float ph=aSkin*6.283+float(gl_InstanceID)*.37;
float ex=uEx*(.45+.55*fract(aSkin*13.7));
float hatOn=step(.62,fract(aSkin*7.31));
float dress=step(fract(aSkin*5.71),.45);
float longHair=dress*step(.35,fract(aSkin*2.97));
float drop=0.;
if(aPart>3.5&&aPart<4.5)drop=1.-hatOn;
if(aPart<.5)drop=dress;
if((aPart>7.5&&aPart<9.5))drop=1.-dress;
if(aPart>10.5)drop=1.-longHair;
if(drop>.5)transformed=vec3(0.,1.2,0.);
// hats: from a low trilby crown to a full top hat
if(aPart>3.5&&aPart<4.5&&position.y>1.733)transformed.y=1.733+(position.y-1.733)*mix(.35,1.,fract(aSkin*11.3));
// a cheer: sleeves and hands swing up round the shoulder, a bounce
if((aPart>2.5&&aPart<3.5)||(aPart>6.5&&aPart<7.5)){float sd=sign(position.x);vec2 sp=vec2(.2*sd,1.42);vec2 q=transformed.xy-sp;
  float a=-sd*ex*(2.4+.5*sin(uTime*7.+ph))-sd*.06;float c=cos(a),s=sin(a);transformed.xy=sp+vec2(c*q.x-s*q.y,s*q.x+c*q.y);}
transformed.y+=max(0.,sin(uTime*(5.+aSkin*3.)+ph))*.14*ex+sin(uTime*1.3+ph)*.01;`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vPart;varying float vSkin;varying vec3 vP;')
            .replace('#include <color_fragment>', `#include <color_fragment>
{ float k=fract(vSkin*31.7), dress=step(fract(vSkin*5.71),.45);
  vec3 skin=mix(vec3(.74,.53,.41),vec3(.24,.14,.09),vSkin*vSkin);
  vec3 trou=k<.4?vec3(.06,.07,.1):k<.7?vec3(.3,.26,.19):k<.85?vec3(.52,.5,.46):vec3(.13,.17,.28);
  vec3 hair=k<.3?vec3(.05,.035,.025):k<.55?vec3(.24,.15,.08):k<.75?vec3(.55,.42,.24):vec3(.42,.41,.4);
  vec3 hatc=mix(vec3(.9,.86,.8),diffuseColor.rgb*1.2,step(.5,fract(vSkin*3.1)));
  vec3 top=diffuseColor.rgb;
  float p=vPart;
  if(p<.5)diffuseColor.rgb=trou;
  else if(p<1.5){
    // a suit: shirt and tie in the V of the lapels
    float v=(1.-dress)*step(0.,vP.z)*step(1.25,vP.y)*step(abs(vP.x),(1.49-vP.y)*.27);
    float tie=step(abs(vP.x),.011+(1.45-vP.y)*.035)*step(vP.y,1.45);
    vec3 tiec=mix(vec3(.55,.08,.1),vec3(.12,.2,.45),step(.5,fract(vSkin*17.3)));
    diffuseColor.rgb=mix(top,mix(vec3(.93,.92,.9),tiec,tie),v); }
  else if(p<2.5){
    // a face: eyes, brows and a mouth on the front of the head
    vec3 c=skin;float fr=smoothstep(.05,.075,vP.z);
    float eye=1.-smoothstep(.0075,.0105,length(vec2(abs(vP.x)-.03,(vP.y-1.638)*1.25)));
    float brow=(1.-smoothstep(.003,.006,abs(vP.y-1.661+.08*abs(vP.x))))*(1.-smoothstep(.012,.02,abs(abs(vP.x)-.031)));
    float mouth=(1.-smoothstep(.003,.006,abs(vP.y-1.584+.25*vP.x*vP.x)))*(1.-smoothstep(.016,.024,abs(vP.x)));
    c=mix(c,vec3(.05,.035,.03),eye*fr);c=mix(c,hair*.8,brow*fr*.85);c=mix(c,c*vec3(.62,.42,.4),mouth*fr);
    diffuseColor.rgb=c; }
  else if((p>9.5&&p<10.5)||(p>6.5&&p<7.5))diffuseColor.rgb=skin;
  else if(p<3.5)diffuseColor.rgb=top;
  else if(p<4.5)diffuseColor.rgb=hatc;
  else if(p<5.5||p>10.5)diffuseColor.rgb=hair;
  else if(p<6.5)diffuseColor.rgb=mix(vec3(.05,.035,.03),top*.8,dress);
  else if(p<8.5)diffuseColor.rgb=top;
  else diffuseColor.rgb=mix(skin,vec3(.1),step(.6,k)); }`);
    };
    return mat;
}
