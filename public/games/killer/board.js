// The Board: a 7.2 m regulation dartboard inlaid in the club's marble floor. One mesh, one shader: the beds (black
// and cream marble singles, oxblood/green enamel doubles and trebles, a brass boss for the bull), brass wires, the
// black-lacquer number ring with its gold rules, and the game's information as light:
//   - each player's wedge carries three light bands (their marks, or lives as a killer), band 0 at the rim
//   - a killer's wedge burns crimson-gold; an out player's wedge goes dark with a red ledger line drawn through it
//   - strikes crack the band white-hot and drain it; a tracer of light runs round the ring from killer to victim
// Animations are designed durations (SEG_S per band, sequential per wedge, exactly as the server times them).
// truth: lit(n) is the number of bands fully lit on number n once settled.
import * as THREE from 'three';
import { WHEEL, wheelIndex, wedgeAngle, RADII } from '../lib3d/kit/darts.js';
import { BOARD_R, MM, RING_IN, RING_OUT, BANDS, SEG_S, CRIMSON, GOLD, NOISE, SERIF, V, ease, clamp01 } from './common.js';

const lin = (hex) => new THREE.Color(hex);

export class Board {
    constructor(engine, refl) {
        this.engine = engine;
        const N = 20;
        this.U = {
            uFill: { value: Array.from({ length: N }, () => new THREE.Vector3()) },
            uWCol: { value: Array.from({ length: N }, () => new THREE.Color(1, 1, 1)) },
            uWS: { value: Array.from({ length: N }, () => new THREE.Vector4()) },   // assigned, killer, dead, active
            uWX: { value: Array.from({ length: N }, () => new THREE.Vector4(0, 0, 0, -1)) }, // crack, pulse, ledger, crackBand
            uTracer: { value: new THREE.Vector4(0, 0, 0, 0) },                     // a0, a1, head (0..1), intensity
            uTracerCol: { value: new THREE.Color(CRIMSON) },
            uHeat: { value: 0 },                                                   // escalation 0..2
            uTime: engine.time,
            tRefl: { value: refl ? refl.rt.texture : null }, uReflMat: { value: refl ? refl.texMat : new THREE.Matrix4() }, uReflOn: { value: refl ? 1 : 0 },
        };
        this.wedges = WHEEL.map((n, k) => ({ n, k, fill: [0, 0, 0], target: 0, queue: [], cur: null, assigned: false, color: new THREE.Color(), killer: 0, killerTo: 0, dead: 0, deadTo: 0, ledger: 0, ledgerTo: 0, active: 0, activeTo: 0, crack: 0, pulse: 0, crackBand: -1 }));
        this.tracer = null;

        const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0, envMapIntensity: 0.6 });
        const U = this.U;
        m.onBeforeCompile = (sh) => {
            Object.assign(sh.uniforms, U);
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
                .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW=(modelMatrix*vec4(transformed,1.)).xyz;');
            sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform vec3 uFill[20];uniform vec3 uWCol[20];uniform vec4 uWS[20];uniform vec4 uWX[20];
uniform vec4 uTracer;uniform vec3 uTracerCol;uniform float uHeat,uTime;
uniform sampler2D tRefl;uniform mat4 uReflMat;uniform float uReflOn;
varying vec3 vGW;
${NOISE}
const float MM=${MM.toFixed(6)};const float PI_=3.14159265;
float bR,bA,bMetal,bRough,bWire,bGloss;int bK;vec3 bEmit;
float aaStep(float e,float x){float w=fwidth(x)*.75;return smoothstep(e-w,e+w,x);}
float wire(float d,float hw){float w=fwidth(d)*.8+1e-4;return 1.-smoothstep(hw-w,hw+w,abs(d));}
vec3 marble(vec2 p,vec3 a,vec3 b,float s){float v=gf(p*s);float vein=1.-smoothstep(.0,.035,abs(fract(v*3.1+gn(p*s*3.)*.6)-.5)-.0);return mix(a,b,clamp(v*.35+vein*.5,0.,1.));}`)
                .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 bp=vec2(vGW.x,-vGW.z);           // board plane, metres
  float rm=length(bp);bR=rm/MM;           // mm
  bA=atan(bp.y,bp.x);
  float cw=PI_*.5-bA;                     // clockwise from the 20
  float fk=cw/(PI_/10.);float kk=floor(fk+.5);
  bK=int(mod(kk,20.)+20.)%20;
  float edgeD=(fract(fk+.5)-.5);          // -0.5..0.5 across the wedge
  float edgeMM=(.5-abs(edgeD))*(PI_/10.)*bR;   // mm to the nearest radial wire
  bool even=(bK-(bK/2)*2)==0;
  vec3 col;bMetal=0.;bRough=.22;bGloss=1.;bEmit=vec3(0.);bWire=0.;
  vec2 mp=bp*1.7;
  bRough=.26;vec3 blackM=marble(mp,vec3(.010,.010,.011),vec3(.05,.048,.046),1.2);
  vec3 creamM=marble(mp+9.,vec3(.24,.205,.16),vec3(.36,.32,.26),1.1);
  vec3 redE=vec3(.30,.015,.02)*(.85+.3*gn(mp*9.)),greenE=vec3(.012,.13,.06)*(.85+.3*gn(mp*9.));
  vec3 brass=vec3(.85,.62,.30);
  if(bR<${RADII.bull.toFixed(2)}){col=brass*.7;bMetal=1.;bRough=.34;}
  else if(bR<${RADII.outerBull.toFixed(2)}){col=greenE;bRough=.3;}
  else if(bR<${RADII.trebleIn.toFixed(2)}){col=even?blackM:creamM;}
  else if(bR<${RADII.trebleOut.toFixed(2)}){col=even?redE:greenE;bRough=.3;}
  else if(bR<${RADII.doubleIn.toFixed(2)}){col=even?blackM:creamM;}
  else if(bR<${RADII.doubleOut.toFixed(2)}){col=even?redE:greenE;bRough=.3;}
  else if(rm<${RING_IN.toFixed(3)}){col=vec3(.006);bRough=.35;}
  else if(rm<${RING_OUT.toFixed(3)}){col=vec3(.012,.011,.012)*(.9+.2*gn(mp*20.));bRough=.12;}
  else{col=marble(mp+3.,vec3(.008,.008,.009),vec3(.035,.033,.032),.7);bRough=.16;}
  // brass wires: the ring wires and the spider's radial wires
  float w=0.;
  w=max(w,wire(bR-${RADII.bull.toFixed(2)},.9));w=max(w,wire(bR-${RADII.outerBull.toFixed(2)},.9));
  w=max(w,wire(bR-${RADII.trebleIn.toFixed(2)},.9));w=max(w,wire(bR-${RADII.trebleOut.toFixed(2)},.9));
  w=max(w,wire(bR-${RADII.doubleIn.toFixed(2)},.9));w=max(w,wire(bR-${RADII.doubleOut.toFixed(2)},1.1));
  // (derivatives must be taken in uniform control flow: compute every wire, then mask)
  float spider=wire(edgeMM,.8),ringTick=wire(edgeMM*MM,.006);
  w=max(w,spider*step(${RADII.outerBull.toFixed(2)},bR)*step(bR,${RADII.doubleOut.toFixed(2)}));
  // the number ring: gold rules at its edges, a fine tick between numbers
  w=max(w,wire(rm-${RING_IN.toFixed(3)},.012)*1.);w=max(w,wire(rm-${RING_OUT.toFixed(3)},.016));
  w=max(w,wire(rm-${(RING_OUT + 0.2).toFixed(3)},.02));
  w=max(w,ringTick*.8*step(${RING_IN.toFixed(3)},rm)*step(rm,${RING_OUT.toFixed(3)}));
  bWire=w;
  col=mix(col,brass,w);bMetal=mix(bMetal,1.,w);bRough=mix(bRough,.24,w);
  // ---- the game's light
  vec3 fill=uFill[bK];vec3 wc=uWCol[bK];vec4 ws=uWS[bK];vec4 wx=uWX[bK];
  float inBoard=step(${RADII.outerBull.toFixed(2)},bR)*step(bR,${RADII.doubleOut.toFixed(2)});
  // killer colour: crimson core, gold edges
  vec3 kc=mix(vec3(1.,.07,.12),vec3(1.,.55,.18),smoothstep(.2,.48,abs(edgeD)));
  vec3 lc=mix(wc,kc,ws.y);
  float edgeSoft=smoothstep(.0,2.5,edgeMM-1.);
  ${BANDS.map(([a, b], i) => `{
    float b0=${a.toFixed(1)},b1=${b.toFixed(1)};
    float inBand=aaStep(b0,bR)*(1.-aaStep(b1,bR));
    float u=(b1-bR)/(b1-b0);              // 0 at the band's rim edge → 1 at its inner edge
    float p=fill[${i}];
    float lit=inBand*(1.-smoothstep(p-.06,p,u))*step(.001,p);
    float fu=(u-p)*14.;float front=inBand*exp(-fu*fu)*step(.001,p)*step(p,.999);
    float cr=(wx.w==${i}.)?wx.x:0.;
    float crackLine=1.-smoothstep(.0,.07,abs(gf(bp*6.+${i}.*3.)-.5));
    bEmit+=lc*(lit*(2.3+.5*gn(bp*3.+uTime*.6))+front*5.)*edgeSoft*(1.-spider);
    bEmit+=vec3(1.,.85,.7)*cr*crackLine*inBand*6.;
    bEmit+=wc*inBand*.05*ws.x*(1.-ws.z);   // an empty band of an assigned wedge: a faint channel of the player's colour
  }`).join('\n  ')}
  // the pulse of a mark/strike landing: the wedge's brass wires flare
  bEmit+=mix(wc,kc,ws.y)*wx.y*w*inBoard*step(.5,ws.x)*3.;
  // a killer's wires glow
  float wedgeWire=w*inBoard*step(abs(edgeD),.5);
  bEmit+=kc*ws.y*wedgeWire*.9;
  // active thrower: their wedge's wires breathe
  bEmit+=wc*ws.w*wedgeWire*(.6+.4*sin(uTime*3.));
  // out: the wedge goes dark, a red ledger line is drawn through it from the rim in
  float dark=ws.z*inBoard;
  col*=1.-.75*dark;bEmit*=1.-.85*ws.z;
  float lineU=(${RADII.doubleOut.toFixed(1)}-bR)/(${(RADII.doubleOut - RADII.outerBull).toFixed(1)});
  float ledger=wire(edgeD*(PI_/10.)*bR,1.6)*inBoard*step(lineU,wx.z);
  bEmit+=vec3(1.,.04,.05)*ledger*4.;col=mix(col,vec3(.3,0.,0.),ledger);
  // the tracer: light running round the ring's inner rule from the killer's number to the victim's
  float onRule=wire(rm-${RING_IN.toFixed(3)},.03);
  if(uTracer.w>0.){
    float a0=uTracer.x,a1=uTracer.y;float d=a1-a0;d=d-6.2831853*floor((d+3.14159265)/6.2831853);
    float rel=bA-a0;rel=rel-6.2831853*floor((rel+3.14159265)/6.2831853);
    float s=d!=0.?rel/d:0.;
    float head=uTracer.z;
    float trail=step(0.,s)*step(s,head)*exp(-(head-s)*4.);
    float ds=(s-head)*18.;float dot_=exp(-ds*ds);
    bEmit+=uTracerCol*onRule*(trail*3.+dot_*14.)*uTracer.w*step(0.,s)*step(s,1.02);
  }
  // number-ring: a faint gold underglow that warms with the escalation
  vec3 hc=mix(vec3(1.,.6,.25),vec3(1.,.06,.08),clamp(uHeat-1.,0.,1.));
  float hp=mix(1.,.5+.5*sin(uTime*2.6),clamp(uHeat-1.,0.,1.));
  bEmit+=hc*(wire(rm-${RING_OUT.toFixed(3)},.016)+wire(rm-${(RING_OUT + 0.2).toFixed(3)},.02))*(.3+1.4*uHeat)*hp;
  diffuseColor.rgb=col;
  if(rm>${(RING_OUT + 0.45).toFixed(3)})discard;
}`)
                .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=bRough;')
                .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor=bMetal;')
                .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=bEmit;')
                .replace('#include <opaque_fragment>', `
{
  // polished stone: the planar reflection, sharper on the marble, softer on enamel and lacquer
  vec4 rc=uReflMat*vec4(vGW,1.);vec2 ruv=rc.xy/rc.w;
  float lod=mix(.6,4.,clamp((bRough-.12)/.3,0.,1.));
  vec3 rf=textureLod(tRefl,ruv+(vec2(gn(vGW.xz*4.),gn(vGW.xz*4.+3.))-.5)*.003,lod).rgb;
  vec3 Vd=normalize(cameraPosition-vGW);float F=.04+.96*pow(1.-clamp(Vd.y,0.,1.),5.);
  float k=(1.-bMetal)*mix(.35,.08,clamp((bRough-.12)/.25,0.,1.))*(.5+F)*uReflOn;
  outgoingLight=outgoingLight*(1.-k*.4)+rf*k;
  if(uReflOn>1.5)outgoingLight=rf*4.;   // debug (uReflOn = 2): the raw reflection
}
#include <opaque_fragment>`);
        };
        m.customProgramCacheKey = () => 'kboard';
        this.mat = m;
        // a regular grid, not a triangle fan: 256 long slivers meeting at the bull wreck the interpolation of the
        // reflection lookup; the shader draws the round board and discards the corners
        const geo = new THREE.PlaneGeometry((RING_OUT + 0.45) * 2, (RING_OUT + 0.45) * 2, 96, 96).rotateX(-Math.PI / 2);
        this.mesh = new THREE.Mesh(geo, m);
        this.mesh.receiveShadow = true;
        engine.scene.add(this.mesh);
        if (refl) refl.hide.push(this.mesh);

        this.numbers = new Numbers(engine.scene);
    }

    /** players: [{ number, color }] — which wedges are in play, and whose colour */
    setPlayers(players) {
        for (const W of this.wedges) { W.assigned = false; W.queue.length = 0; W.cur = null; W.fill = [0, 0, 0]; W.target = 0; W.killer = W.killerTo = 0; W.dead = W.deadTo = 0; W.ledger = W.ledgerTo = 0; W.active = W.activeTo = 0; W.crack = 0; W.pulse = 0; W.crackBand = -1; }
        for (const p of players) {
            const W = this.w(p.number); if (!W) continue;
            W.assigned = true; W.color.set(p.color);
        }
        this.numbers.setAssigned(players.map((p) => p.number));
        this.sync();
    }
    w(n) { const k = wheelIndex(n); return k < 0 ? null : this.wedges[k]; }

    /** snap a wedge to `count` lit bands (reconcile, setup) */
    setLit(n, count) {
        const W = this.w(n); if (!W) return;
        W.queue.length = 0; W.cur = null;
        for (let s = 0; s < 3; s++) W.fill[s] = s < count ? 1 : 0;
        W.target = count;
    }
    /** light bands segs (in order), each over SEG_S */
    flood(n, segs, { onSeg } = {}) {
        const W = this.w(n); if (!W) return;
        for (const s of segs) W.queue.push({ kind: 'fill', s, dur: SEG_S, onSeg });
        W.target = Math.max(W.target, ...segs.map((s) => s + 1));
    }
    /** crack and drain bands segs (top down, as the server lists them), each over SEG_S */
    drain(n, segs, { onSeg } = {}) {
        const W = this.w(n); if (!W) return;
        for (const s of segs) W.queue.push({ kind: 'drain', s, dur: SEG_S, onSeg });
        if (segs.length) W.target = Math.min(W.target, Math.min(...segs));
    }
    setKiller(n, on, instant = false) { const W = this.w(n); if (!W) return; W.killerTo = on ? 1 : 0; if (instant) W.killer = W.killerTo; this.numbers.setKiller(n, on, instant); }
    setDead(n, on, instant = false) { const W = this.w(n); if (!W) return; W.deadTo = on ? 1 : 0; W.ledgerTo = on ? 1 : 0; if (instant) { W.dead = W.deadTo; W.ledger = W.ledgerTo; } this.numbers.setDead(n, on, instant); }
    setActive(n) { for (const W of this.wedges) W.activeTo = W.n === n ? 1 : 0; this.numbers.setActive(n); }
    pulse(n, a = 1) { const W = this.w(n); if (W) W.pulse = Math.max(W.pulse, a); }
    /** light running round the ring's rule from number a to number b over dur seconds */
    trace(a, b, dur = 0.45, color = CRIMSON) {
        this.tracer = { a0: wedgeAngle(a), a1: wedgeAngle(b), t: 0, dur };
        this.U.uTracerCol.value.set(color);
    }
    setHeat(h) { this.U.uHeat.value = h; this.numbers.heat = h; }

    get busy() { return this.wedges.some((W) => W.cur || W.queue.length || Math.abs(W.ledger - W.ledgerTo) > 0.01 || Math.abs(W.killer - W.killerTo) > 0.01); }
    /** bands fully lit on number n */
    lit(n) { const W = this.w(n); return W ? W.fill.filter((f) => f >= 0.999).length : 0; }
    killerShown(n) { const W = this.w(n); return !!W && W.killerTo > 0.5; }
    deadShown(n) { const W = this.w(n); return !!W && W.deadTo > 0.5; }

    update(dt) {
        for (const W of this.wedges) {
            if (!W.cur && W.queue.length) { W.cur = W.queue.shift(); W.cur.t = 0; if (W.cur.kind === 'drain') { W.crackBand = W.cur.s; W.crack = 1; } }
            const A = W.cur;
            if (A) {
                A.t += dt;
                const u = clamp01(A.t / A.dur);
                if (A.kind === 'fill') W.fill[A.s] = ease(u);
                else {
                    // crack white-hot for the first third, then the light drains out from the inner edge back to the rim
                    W.fill[A.s] = 1 - ease(clamp01((u - 0.3) / 0.7));
                }
                if (A.t >= A.dur) { W.fill[A.s] = A.kind === 'fill' ? 1 : 0; W.cur = null; W.pulse = 1; if (A.onSeg) A.onSeg(A.s, A.kind); }
            }
            const k = 1 - Math.exp(-dt * 5);
            W.killer += (W.killerTo - W.killer) * k;
            W.dead += (W.deadTo - W.dead) * (1 - Math.exp(-dt * 3));
            W.ledger = W.ledgerTo > W.ledger ? Math.min(W.ledgerTo, W.ledger + dt / 0.7) : W.ledgerTo;
            W.active += (W.activeTo - W.active) * k;
            W.crack = Math.max(0, W.crack - dt * 2.2);
            W.pulse = Math.max(0, W.pulse - dt * 2.5);
            if (W.crack <= 0) W.crackBand = -1;
        }
        if (this.tracer) {
            const T = this.tracer; T.t += dt;
            const head = clamp01(T.t / T.dur);
            const fade = 1 - clamp01((T.t - T.dur) / 0.6);
            this.U.uTracer.value.set(T.a0, T.a1, head, fade);
            if (fade <= 0) { this.tracer = null; this.U.uTracer.value.w = 0; }
        }
        this.sync();
        this.numbers.update(dt);
    }
    sync() {
        const U = this.U;
        this.wedges.forEach((W, k) => {
            U.uFill.value[k].set(W.fill[0], W.fill[1], W.fill[2]);
            U.uWCol.value[k].copy(W.color);
            U.uWS.value[k].set(W.assigned ? 1 : 0, W.killer, W.dead, W.active);
            U.uWX.value[k].set(W.crack, W.pulse, W.ledger, W.crackBand);
        });
    }
    /** world position of a point on number n's wedge at board radius mm (for cameras and effects) */
    wedgePoint(n, mm = 95, h = 0) { const a = wedgeAngle(n), r = mm * MM; return V(Math.cos(a) * r, h, -Math.sin(a) * r); }
}

// ---------------------------------------------------------------- the gold numbers on the ring
// 20 brass numerals set flat in the lacquer ring, upright to the audience (as on a real board). An assigned number
// glows gold; a killer's number turns crimson; an out player's number goes dark.
class Numbers {
    constructor(scene) {
        const c = document.createElement('canvas'); c.width = 2048; c.height = 512;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 2048, 512);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
        ctx.font = `700 190px ${SERIF}`;
        // atlas: 10 × 2 cells of 204.8 × 256
        for (let i = 0; i < 20; i++) { const x = (i % 10) * 204.8 + 102.4, y = Math.floor(i / 10) * 256 + 136; ctx.fillText(String(i + 1), x, y); }
        const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8;
        this.items = [];
        this.heat = 0;
        for (const n of WHEEL) {
            const g = new THREE.PlaneGeometry(0.62, 0.62 * 1.25).rotateX(-Math.PI / 2);
            const uv = g.attributes.uv, i = n - 1, u0 = (i % 10) / 10, v0 = 1 - (Math.floor(i / 10) + 1) / 2;
            for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / 10, v0 + uv.getY(k) / 2);
            const m = new THREE.MeshStandardMaterial({ color: '#b48a4a', metalness: 1, roughness: 0.3, alphaMap: tex, transparent: true, emissive: new THREE.Color(GOLD), emissiveIntensity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
            const mesh = new THREE.Mesh(g, m);
            const a = wedgeAngle(n), r = (RING_IN + RING_OUT) / 2;
            mesh.position.set(Math.cos(a) * r, 0.012, -Math.sin(a) * r);
            mesh.renderOrder = 2;
            scene.add(mesh);
            this.items.push({ n, mesh, m, assigned: false, killer: 0, killerTo: 0, dead: 0, deadTo: 0, active: 0, activeTo: 0 });
        }
        this.gold = new THREE.Color(GOLD); this.crimson = new THREE.Color(CRIMSON); this.tmp = new THREE.Color();
    }
    it(n) { return this.items.find((x) => x.n === n); }
    setAssigned(list) { for (const I of this.items) { I.assigned = list.includes(I.n); I.killer = I.killerTo = 0; I.dead = I.deadTo = 0; } }
    setKiller(n, on, instant) { const I = this.it(n); if (I) { I.killerTo = on ? 1 : 0; if (instant) I.killer = I.killerTo; } }
    setDead(n, on, instant) { const I = this.it(n); if (I) { I.deadTo = on ? 1 : 0; if (instant) I.dead = I.deadTo; } }
    setActive(n) { for (const I of this.items) I.activeTo = I.n === n ? 1 : 0; }
    update(dt) {
        const k = 1 - Math.exp(-dt * 4);
        for (const I of this.items) {
            I.killer += (I.killerTo - I.killer) * k; I.dead += (I.deadTo - I.dead) * k; I.active += (I.activeTo - I.active) * k;
            this.tmp.copy(this.gold).lerp(this.crimson, I.killer);
            I.m.emissive.copy(this.tmp);
            I.m.emissiveIntensity = (I.assigned ? 1.4 + I.active * 1.6 + I.killer * 1.2 : 0.12 + this.heat * 0.05) * (1 - I.dead * 0.92);
            I.m.color.set(I.assigned ? '#c99a52' : '#5a4a32');
        }
    }
}
