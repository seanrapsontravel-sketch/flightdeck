// The racecourse: turf, rails, stalls, furlong poles, the finish gantry and winning post, a grandstand with a
// living crowd, marquees, trees, a lake and rolling country out to the haze.
import * as THREE from 'three';
import { mergeGeometries } from './merge.js';

export const TICK = 20;          // metres per mark
export const FINISH = 9 * TICK;  // score 9
export const RAIL_Z = 10.8;      // running rails either side of the track
const NOISE = `float gh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float gn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(gh(i),gh(i+vec2(1,0)),f.x),mix(gh(i+vec2(0,1)),gh(i+vec2(1,1)),f.x),f.y);}
float gf(vec2 p){return gn(p)*.5+gn(p*2.03+1.7)*.25+gn(p*4.1+3.1)*.125+gn(p*8.3+5.3)*.0625;}`;

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function canvasTex(w, h, draw, srgb = true) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
}
const FONT = '"Avenir Next Condensed", "DIN Condensed", "Arial Narrow", Arial, sans-serif';

export class Course {
    constructor(engine) {
        this.engine = engine;
        this.root = new THREE.Group();
        engine.scene.add(this.root);
        this.time = engine.time;
        this.excite = { value: 0 };
        this.flags = [];
        this.ground();
        this.rails();
        this.furlongs();
        this.finishLine();
        this.grandstand();
        this.crowd();
        this.marquees();
        this.trees();
        this.lake();
        this.hills();
        this.stallGroup = new THREE.Group();
        this.root.add(this.stallGroup);
    }

    // ------------------------------------------------------------------ turf
    ground() {
        const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, envMapIntensity: 0.55 });
        m.onBeforeCompile = (sh) => {
            sh.uniforms.uRail = { value: RAIL_Z };
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vG;')
                .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvG=(modelMatrix*vec4(transformed,1.)).xyz;');
            sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vG;uniform float uRail;\n' + NOISE)
                .replace('#include <color_fragment>', `#include <color_fragment>
{ vec2 p=vG.xz;float az=abs(p.y);
  float macro=gf(p*.018),mid=gf(p*.21),fine=gn(p*3.1)*.6+gn(p*9.7)*.4;
  vec3 grass=mix(vec3(.052,.14,.022),vec3(.085,.19,.03),macro);
  grass=mix(grass,vec3(.11,.17,.035),smoothstep(.55,.85,mid)*.35);
  grass*=.9+.2*fine;
  vec3 col=grass;
  // the racing surface: cross-mown stripes, a little wear down the middle of the lanes
  float tr=1.-smoothstep(uRail-.2,uRail+.25,az);
  float st=smoothstep(.42,.58,abs(fract(p.x/9.)-.5)*2.);
  vec3 track=grass*mix(.86,1.12,st)*vec3(1.,1.04,.96);
  track=mix(track,vec3(.11,.15,.05),smoothstep(.6,.9,gf(p*vec2(.6,1.6)))*.18*(1.-smoothstep(4.,9.,az)));
  col=mix(col,track,tr);
  // inside the rails' feet: a mown verge
  col*=1.-.18*(1.-smoothstep(.0,.5,abs(az-uRail)));
  // apron lawn: diagonal checkerboard; concourse: warm paving
  float ap=smoothstep(uRail+.4,uRail+.7,-p.y)*(1.-smoothstep(23.8,24.,-p.y));
  float ck=step(.5,fract((p.x+p.y)/7.))*step(.5,fract((p.x-p.y)/7.))+step(fract((p.x+p.y)/7.),.5)*step(fract((p.x-p.y)/7.),.5);
  col=mix(col,grass*mix(.9,1.1,ck)*1.06,ap);
  float pav=smoothstep(24.,24.2,-p.y)*(1.-smoothstep(33.6,34.,-p.y));
  vec2 tl=fract(p/vec2(1.2,.6));float jt=smoothstep(.0,.04,min(min(tl.x,1.-tl.x),min(tl.y,1.-tl.y)));
  col=mix(col,vec3(.44,.4,.33)*(.85+.15*jt)*(.92+.16*gn(p*.7)),pav);
  // infield: broad stripes
  float inf=smoothstep(uRail+.4,uRail+.7,p.y);
  col=mix(col,grass*mix(.9,1.1,step(.5,fract(p.x/14.))),inf*(1.-smoothstep(260.,300.,length(p-vec2(90.,120.)))));
  // far country: a patchwork of fields
  float far=smoothstep(380.,560.,length(p-vec2(90.,0.)));
  vec2 cell=floor(p/vec2(140.,95.)+vec2(gn(p*.004)*1.5));float r=gh(cell);
  vec3 field=r<.55?mix(vec3(.06,.13,.03),vec3(.09,.17,.04),gh(cell+3.)):r<.8?vec3(.2,.17,.06):vec3(.13,.15,.05);
  field*=.85+.3*gf(p*.05);
  col=mix(col,field,far);
  diffuseColor.rgb=col; }`)
                .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
{ float pav=smoothstep(24.,24.2,-vG.z)*(1.-smoothstep(33.6,34.,-vG.z));roughnessFactor=mix(.95,.72,pav); }`);
        };
        const g = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000, 1, 1).rotateX(-Math.PI / 2), m);
        g.receiveShadow = true;
        this.root.add(g);
    }

    // ------------------------------------------------------------------ running rails
    rails() {
        const white = new THREE.MeshPhysicalMaterial({ color: '#f4f2ee', roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 1 });
        const x0 = -90, x1 = 330, len = x1 - x0;
        const parts = [];
        for (const side of [1, -1]) {
            const z = RAIL_Z * side;
            const rail = new THREE.CylinderGeometry(0.075, 0.075, len, 12, 1).rotateZ(Math.PI / 2).translate((x0 + x1) / 2, 1.08, z);
            parts.push(rail);
        }
        this.root.add(Object.assign(new THREE.Mesh(mergeGeometries(parts), white), { castShadow: true, receiveShadow: true }));
        // goose-neck posts: an upright set back from the rail with an arm out beneath it
        const post = mergeGeometries([
            new THREE.CylinderGeometry(0.045, 0.055, 1.02, 8).translate(0, 0.51, 0.34),
            new THREE.CylinderGeometry(0.035, 0.035, 0.42, 6).rotateX(Math.PI / 2).translate(0, 0.98, 0.17),
        ]);
        const n = Math.floor(len / 3.2);
        const posts = new THREE.InstancedMesh(post, white, n * 2);
        const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
        let k = 0;
        for (const side of [1, -1]) for (let i = 0; i < n; i++) {
            q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), side > 0 ? 0 : Math.PI);
            M.compose(new THREE.Vector3(x0 + i * 3.2, 0, RAIL_Z * side), q, s);
            posts.setMatrixAt(k++, M);
        }
        posts.castShadow = true; posts.receiveShadow = true;
        this.root.add(posts);
        // advertising boards beneath the far rail and along the apron
        const boardTex = canvasTex(2048, 128, (g, w, h) => {
            const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#13213f'); gr.addColorStop(1, '#0a1428');
            g.fillStyle = gr; g.fillRect(0, 0, w, h);
            g.fillStyle = '#d9b46a'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
            const words = ['THE DERBY', '★', 'FLIGHT DECK', '★', 'POST TIME', '★', 'GRAND STAND', '★'];
            g.font = `800 64px ${FONT}`; g.textBaseline = 'middle';
            let x = 30;
            for (let i = 0; x < w; i++) { const t = words[i % words.length]; g.fillStyle = t === '★' ? '#d9b46a' : '#f5efe2'; g.fillText(t, x, h / 2 + 4); x += g.measureText(t).width + 54; }
        });
        boardTex.wrapS = THREE.RepeatWrapping; boardTex.repeat.set(len / 32, 1);
        const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.45, emissive: '#ffffff', emissiveMap: boardTex, emissiveIntensity: 0.12 });
        const board = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.62), boardMat);
        board.position.set((x0 + x1) / 2, 0.42, -RAIL_Z - 0.62);
        board.receiveShadow = true;
        this.root.add(board);
    }

    // ------------------------------------------------------------------ distance poles (furlongs to run)
    furlongs() {
        const pole = new THREE.CylinderGeometry(0.06, 0.07, 3.2, 10).translate(0, 1.6, 0);
        const poleTex = canvasTex(32, 256, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f3f0ea' : '#c8202a'; g.fillRect(0, i * h / 8, w, h / 8); } });
        const poleMat = new THREE.MeshStandardMaterial({ map: poleTex, roughness: 0.4 });
        for (let s = 1; s <= 8; s++) {
            const toGo = 9 - s;
            const grp = new THREE.Group();
            grp.position.set(s * TICK, 0, -RAIL_Z - 0.55);
            const p = new THREE.Mesh(pole, poleMat); p.castShadow = true; grp.add(p);
            const tex = canvasTex(256, 256, (g, w, h) => {
                g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2); g.fill();
                g.lineWidth = 14; g.strokeStyle = '#c8202a'; g.stroke();
                g.fillStyle = '#10151f'; g.textAlign = 'center'; g.textBaseline = 'middle';
                g.font = `900 150px ${FONT}`; g.fillText(String(toGo), w / 2, h / 2 + 10);
            });
            const disc = new THREE.Mesh(new THREE.CircleGeometry(0.52, 40), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.15 }));
            disc.position.set(0, 3.45, 0.05); disc.castShadow = true;
            grp.add(disc);
            this.root.add(grp);
        }
    }

    // ------------------------------------------------------------------ finish: gantry, winning post, line
    finishLine() {
        const F = FINISH;
        const navy = new THREE.MeshPhysicalMaterial({ color: '#101a33', roughness: 0.35, metalness: 0.6, clearcoat: 0.5, envMapIntensity: 1.2 });
        const gold = new THREE.MeshStandardMaterial({ color: '#d6ad5c', roughness: 0.25, metalness: 1, envMapIntensity: 1.4 });
        const g = new THREE.Group(); g.position.x = F;
        for (const s of [1, -1]) {
            const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.9, 8.4, 0.9), navy); pylon.position.set(0, 4.2, (RAIL_Z + 1.6) * s); pylon.castShadow = true; g.add(pylon);
            const trim = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.12, 0.94), gold);
            for (const y of [0.5, 4.2, 7.9]) { const t = trim.clone(); t.position.set(0, y, (RAIL_Z + 1.6) * s); g.add(t); }
        }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, (RAIL_Z + 1.6) * 2 + 0.9), navy); beam.position.set(0, 8.3, 0); beam.castShadow = true; g.add(beam);
        // the LED face: animated chequer and FINISH, emissive so it blooms
        const ledCv = document.createElement('canvas'); ledCv.width = 1024; ledCv.height = 96;
        const ledTex = new THREE.CanvasTexture(ledCv); ledTex.colorSpace = THREE.SRGBColorSpace;
        this.led = { cv: ledCv, tex: ledTex, t: 0, mode: 'finish' };
        for (const s of [1, -1]) {
            const led = new THREE.Mesh(new THREE.PlaneGeometry((RAIL_Z + 1.6) * 2 - 0.6, 1.45), new THREE.MeshBasicMaterial({ map: ledTex, toneMapped: true, color: new THREE.Color(2.2, 2.2, 2.2) }));
            led.position.set(0.56 * s, 8.3, 0); led.rotation.y = s * Math.PI / 2; g.add(led);
        }
        this.drawLed(0);
        // winning post: the red disc on white, on the far side
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 4.6, 16).translate(0, 2.3, 0), new THREE.MeshStandardMaterial({ color: '#f2efe8', roughness: 0.3 }));
        post.position.set(0, 0, -RAIL_Z - 0.7); post.castShadow = true; g.add(post);
        const discTex = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#f7f4ee'; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); c.fill(); c.fillStyle = '#c51f2b'; c.beginPath(); c.arc(w / 2, h / 2, w * 0.3, 0, Math.PI * 2); c.fill(); });
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.75, 48), new THREE.MeshStandardMaterial({ map: discTex, side: THREE.DoubleSide, roughness: 0.35 }));
        disc.position.set(0, 4.9, -RAIL_Z - 0.7); disc.rotation.y = Math.PI / 2; disc.castShadow = true; g.add(disc);
        // the line itself, a crisp white stripe with a chequered edge
        const lineTex = canvasTex(64, 1024, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; for (let y = 0; y < h; y += 32) c.fillRect((y / 32) % 2 ? 0 : 32, y, 32, 32); });
        const line = new THREE.Mesh(new THREE.PlaneGeometry(0.5, RAIL_Z * 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: lineTex, roughness: 0.8, transparent: true, opacity: 0.88, polygonOffset: true, polygonOffsetFactor: -2 }));
        line.position.set(0, 0.012, 0); line.receiveShadow = true; g.add(line);
        // photo-finish box on the far side
        const box = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, 2.2), new THREE.MeshStandardMaterial({ color: '#efeae0', roughness: 0.5 }));
        box.position.set(0, 7.2, -RAIL_Z - 12); box.castShadow = true; g.add(box);
        this.root.add(g);
        this.gantry = g;
        // flower beds around the winning post
        this.flowers(F - 14, F + 14, -RAIL_Z - 1.5, -RAIL_Z - 3.2);
    }

    drawLed(t, text) {
        const { cv, tex } = this.led, g = cv.getContext('2d'), w = cv.width, h = cv.height;
        g.fillStyle = '#05070d'; g.fillRect(0, 0, w, h);
        const sz = 24, off = (t * 40) % (sz * 2);
        for (let x = -sz * 2; x < w + sz * 2; x += sz) for (let y = 0; y < h; y += sz) {
            if (((x + y) / sz) % 2 === 0) continue;
            if (x > 200 && x < w - 220) continue;
            g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(x + (y / sz % 2 ? off : -off) % (sz * 2), y, sz, sz);
        }
        g.font = `900 78px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, '#fff3c8'); grad.addColorStop(1, '#ffb43a');
        g.fillStyle = grad; g.fillText(text || 'FINISH', w / 2, h / 2 + 4);
        // pixel grid
        g.fillStyle = 'rgba(0,0,0,0.35)';
        for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h);
        for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
        tex.needsUpdate = true;
    }

    flowers(x0, x1, z0, z1) {
        const r = rng(7);
        const bed = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.35, Math.abs(z1 - z0)), new THREE.MeshStandardMaterial({ color: '#1f3214', roughness: 0.9 }));
        bed.position.set((x0 + x1) / 2, 0.17, (z0 + z1) / 2); bed.receiveShadow = true; this.root.add(bed);
        const n = 900, bloom = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.11, 0), new THREE.MeshStandardMaterial({ roughness: 0.6 }), n);
        const M = new THREE.Matrix4(), cols = ['#e8355a', '#f7f3f0', '#ff8fb1', '#ffd34d', '#c1123d'].map((c) => new THREE.Color(c));
        for (let i = 0; i < n; i++) {
            const s = 0.6 + r() * 0.8;
            M.makeScale(s, s, s).setPosition(x0 + r() * (x1 - x0), 0.38 + r() * 0.12, Math.min(z0, z1) + r() * Math.abs(z1 - z0));
            bloom.setMatrixAt(i, M); bloom.setColorAt(i, cols[(r() * cols.length) | 0]);
        }
        this.root.add(bloom);
    }

    // ------------------------------------------------------------------ grandstand
    grandstand() {
        const x0 = -20, x1 = 215, L = x1 - x0, cx = (x0 + x1) / 2;
        const concrete = new THREE.MeshStandardMaterial({ color: '#d9d4ca', roughness: 0.85 });
        const dark = new THREE.MeshStandardMaterial({ color: '#2a3140', roughness: 0.7 });
        const roofMat = new THREE.MeshStandardMaterial({ color: '#f1efea', roughness: 0.5, side: THREE.DoubleSide });
        const steel = new THREE.MeshStandardMaterial({ color: '#e8e6e1', roughness: 0.35, metalness: 0.3 });
        const g = new THREE.Group();
        // tiers
        const tiers = [];
        this.tierRows = [];
        for (let i = 0; i < 16; i++) {
            const z = -34.5 - i * 1.25, y = 1.6 + i * 0.62;
            tiers.push(new THREE.BoxGeometry(L, y, 1.25).translate(cx, y / 2, z - 0.625));
            this.tierRows.push({ z: z - 0.5, y });
        }
        const tierMesh = new THREE.Mesh(mergeGeometries(tiers), dark); tierMesh.receiveShadow = true; tierMesh.castShadow = true; g.add(tierMesh);
        // podium wall with glass balustrade
        const wall = new THREE.Mesh(new THREE.BoxGeometry(L, 1.6, 0.5), concrete); wall.position.set(cx, 0.8, -34.3); wall.castShadow = true; wall.receiveShadow = true; g.add(wall);
        const glass = new THREE.Mesh(new THREE.BoxGeometry(L, 1.05, 0.04), new THREE.MeshPhysicalMaterial({ color: '#bcd3dd', roughness: 0.05, transmission: 0, transparent: true, opacity: 0.35, envMapIntensity: 1.5 }));
        glass.position.set(cx, 2.1, -34.15); g.add(glass);
        // upper hospitality level: glazed boxes glowing warm inside
        const upperY = 1.6 + 16 * 0.62;
        const box = new THREE.Mesh(new THREE.BoxGeometry(L, 7, 10), concrete); box.position.set(cx, upperY + 3.5, -60); box.castShadow = true; box.receiveShadow = true; g.add(box);
        const winTex = canvasTex(2048, 128, (c, w, h) => {
            const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a3a52'); gr.addColorStop(0.55, '#1a2436'); gr.addColorStop(1, '#0c111c');
            c.fillStyle = gr; c.fillRect(0, 0, w, h);
            const r = rng(3);
            for (let x = 0; x < w; x += 32) {
                if (r() < 0.55) { c.fillStyle = `rgba(255,${(196 + r() * 40) | 0},${(140 + r() * 50) | 0},${0.18 + r() * 0.3})`; c.fillRect(x + 2, h * 0.35, 28, h * 0.6); }
                c.fillStyle = 'rgba(12,16,24,0.95)'; c.fillRect(x, 0, 3, h);
            }
            c.fillStyle = 'rgba(12,16,24,0.95)'; c.fillRect(0, h * 0.3, w, 3);
            c.fillStyle = 'rgba(255,255,255,0.12)'; for (let x = 0; x < w; x += 128) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 50, 0); c.lineTo(x + 10, h); c.lineTo(x - 40, h); c.fill(); }
        });
        winTex.wrapS = THREE.RepeatWrapping; winTex.repeat.set(L / 64, 1);
        const windows = new THREE.Mesh(new THREE.PlaneGeometry(L, 4.6), new THREE.MeshStandardMaterial({ map: winTex, emissiveMap: winTex, emissive: new THREE.Color(0.5, 0.42, 0.32), roughness: 0.08, metalness: 0.6, envMapIntensity: 1.6 }));
        windows.position.set(cx, upperY + 3.6, -54.95); g.add(windows);
        // roof: a thin cantilevered blade with a lit fascia
        const roofY = upperY + 9.5;
        const under = new THREE.MeshStandardMaterial({ color: '#6d7179', roughness: 0.6, metalness: 0.2, envMapIntensity: 0.35 });
        const roof = new THREE.Mesh(new THREE.BoxGeometry(L + 6, 0.45, 34), [roofMat, roofMat, roofMat, under, under, roofMat]); roof.position.set(cx, roofY, -48); roof.rotation.x = -0.04; roof.castShadow = true; roof.receiveShadow = true; g.add(roof);
        const fascia = new THREE.Mesh(new THREE.BoxGeometry(L + 6, 0.9, 0.3), new THREE.MeshStandardMaterial({ color: '#0f1830', roughness: 0.4, emissive: '#ffcf86', emissiveIntensity: 0 }));
        fascia.position.set(cx, roofY + 0.05 - 0.04 * 17 * 0.5, -31.1); g.add(fascia);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(L + 6, 0.08, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.3, 1.4) }));
        strip.position.set(cx, fascia.position.y - 0.32, -30.92); g.add(strip);
        // cantilever trusses
        for (let x = x0; x <= x1 + 0.1; x += 23.5) {
            const t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 30).translate(0, 0, 0), steel);
            t.position.set(x, roofY + 1.6, -47); t.rotation.x = -0.12; t.castShadow = true; g.add(t);
            const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, roofY + 2, 12).translate(0, (roofY + 2) / 2, 0), steel); col.position.set(x, 0, -64); col.castShadow = true; g.add(col);
        }
        // clock tower at the centre
        const tower = new THREE.Group(); tower.position.set(95, 0, -70);
        const tb = new THREE.Mesh(new THREE.BoxGeometry(9, 38, 9), concrete); tb.position.y = 19; tb.castShadow = true; tower.add(tb);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(7, 7, 4).rotateY(Math.PI / 4), new THREE.MeshStandardMaterial({ color: '#1f5a43', roughness: 0.45, metalness: 0.4 })); cap.position.y = 41.5; cap.castShadow = true; tower.add(cap);
        const clockTex = canvasTex(256, 256, (c, w, h) => {
            c.fillStyle = '#f7f1e3'; c.beginPath(); c.arc(128, 128, 122, 0, Math.PI * 2); c.fill(); c.lineWidth = 10; c.strokeStyle = '#c9a256'; c.stroke();
            c.fillStyle = '#1b1b1b'; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.fillRect(128 + Math.sin(a) * 96 - 4, 128 - Math.cos(a) * 96 - 10, 8, 20); }
            c.strokeStyle = '#1b1b1b'; c.lineCap = 'round'; c.lineWidth = 9; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + 52, 128 + 20); c.stroke(); c.lineWidth = 6; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 - 10, 128 - 80); c.stroke();
        });
        const clock = new THREE.Mesh(new THREE.CircleGeometry(3.1, 48), new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.4, emissive: '#ffffff', emissiveMap: clockTex, emissiveIntensity: 0.2 }));
        clock.position.set(0, 32, 4.52); tower.add(clock);
        g.add(tower);
        // flags along the roof
        const flagCols = ['#c8202a', '#1d3a8a', '#f2c230', '#1f7a4d', '#f4f1ea', '#7a1f6f'];
        for (let i = 0, x = x0 + 6; x < x1; x += 14, i++) this.flag(g, new THREE.Vector3(x, roofY + 0.2, -31.6), flagCols[i % flagCols.length], i);
        this.root.add(g);
        this.stand = { x0, x1, roofY, upperY };
    }

    flag(parent, pos, color, i) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 6, 6).translate(0, 3, 0), new THREE.MeshStandardMaterial({ color: '#dddad2', metalness: 0.6, roughness: 0.3 }));
        pole.position.copy(pos); parent.add(pole);
        const geo = new THREE.PlaneGeometry(2.4, 1.4, 16, 6).translate(1.2, 0, 0);
        const mat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.6 });
        const ph = i * 1.7;
        mat.onBeforeCompile = (sh) => {
            sh.uniforms.uTime = this.time;
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
                .replace('#include <begin_vertex>', `#include <begin_vertex>
float k=position.x/2.4;float w=sin(position.x*2.6-uTime*6.+${ph.toFixed(2)})*.22*k+sin(position.x*5.-uTime*9.3+position.y*2.)*.06*k;
transformed.z+=w;transformed.y-=k*k*.12;`)
                .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
{float k=position.x/2.4;objectNormal=normalize(vec3(-cos(position.x*2.6-uTime*6.+${ph.toFixed(2)})*.57*k,0.,1.));}`);
        };
        const flag = new THREE.Mesh(geo, mat);
        flag.position.copy(pos).add(new THREE.Vector3(0.05, 5.2, 0)); flag.rotation.y = Math.PI * 0.85; flag.castShadow = true;
        parent.add(flag);
    }

    // ------------------------------------------------------------------ crowd: thousands of instanced people
    crowd() {
        const r = rng(11);
        const part = (g, v) => { const c = new Float32Array(g.attributes.position.count).fill(v); g.setAttribute('aPart', new THREE.BufferAttribute(c, 1)); return g; };
        const legs = new THREE.CapsuleGeometry(0.15, 0.55, 1, 6).scale(1.15, 1, 0.8).translate(0, 0.43, 0);
        const torso = new THREE.CapsuleGeometry(0.19, 0.34, 2, 8).scale(1.12, 1, 0.78).translate(0, 1.07, 0);
        const head = new THREE.SphereGeometry(0.115, 8, 6).translate(0, 1.55, 0);
        const armL = new THREE.CapsuleGeometry(0.05, 0.46, 1, 4).translate(0.255, 1.08, 0);
        const armR = new THREE.CapsuleGeometry(0.05, 0.46, 1, 4).translate(-0.255, 1.08, 0);
        const hat = mergeGeometries([new THREE.CylinderGeometry(0.22, 0.22, 0.02, 10).translate(0, 1.64, 0), new THREE.CylinderGeometry(0.11, 0.12, 0.11, 8).translate(0, 1.7, 0)]);
        const geo = mergeGeometries([part(legs, 0), part(torso, 1), part(head, 2), part(armL, 3), part(armR, 3), part(hat, 4)]);
        const spots = [];
        // seated rows in the stand
        for (const row of this.tierRows) {
            for (let x = this.stand.x0 + 1; x < this.stand.x1 - 1; x += 0.62 + r() * 0.25) {
                if (r() < 0.1) continue;
                spots.push([x + r() * 0.1, row.y - 0.3, row.z + (r() - 0.5) * 0.2, 0.92 + r() * 0.12, 1]);
            }
        }
        // standing along the apron rail, thickest toward the finish
        for (let i = 0; i < 2600; i++) {
            const x = -10 + Math.pow(r(), 0.65) * 225;
            const zz = -RAIL_Z - 1.6 - Math.pow(r(), 1.6) * 9;
            if (x > 162 && x < 198 && zz > -16) continue; // flower beds at the post
            spots.push([x, 0, zz, 0.95 + r() * 0.15, 0]);
        }
        const n = spots.length;
        const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), n);
        const shirt = ['#c8202a', '#1d3a8a', '#f2efe8', '#f2c230', '#2c7a52', '#202326', '#e98bb0', '#6fa8dc', '#e86a2a', '#8e5bb5', '#efe1c2', '#405e7d'].map((c) => new THREE.Color(c));
        const M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
        const skin = new Float32Array(n);
        spots.forEach(([x, y, z, s, seated], i) => {
            q.setFromAxisAngle(up, (r() - 0.5) * 0.6);
            M.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, seated ? s * 0.82 : s, s));
            mesh.setMatrixAt(i, M);
            mesh.setColorAt(i, shirt[(r() * shirt.length) | 0].clone().multiplyScalar(0.75 + r() * 0.3));
            skin[i] = r();
        });
        geo.setAttribute('aSkin', new THREE.InstancedBufferAttribute(skin, 1));
        const ex = this.excite, tm = this.time;
        mesh.material.onBeforeCompile = (sh) => {
            sh.uniforms.uTime = tm; sh.uniforms.uEx = ex;
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime,uEx;attribute float aPart;attribute float aSkin;varying float vPart;varying float vSkin;varying float vY;')
                .replace('#include <begin_vertex>', `#include <begin_vertex>
vPart=aPart;vSkin=aSkin;vY=position.y;
float ph=aSkin*6.283+float(gl_InstanceID)*.37;
float ex=uEx*(.45+.55*fract(aSkin*13.7));
float hatOn=step(.68,fract(aSkin*7.31));
if(aPart>3.5&&hatOn<.5)transformed=vec3(0.,1.5,0.);
// a cheer: arms swing up round the shoulder, a bounce
if(aPart>2.5&&aPart<3.5){float sd=sign(position.x);vec2 sp=vec2(.255*sd,1.33);vec2 q=transformed.xy-sp;
  float a=-sd*ex*(2.4+.5*sin(uTime*7.+ph))-sd*.08;float c=cos(a),s=sin(a);transformed.xy=sp+vec2(c*q.x-s*q.y,s*q.x+c*q.y);}
transformed.y+=max(0.,sin(uTime*(5.+aSkin*3.)+ph))*.14*ex+sin(uTime*1.3+ph)*.01;`);
            sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vPart;varying float vSkin;varying float vY;')
                .replace('#include <color_fragment>', `#include <color_fragment>
{ float k=fract(vSkin*31.7);
  vec3 skin=mix(vec3(.62,.42,.31),vec3(.2,.12,.08),vSkin*vSkin);
  vec3 trou=k<.4?vec3(.06,.07,.1):k<.7?vec3(.28,.24,.17):k<.85?vec3(.5,.48,.44):vec3(.12,.16,.26);
  vec3 hair=k<.3?vec3(.05,.035,.025):k<.6?vec3(.22,.14,.07):k<.8?vec3(.5,.4,.25):vec3(.4,.4,.4);
  vec3 hatc=mix(vec3(.9,.86,.8),diffuseColor.rgb*1.2,step(.5,fract(vSkin*3.1)));
  if(vPart<.5)diffuseColor.rgb=trou;
  else if(vPart<1.5){}
  else if(vPart<2.5)diffuseColor.rgb=mix(skin,hair,smoothstep(1.57,1.6,vY));
  else if(vPart<3.5)diffuseColor.rgb=mix(diffuseColor.rgb,skin,step(.5,fract(vSkin*5.3))*smoothstep(1.05,.95,vY));
  else diffuseColor.rgb=hatc; }`);
        };
        mesh.castShadow = false; mesh.receiveShadow = true;
        this.root.add(mesh);
        this.crowdMesh = mesh;
    }

    // ------------------------------------------------------------------ hospitality marquees and parasols on the apron lawn
    marquees() {
        const white = new THREE.MeshStandardMaterial({ color: '#f6f3ec', roughness: 0.75 });
        const stripe = canvasTex(64, 64, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#f6f3ec' : '#2b4a7a'; c.fillRect(i * 8, 0, 8, h); } });
        const roof = new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.7 });
        for (const x of [-6, 22, 210, 236]) {
            const t = new THREE.Group(); t.position.set(x, 0, -19);
            const b = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 8), white); b.position.y = 1.5; b.castShadow = true; b.receiveShadow = true; t.add(b);
            const r = new THREE.Mesh(new THREE.ConeGeometry(7.6, 3.2, 4, 1).rotateY(Math.PI / 4).scale(1.1, 1, 0.75), roof); r.position.y = 4.6; r.castShadow = true; t.add(r);
            this.root.add(t);
        }
    }

    // ------------------------------------------------------------------ trees: soft stylised broadleaves and poplars
    trees() {
        const r = rng(23);
        const blob = (cx, cy, cz, s) => {
            const g = new THREE.IcosahedronGeometry(s, 1);
            const p = g.attributes.position, n = g.attributes.normal;
            for (let i = 0; i < p.count; i++) {
                const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
                const d = 1 + 0.12 * Math.sin(x * 3.1 + z * 2.3) * Math.cos(y * 2.7);
                p.setXYZ(i, x * d + cx, y * d * 0.92 + cy, z * d + cz);
            }
            return g;
        };
        const makeTree = (seed) => {
            const rr = rng(seed), parts = [];
            const h = 4.5 + rr() * 2;
            for (let i = 0; i < 6; i++) {
                const a = rr() * Math.PI * 2, rad = rr() * 1.6;
                parts.push(blob(Math.cos(a) * rad, h + (rr() - 0.3) * 2.2, Math.sin(a) * rad, 1.6 + rr() * 1.1));
            }
            const crown = mergeGeometries(parts.map((g) => g.toNonIndexed ? g : g));
            // soft normals: point out from the crown's centre so it shades as one fluffy mass
            const p = crown.attributes.position, n = crown.attributes.normal, c = new THREE.Vector3(0, h + 0.3, 0), v = new THREE.Vector3(), m = new THREE.Vector3();
            for (let i = 0; i < p.count; i++) {
                v.set(p.getX(i), p.getY(i), p.getZ(i)).sub(c).normalize();
                m.set(n.getX(i), n.getY(i), n.getZ(i)).lerp(v, 0.7).normalize();
                n.setXYZ(i, m.x, m.y, m.z);
            }
            const trunk = new THREE.CylinderGeometry(0.18, 0.3, h, 7).translate(0, h / 2, 0);
            return { crown, trunk };
        };
        const variants = [makeTree(1), makeTree(2), makeTree(3)];
        const poplarCrown = (() => { const g = new THREE.SphereGeometry(1, 14, 12).scale(1.5, 6, 1.5).translate(0, 8.5, 0); return g; })();
        const spots = [];
        const add = (x, z, s, kind = 0) => spots.push({ x, z, s, kind, v: (r() * 3) | 0, rot: r() * 6.28 });
        // behind the stand and either end
        for (let i = 0; i < 160; i++) add(-60 + r() * 330, -80 - r() * 70, 1 + r() * 0.6);
        for (let i = 0; i < 50; i++) add(-70 - r() * 60, -60 + r() * 100, 0.9 + r() * 0.6);
        for (let i = 0; i < 50; i++) add(260 + r() * 70, -60 + r() * 120, 0.9 + r() * 0.6);
        // a poplar avenue beyond the far turn and along the infield
        for (let x = -40; x < 280; x += 16) add(x + r() * 3, 150 + r() * 4, 0.9 + r() * 0.3, 1);
        // infield copses
        for (let c = 0; c < 7; c++) { const cx = -20 + r() * 250, cz = 105 + r() * 40; for (let i = 0; i < 6; i++) add(cx + (r() - 0.5) * 22, cz + (r() - 0.5) * 16, 0.8 + r() * 0.6); }
        // distant woods
        for (let i = 0; i < 260; i++) { const a = r() * Math.PI * 2, d = 330 + r() * 260; add(90 + Math.cos(a) * d, Math.sin(a) * d * 0.8, 1.3 + r(), 2); }
        const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.85, envMapIntensity: 0.6 });
        leafMat.onBeforeCompile = (sh) => {
            sh.uniforms.uTime = this.time;
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
                .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\nfloat sway=sin(uTime*.8+instanceMatrix[3].x*.1+instanceMatrix[3].z*.07)*.06*max(position.y-3.,0.)*.2;transformed.x+=sway;\n#endif');
        };
        const barkMat = new THREE.MeshStandardMaterial({ color: '#4a3a2c', roughness: 0.9 });
        const greens = ['#3f6b22', '#4d7a26', '#365c1f', '#5a8530', '#2f5320'].map((c) => new THREE.Color(c));
        const M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
        const groups = [...variants.map((v) => ({ crown: v.crown, trunk: v.trunk, list: [], shadow: true })), { crown: poplarCrown, trunk: new THREE.CylinderGeometry(0.2, 0.3, 6, 6).translate(0, 3, 0), list: [], shadow: true },
            ...variants.map((v) => ({ crown: v.crown, trunk: v.trunk, list: [], shadow: false }))];
        for (const s of spots) groups[s.kind === 1 ? 3 : s.kind === 2 ? 4 + s.v : s.v].list.push(s);
        for (const G of groups) {
            const n = G.list.length; if (!n) continue;
            const crowns = new THREE.InstancedMesh(G.crown, leafMat, n), trunks = new THREE.InstancedMesh(G.trunk, barkMat, n);
            G.list.forEach((s, i) => {
                q.setFromAxisAngle(up, s.rot);
                M.compose(new THREE.Vector3(s.x, 0, s.z), q, new THREE.Vector3(s.s, s.s * (0.9 + r() * 0.25), s.s));
                crowns.setMatrixAt(i, M); trunks.setMatrixAt(i, M);
                crowns.setColorAt(i, greens[(r() * greens.length) | 0].clone().multiplyScalar(0.8 + r() * 0.35));
            });
            crowns.castShadow = trunks.castShadow = G.shadow; crowns.receiveShadow = true;
            this.root.add(crowns, trunks);
        }
    }

    // ------------------------------------------------------------------ the infield lake
    lake() {
        const m = new THREE.MeshPhysicalMaterial({ color: '#0d2a33', roughness: 0.04, metalness: 0, envMapIntensity: 1.25, clearcoat: 1, clearcoatRoughness: 0.03 });
        m.onBeforeCompile = (sh) => {
            sh.uniforms.uTime = this.time;
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vL;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvL=(modelMatrix*vec4(transformed,1.)).xyz;');
            sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;varying vec3 vL;\n' + NOISE)
                .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ vec2 p=vL.xz;float e=.15;
  float h0=gn(p*.35+uTime*vec2(.12,.05))+gn(p*1.1-uTime*vec2(.05,.16))*.5;
  float hx=gn((p+vec2(e,0.))*.35+uTime*vec2(.12,.05))+gn((p+vec2(e,0.))*1.1-uTime*vec2(.05,.16))*.5;
  float hz=gn((p+vec2(0.,e))*.35+uTime*vec2(.12,.05))+gn((p+vec2(0.,e))*1.1-uTime*vec2(.05,.16))*.5;
  vec3 nw=normalize(vec3(-(hx-h0)/e*.22,1.,-(hz-h0)/e*.22));
  normal=normalize((viewMatrix*vec4(nw,0.)).xyz); }`)
                .replace('#include <clearcoat_normal_fragment_begin>', '#include <clearcoat_normal_fragment_begin>\nclearcoatNormal=normal;');
        };
        const shape = new THREE.Shape();
        for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2, rr = 1 + 0.12 * Math.sin(a * 3) + 0.07 * Math.cos(a * 5); shape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 55 * rr, Math.sin(a) * 26 * rr); }
        const lake = new THREE.Mesh(new THREE.ShapeGeometry(shape, 48).rotateX(-Math.PI / 2), m);
        lake.position.set(110, 0.04, 66); lake.receiveShadow = true;
        this.root.add(lake);
        // the fountain: a plume of spray in the middle
        this.fountain = new THREE.Vector3(110, 0, 66);
    }

    // ------------------------------------------------------------------ rolling hills out to the horizon
    hills() {
        const segA = 160, segR = 14, g = new THREE.BufferGeometry(), pos = [], col = [], idx = [];
        const h1 = new THREE.Color('#3f5f2a'), h2 = new THREE.Color('#6d7f45'), h3 = new THREE.Color('#2c4524');
        for (let j = 0; j <= segR; j++) for (let i = 0; i <= segA; i++) {
            const a = i / segA * Math.PI * 2, t = j / segR, rad = 700 + t * t * 2600;
            const x = 90 + Math.cos(a) * rad, z = Math.sin(a) * rad;
            const n = Math.sin(a * 3 + 1) * 0.5 + Math.sin(a * 7.3 + 2) * 0.3 + Math.sin(a * 13.1) * 0.2;
            const y = Math.max(0, t * (60 + 120 * (0.5 + 0.5 * n)) * (1 - t * 0.3)) - (j === 0 ? 2 : 0);
            pos.push(x, y, z);
            const c = h1.clone().lerp(h2, 0.5 + 0.5 * Math.sin(a * 11 + j)).lerp(h3, 0.3 * (0.5 + 0.5 * Math.cos(a * 23 + j * 3)));
            col.push(c.r, c.g, c.b);
        }
        for (let j = 0; j < segR; j++) for (let i = 0; i < segA; i++) {
            const a = j * (segA + 1) + i, b = a + 1, c = a + segA + 1, d = c + 1;
            idx.push(a, b, c, b, d, c);
        }
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.setIndex(idx); g.computeVertexNormals();
        this.root.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: 0.4 })));
    }

    // ------------------------------------------------------------------ starting stalls, one bay per runner
    buildStalls(lanes) {
        this.stallGroup.children.slice().forEach((c) => { this.stallGroup.remove(c); c.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); });
        const green = new THREE.MeshStandardMaterial({ color: '#2f6b3d', roughness: 0.45, metalness: 0.35 });
        const pad = new THREE.MeshStandardMaterial({ color: '#f1efe9', roughness: 0.6 });
        const frontX = -2.0, backX = -5.3, H = 2.5;
        const zs = lanes.slice().sort((a, b) => a - b);
        const half = 0.62;
        const edges = [];
        zs.forEach((z) => { edges.push(z - half, z + half); });
        const parts = [], padParts = [];
        for (const z of edges) {
            parts.push(new THREE.BoxGeometry(frontX - backX, 0.08, 0.08).translate((frontX + backX) / 2, H, z));
            parts.push(new THREE.BoxGeometry(0.1, H, 0.1).translate(frontX, H / 2, z), new THREE.BoxGeometry(0.1, H, 0.1).translate(backX, H / 2, z));
            padParts.push(new THREE.BoxGeometry(frontX - backX - 0.3, 1.1, 0.06).translate((frontX + backX) / 2, 0.95, z));
        }
        const z0 = zs[0] - half - 0.6, z1 = zs[zs.length - 1] + half + 0.6;
        for (const x of [frontX, backX]) parts.push(new THREE.BoxGeometry(0.16, 0.22, z1 - z0).translate(x, H + 0.2, (z0 + z1) / 2));
        // wheels at each end
        const wheels = [];
        for (const z of [z0 - 0.2, z1 + 0.2]) for (const x of [frontX - 0.4, backX + 0.4]) wheels.push(new THREE.CylinderGeometry(0.42, 0.42, 0.25, 16).rotateX(Math.PI / 2).translate(x, 0.42, z));
        const frame = new THREE.Mesh(mergeGeometries(parts), green); frame.castShadow = true; frame.receiveShadow = true;
        const pads = new THREE.Mesh(mergeGeometries(padParts), pad); pads.castShadow = true;
        const w = new THREE.Mesh(mergeGeometries(wheels), new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.7 }));
        void pads;
        this.stallGroup.add(frame, w);
        // open front gates swung forward, and a bay number on the top beam
        zs.forEach((z, i) => {
            for (const s of [1, -1]) {
                const gate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.7, half - 0.02).translate(0, 0, s * (half - 0.02) / 2), green);
                gate.position.set(frontX, 1.25, z - s * half + s * 0.0); gate.rotation.y = -s * 1.25; gate.castShadow = true;
                gate.position.z = z + (s > 0 ? -half : half); gate.rotation.y = s > 0 ? -1.2 : 1.2;
                this.stallGroup.add(gate);
            }
            const tex = canvasTex(128, 128, (c, ww, hh) => { c.fillStyle = '#f7f4ee'; c.fillRect(0, 0, ww, hh); c.fillStyle = '#12161f'; c.font = `900 96px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(i + 1), ww / 2, hh / 2 + 6); });
            const num = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
            num.position.set(frontX + 0.09, H + 0.2, z); num.rotation.y = Math.PI / 2; this.stallGroup.add(num);
            const num2 = num.clone(); num2.position.x = backX - 0.09; num2.rotation.y = -Math.PI / 2; this.stallGroup.add(num2);
        });
    }

    update(dt, t) {
        this.led.t += dt;
        if (((this.led.t * 30) | 0) !== this.led.last) { this.led.last = (this.led.t * 30) | 0; this.drawLed(this.led.t, this.led.text); }
    }
}
