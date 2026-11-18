// The Ledger — a members' club on the 66th floor at 1 a.m. A corner penthouse: a wall of deco glass behind the
// board and down both sides, rain streaming down it and the city a sea of bokeh below; black marble with a brass
// sunburst inlaid round the board; walnut and brass at the bar end; pendant lamps throwing warm pools.
//
// The glass is the trick: each pane renders the city itself (a procedural skyline + bokeh, as a function of view
// direction), bent by the rain's normal map — refraction without a screen copy. The city stays defocused, low
// contrast and cool, so it never competes with the board (the Demolition lesson).
//
// API (the game drives it):
//   focus(pos, color)   the active agent's lamp swings onto them
//   moment(pos, color)  a single hard top light for a moment (became killer)
//   lampOut(pos)        the lamp over a dying agent stutters out
//   winner(pos, color)  every lamp onto the winner, the city flares
//   setHeat(level)      0 calm · 1 ×2 (amber, heavier rain, lightning) · 2 ×3 (red emergency wash, lashing rain)
import * as THREE from 'three';
import { V, NOISE, clamp01, RING_OUT } from './common.js';

export const ROOM = { X0: -15, X1: 15, Z0: -12, Z1: 14, HT: 15 }; // glass at Z0 and both sides, the bar at Z1
const { X0, X1, Z0, Z1, HT } = ROOM;

// the city as seen through the glass: a function of view direction
const CITY = `
${NOISE}
uniform float uHeat,uFlash,uFlare;
float h1(float x){return fract(sin(x*127.1)*43758.5453);}
vec3 city(vec3 d){
  d=normalize(d);
  float az=atan(d.x,-d.z),el=asin(clamp(d.y,-1.,1.));
  // sky: deep blue-violet, a sodium glow on the cloud base over the city
  vec3 sky=mix(vec3(.004,.006,.014),vec3(.016,.016,.026),smoothstep(.5,-.05,el));
  sky+=vec3(.045,.026,.02)*exp(-max(el,0.)*7.)*(.7+.5*gf(vec2(az*3.,el*8.)));
  sky+=vec3(.5,.55,.8)*uFlash*smoothstep(-.1,.4,el)*(.4+.6*gf(vec2(az*2.,el*3.)+uFlash));
  vec3 col=sky;
  // skyline: towers by azimuth bins, near (lower, bigger) and far (higher, smaller)
  for(int L=0;L<2;L++){
    float w=L==0?.045:.07, base=L==0?-.42:-.16;
    float c=floor(az/w), f=fract(az/w);
    float hh=h1(c+float(L)*40.);
    float top=base+.05+hh*hh*(L==0?.48:.3);
    float inB=step(.06,f)*step(f,.94)*step(el,top);
    // a soft silhouette edge (defocused), then window lights as soft bokeh discs
    float edge=smoothstep(top+.012,top-.012,el)*smoothstep(.0,.08,f)*smoothstep(1.,.92,f);
    vec3 wall=vec3(.003,.004,.007)*(L==0?1.:1.5);
    vec2 g=vec2(f*(L==0?5.:3.),el*(L==0?34.:52.));vec2 gi=floor(g),gq=fract(g)-.5;
    float on=step(.76,h1(dot(gi,vec2(7.1,31.7))+c*3.3));
    vec3 wc=mix(vec3(1.,.68,.38),vec3(.55,.68,1.),step(.6,h1(gi.y+c)));
    float disc=smoothstep(.46,.16,length(gq));
    vec3 bc=wall+wc*on*disc*(L==0?.1:.065)*(1.+uFlare*2.);
    col=mix(col,bc,edge);
    // a red aircraft light on the tallest: a soft disc
    float al=smoothstep(.012,.004,length(vec2((f-.5)*w,el-top-.008)))*step(.8,hh);
    col+=vec3(1.6,.1,.05)*al;
  }
  // the streets far below: bokeh of headlights, tail lights and street lamps
  float below=smoothstep(-.32,-.62,el);
  vec2 bp=vec2(az*12.,el*26.);vec2 bi=floor(bp),bf=fract(bp)-.5;
  float bk=h1(dot(bi,vec2(3.7,17.3)));
  vec3 bc=bk<.4?vec3(1.,.55,.25):bk<.7?vec3(1.,.14,.08):vec3(.7,.8,1.);
  col+=bc*below*smoothstep(.45,.1,length(bf))*step(.62,bk+.25*sin(bi.x*.7))*.12*(1.+uFlare);
  return col;
}`;

function paneMaterial(U) {
    return new THREE.ShaderMaterial({
        uniforms: U,
        vertexShader: `varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
        fragmentShader: `uniform float uTime,uRain;uniform vec3 uRoomLight;varying vec3 vW;${CITY}
// rain on glass: static droplets, running drops with trails; heavier with the escalation
vec3 rainN(vec2 p,float t,out float wet){
  vec3 n=vec3(0.,0.,1.);wet=0.;
  for(int k=0;k<2;k++){
    vec2 q=p*(k==0?26.:44.);vec2 qi=floor(q),qf=fract(q)-.5;
    float r=h1(dot(qi,vec2(12.9,78.2))+float(k)*5.);
    vec2 o=vec2(h1(r*3.1)-.5,h1(r*7.7)-.5)*.45;vec2 d=qf-o;float rad=.1+.16*r;
    float m=smoothstep(rad,rad*.55,length(d))*step(.62-uRain*.3,r);
    n.xy+=d/rad*m;wet+=m;
  }
  float lean=clamp(uHeat-1.,0.,1.)*.35;
  vec2 q=vec2((p.x+p.y*lean)*7.,p.y);float ci=floor(q.x);float cr=h1(ci*1.37);
  float live=step(.5-uRain*.35,cr);
  float sp=.5+cr*.8+uRain*.9;float y=fract(p.y*.22+t*sp*.1+cr*3.);
  float x=fract(q.x)-.5+sin(p.y*6.+cr*6.)*.06;
  float drop=smoothstep(.14,.05,length(vec2(x,(y-.5)*6.)))*live;
  float trail=smoothstep(.05,.0,abs(x))*smoothstep(.5,.95,y)*live*.6;
  n.xy+=vec2(x*7.,(y-.5)*2.5)*drop+vec2(x*4.,0.)*trail;wet+=drop+trail*.4;
  return normalize(n);
}
void main(){
  vec3 dir=normalize(vW-cameraPosition);
  vec2 gp=abs(vW.z-(${Z0.toFixed(1)}))<.5?vW.xy:vW.zy;
  float wet;vec3 n=rainN(gp*.4,uTime,wet);
  wet=clamp(wet,0.,1.5);
  vec3 d2=normalize(dir+vec3(n.x,n.y,n.x)*.07*wet);
  // soft focus: a few nearby directions averaged (the city is always in bokeh)
  vec3 c=(city(d2+vec3(.004,.003,.002))+city(d2+vec3(-.004,-.003,-.002)))*.5;
  // drops catch the room's warm lamps and the city's glow at their edges
  c+=uRoomLight*wet*.05+vec3(.2,.25,.4)*wet*.03;
  c=mix(c,c*vec3(1.25,.55,.55),clamp(uHeat-1.,0.,1.)*.45);
  gl_FragColor=vec4(c,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    });
}

/** walnut panelling with brass pilasters, rails and deco sconces (and, on the bar wall, backlit shelves) */
function panelMaterial(U, kind) {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0 });
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW=(modelMatrix*vec4(transformed,1.)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nuniform float uHeat,uTime;varying vec3 vGW;${NOISE}\nfloat pMetal,pRough;vec3 pEmit;`)
            .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 P=${kind === 'side' ? 'vec2(vGW.z,vGW.y)' : 'vec2(vGW.x,vGW.y)'};
  float grain=gf(vec2(P.x*1.5,P.y*22.))*.6+gn(vec2(P.x*6.,P.y*90.))*.4;
  vec3 wood=mix(vec3(.022,.010,.005),vec3(.065,.032,.016),grain);
  float bay=fract(P.x/3.)*3.;float pil=step(abs(bay-1.5),.16);
  float rail=step(abs(P.y-1.05),.03)+step(abs(P.y-6.2),.05);
  float flute=.75+.25*cos((bay-1.5)*120.);
  vec3 col=mix(wood,vec3(.75,.53,.25)*flute,clamp(pil+rail,0.,1.));
  pMetal=clamp(pil+rail,0.,1.);pRough=mix(.42,.28,pMetal);pEmit=vec3(0.);
  // deco sconces between the pilasters: frosted-glass fans at 3.4 m
  vec2 sq=vec2((fract(P.x/3.+.5)-.5)*3.,P.y-3.4);   // centred between the pilasters
  // a tall frosted shield with a stepped deco top, warmest at its heart
  float sh=step(abs(sq.x),.16)*step(-.45,sq.y)*step(sq.y,.35)+step(abs(sq.x),.1)*step(.35,sq.y)*step(sq.y,.48)+step(abs(sq.x),.04)*step(.48,sq.y)*step(sq.y,.56);
  float fan=sh*(1.-step(abs(sq.x),.012)*.5);
  float rays=.55+.45*exp(-(sq.y*sq.y)*6.);
  vec3 lampC=mix(vec3(1.,.72,.42),vec3(1.,.45,.2),clamp(uHeat,0.,1.));
  lampC=mix(lampC,vec3(1.,.08,.06),clamp(uHeat-1.,0.,1.)*(.6+.4*sin(uTime*3.)));
  pEmit=lampC*vec3(1.,.8,.6)*fan*rays*.42;
  col=mix(col,vec3(.3,.22,.14),fan*.6);
  ${kind === 'bar' ? `float shelf=step(1.5,P.y)*step(P.y,5.5)*step(abs(P.x),7.5);float sy=fract(P.y-1.5);float sx=fract(P.x*3.1);
  float bottle=shelf*step(.16,sy)*step(sy,.84-.3*gn(vec2(floor(P.x*3.1),floor(P.y))*3.))*step(abs(sx-.5),.2)*step(.3,gn(vec2(floor(P.x*3.1),floor(P.y))*7.3));
  vec3 bc=mix(vec3(.5,.26,.06),vec3(.32,.2,.08),step(.55,gn(vec2(floor(P.x*3.1)*1.3,floor(P.y)))));
  pEmit+=shelf*(vec3(1.,.66,.36)*.06*step(sy,.1)+bc*bottle*.16*sy);
  col=mix(col,vec3(.015),shelf*.8);` : ''}
  diffuseColor.rgb=col;
}`)
            .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=pRough;')
            .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor=pMetal;')
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=pEmit;');
    };
    m.customProgramCacheKey = () => 'kpanel-' + kind;
    return m;
}

/** a soft round pool of lamplight on the floor */
function poolTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(0.45, 'rgba(255,255,255,0.2)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
}

export class Room {
    constructor(engine, refl) {
        this.engine = engine;
        const S = engine.scene;
        this.refl = refl;
        this.U = { uTime: engine.time, uHeat: { value: 0 }, uFlash: { value: 0 }, uFlare: { value: 0 }, uRain: { value: 0.3 }, uRoomLight: { value: new THREE.Color('#ffcf8a') } };
        const U = this.U;

        // ---------------------------------------------------------- floor: black marble, a brass sunburst
        const FU = { tRefl: { value: refl.rt.texture }, uReflMat: { value: refl.texMat }, uHeat: U.uHeat, uTime: U.uTime };
        const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.18, metalness: 0, envMapIntensity: 0.5 });
        m.onBeforeCompile = (sh) => {
            Object.assign(sh.uniforms, FU);
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW=(modelMatrix*vec4(transformed,1.)).xyz;');
            sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D tRefl;uniform mat4 uReflMat;uniform float uHeat,uTime;varying vec3 vGW;${NOISE}
float fMetal,fRough;vec3 fEmit;
float wire(float d,float hw){float w=fwidth(d)*.8+1e-4;return 1.-smoothstep(hw-w,hw+w,abs(d));}`)
                .replace('#include <color_fragment>', `#include <color_fragment>
{ vec2 P=vGW.xz; float r=length(P); float a=atan(P.y,P.x);
  float v=gf(P*.45); float vein=1.-smoothstep(0.,.035,abs(fract(v*3.+gn(P*1.3)*.5)-.5));
  vec3 col=mix(vec3(.006,.006,.007),vec3(.04,.037,.035),vein*.55+v*.15);
  // brass sunburst: 24 rays from the board out, two rings (every wire computed unconditionally: fwidth)
  float rd=(fract(a/6.2831853*24.)-.5)*r*6.2831853/24.;
  float br=wire(rd,.018)*step(${(RING_OUT + 0.6).toFixed(2)},r)*smoothstep(13.,7.,r);
  br=max(br,wire(r-${(RING_OUT + 0.62).toFixed(2)},.025));br=max(br,wire(r-8.6,.02));br=max(br,wire(r-8.75,.01));
  col=mix(col,vec3(.7,.5,.24),br);fMetal=br;fRough=mix(.3,.3,br);
  // escalation: the sunburst's brass warms to amber at ×2 and pulses crimson at ×3 (seen from the master shot)
  vec3 ec=mix(vec3(1.,.55,.18),vec3(1.,.05,.08),clamp(uHeat-1.,0.,1.));
  float pulse=mix(1.,.55+.45*sin(uTime*2.6-r*.6),clamp(uHeat-1.,0.,1.));
  fEmit=ec*br*clamp(uHeat,0.,2.)*.55*pulse*smoothstep(14.,6.,r);
  diffuseColor.rgb=col; }`)
                .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=fRough;')
                .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=fEmit;')
                .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor=fMetal;')
                .replace('#include <opaque_fragment>', `{ vec4 rc=uReflMat*vec4(vGW,1.);vec2 ruv=rc.xy/rc.w;
  vec3 rf=textureLod(tRefl,ruv+(vec2(gn(vGW.xz*3.),gn(vGW.xz*3.+5.))-.5)*.004,1.2).rgb; vec3 Vd=normalize(cameraPosition-vGW);float F=.04+.96*pow(1.-clamp(Vd.y,0.,1.),5.);
  float k=(1.-fMetal)*.26*(.5+F); outgoingLight=outgoingLight*(1.-k*.4)+rf*k; }
#include <opaque_fragment>`);
        };
        m.customProgramCacheKey = () => 'kfloor';
        // a ring with the board's disc cut out: overlapping floor surfaces z-fight at the master shot's distance
        this.floor = new THREE.Mesh(new THREE.RingGeometry(RING_OUT + 0.44, 26, 256, 8).rotateX(-Math.PI / 2), m);
        this.floor.receiveShadow = true;
        S.add(this.floor); refl.hide.push(this.floor);

        // ---------------------------------------------------------- the glass: back wall and both sides
        this.paneMat = paneMaterial(U);
        const glass = new THREE.Group();
        const pane = (w, h, x, y, z, ry) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.paneMat); p.position.set(x, y, z); p.rotation.y = ry; glass.add(p); };
        const sideLen = Z1 - Z0 - 8;
        pane(X1 - X0, HT, 0, HT / 2, Z0, 0);
        pane(sideLen, HT, X0, HT / 2, Z0 + sideLen / 2, Math.PI / 2);
        pane(sideLen, HT, X1, HT / 2, Z0 + sideLen / 2, -Math.PI / 2);
        S.add(glass); this.glass = glass;
        // deco mullions: black lacquer with a brass bead, transoms at the deco steps
        const frame = new THREE.MeshStandardMaterial({ color: '#0b0a0a', roughness: 0.3, metalness: 0.4 });
        const brass = new THREE.MeshStandardMaterial({ color: '#b48a46', roughness: 0.28, metalness: 1 });
        this.brass = brass;
        const box = (w, h, d, x, y, z, mat = frame) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); S.add(b); return b; };
        for (let x = X0; x <= X1 + 0.01; x += 2.5) { box(0.16, HT, 0.25, x, HT / 2, Z0 + 0.12); box(0.04, HT, 0.05, x, HT / 2, Z0 + 0.27, brass); }
        for (const y of [0.12, 3.2, 9.5, 11.2]) box(X1 - X0, 0.14, 0.25, 0, y, Z0 + 0.12);
        for (const sx of [X0, X1]) {
            for (let z = Z0; z <= Z0 + sideLen + 0.01; z += 2.5) { box(0.25, HT, 0.16, sx - Math.sign(sx) * 0.12, HT / 2, z); box(0.05, HT, 0.04, sx - Math.sign(sx) * 0.27, HT / 2, z, brass); }
            for (const y of [0.12, 3.2, 9.5, 11.2]) box(0.25, 0.14, sideLen, sx - Math.sign(sx) * 0.12, y, Z0 + sideLen / 2);
        }

        // ---------------------------------------------------------- walnut panelling at the bar end, the bar, the ceiling
        const sideMat = panelMaterial(U, 'side'), barMat = panelMaterial(U, 'bar');
        const wall = (w, h, x, y, z, ry, mat) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); p.position.set(x, y, z); p.rotation.y = ry; p.receiveShadow = true; S.add(p); return p; };
        wall(8, HT, X0, HT / 2, Z1 - 4, Math.PI / 2, sideMat);
        wall(8, HT, X1, HT / 2, Z1 - 4, -Math.PI / 2, sideMat);
        wall(X1 - X0, HT, 0, HT / 2, Z1, Math.PI, barMat);
        const counter = new THREE.Mesh(new THREE.BoxGeometry(16, 1.1, 0.9), new THREE.MeshPhysicalMaterial({ color: '#160807', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }));
        counter.position.set(0, 0.55, Z1 - 2.6); counter.castShadow = true; counter.receiveShadow = true; S.add(counter);
        box(16.2, 0.06, 1.0, 0, 1.12, Z1 - 2.6, brass);
        const ceil = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#0d0a09', roughness: 0.7 }));
        ceil.position.set(0, HT, (Z0 + Z1) / 2); S.add(ceil);
        for (let x = X0 + 3; x < X1; x += 3) box(0.3, 0.5, Z1 - Z0, x, HT - 0.25, (Z0 + Z1) / 2, brass);
        for (let z = Z0 + 3; z < Z1; z += 3) box(X1 - X0, 0.5, 0.3, 0, HT - 0.25, z, brass);

        // ---------------------------------------------------------- pendant lamps round the board, with floor pools
        this.pendants = [];
        const shadeG = new THREE.ConeGeometry(0.55, 0.6, 32, 1, true).translate(0, -0.3, 0);
        const shadeM = new THREE.MeshStandardMaterial({ color: '#2a1d10', metalness: 1, roughness: 0.3, side: THREE.DoubleSide });
        const poolTex = poolTexture();
        const rodG = new THREE.CylinderGeometry(0.015, 0.015, 1, 6);
        const spots = [];
        for (const x of [-12.6, 12.6]) for (const z of [-8.5, -3.5, 1.5, 6.5]) spots.push([x, z]);
        for (const x of [-6, 0, 6]) spots.push([x, -9.6]);
        for (const [x, z] of spots) {
            const g = new THREE.Group(); g.position.set(x, 5.4, z);
            const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf8a').multiplyScalar(3.2) }));
            bulb.position.y = -0.48;
            const rod = new THREE.Mesh(rodG, brass); rod.scale.y = HT - 5.4; rod.position.y = (HT - 5.4) / 2;
            g.add(new THREE.Mesh(shadeG, shadeM), bulb, rod);
            S.add(g);
            const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffb46a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: poolTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
            pool.position.set(x, 0, z); S.add(pool); refl.hide.push(pool);
            this.pendants.push({ g, bulb, pool, phase: x * 0.7 + z * 0.3, base: new THREE.Vector3(x, 5.4, z) });
        }
        this.lampColor = new THREE.Color('#ffcf8a');

        // ---------------------------------------------------------- lights the game drives
        const spot = new THREE.SpotLight('#ffd7a0', 60, 24, 0.32, 0.8, 1.5);
        spot.position.set(0, 12, 2); spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0015; spot.shadow.normalBias = 0.06;
        S.add(spot, spot.target);
        this.spot = spot; this.spotTo = V(0, 0, 0); this.spotAt = V(0, 0, 0);
        this.spotColor = new THREE.Color('#ffd7a0');
        const mom = new THREE.SpotLight('#ffffff', 0, 20, 0.2, 0.5, 1.3);
        mom.position.set(0, 13, 0); S.add(mom, mom.target);
        this.mom = mom; this.momK = 0;
        // the board's own warm key, high behind it, so its highlight isn't mirrored into the master lens
        this.fill = new THREE.PointLight('#ffcf9a', 20, 40, 1.3); this.fill.position.set(0, 13.5, -6); S.add(this.fill);
        // cool city light through the glass
        this.cityL = new THREE.DirectionalLight('#6f8fd8', 0.35); this.cityL.position.set(0, 4, -20); S.add(this.cityL);
        // ×3 emergency wash
        // it washes the coffers and the upper walls, not the board (the board is the information)
        this.wash = new THREE.PointLight('#ff1a28', 0, 10, 1.6); this.wash.position.set(0, 14.6, -1); S.add(this.wash);
        this.wash2 = new THREE.PointLight('#ff1a28', 0, 10, 1.6); this.wash2.position.set(0, 14.6, -10); S.add(this.wash2);

        this.spotScale = 1; this.spotScaleTo = 1;
        this.heat = 0; this.heatTo = 0; this.flash = 0; this.nextBolt = 6; this.flareK = 0; this.flick = 0;
    }

    focus(pos, color) { if (!pos) return; this.spotTo.copy(pos); this.spotColor.set('#ffd7a0').lerp(new THREE.Color(color || '#ffffff'), 0.18); }
    moment(pos, color) { this.mom.target.position.copy(pos); this.mom.position.copy(pos).add(V(0, 12, 0.5)); this.mom.color.set(color || '#ffffff'); this.momK = 1; }
    lampOut() { this.flick = 1; }
    winner(pos, color, amt = 1) { this.focus(pos, color); this.moment(pos, color); this.momK = amt; this.flareK = 1; }
    setHeat(level, instant = false) { this.heatTo = level; if (instant) this.heat = level; }
    /** for the image-based light: cool city glow through the glass on three sides, warm lamps and the bar */
    envScene() {
        const g = new THREE.Group();
        const glow = (c, w, h, x, y, z, ry) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c), side: THREE.DoubleSide })); p.position.set(x, y, z); p.rotation.y = ry; g.add(p); };
        glow([0.03, 0.035, 0.06], 30, 15, 0, 7, Z0, 0);
        glow([0.02, 0.025, 0.045], 20, 15, X0, 7, -2, Math.PI / 2);
        glow([0.02, 0.025, 0.045], 20, 15, X1, 7, -2, -Math.PI / 2);
        glow([0.12, 0.07, 0.03], 16, 4, 0, 3, Z1, Math.PI);
        for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.0, 0.55) })); s.position.set(Math.cos(i) * 8, 5.5, Math.sin(i) * 8); g.add(s); }
        return g;
    }

    update(dt, t) {
        const k = 1 - Math.exp(-dt * 2.2);
        this.spotAt.lerp(this.spotTo, k);
        this.spot.target.position.copy(this.spotAt);
        this.spot.position.set(this.spotAt.x * 0.5, 12, this.spotAt.z * 0.5 + 2);
        this.spot.color.copy(this.spotColor);
        this.flick = Math.max(0, this.flick - dt * 0.7);
        const stutter = this.flick > 0 ? (Math.sin(t * 47) > 0.2 ? 0.15 : 1) * (1 - this.flick) + this.flick * 0.1 : 1;
        this.spotScale += (this.spotScaleTo - this.spotScale) * (1 - Math.exp(-dt * 3));
        this.spot.intensity = 40 * stutter * this.spotScale;
        this.momK = Math.max(0, this.momK - dt * 0.14);
        this.mom.intensity = 220 * clamp01(this.momK * 1.4);
        this.heat += (this.heatTo - this.heat) * (1 - Math.exp(-dt * 1.2));
        const H = this.heat;
        this.U.uHeat.value = H;
        this.U.uRain.value = 0.3 + H * 0.35;
        // lightning over the city at ×2 and ×3
        this.nextBolt -= dt;
        if (H > 0.6 && this.nextBolt <= 0) { this.flash = 1; this.nextBolt = (H > 1.5 ? 4 : 8) + Math.sin(t * 13.7) * 2.5; }
        this.flash = Math.max(0, this.flash - dt * 2.8);
        const fl = this.flash * (0.6 + 0.4 * Math.sin(t * 60));
        this.U.uFlash.value = fl;
        this.cityL.intensity = 0.35 + fl * 3;
        this.flareK = Math.max(0, this.flareK - dt * 0.12);
        this.U.uFlare.value = this.flareK;
        // pendants: warm → amber at ×2 (and they sway), red-tinged at ×3
        this.lampColor.set('#ffcf8a').lerp(new THREE.Color('#ff9a3a'), clamp01(H)).lerp(new THREE.Color('#ff4a3a'), clamp01(H - 1) * 0.5);
        this.U.uRoomLight.value.copy(this.lampColor);
        for (const P of this.pendants) {
            const sway = clamp01(H) * 0.12 + clamp01(H - 1) * 0.08;
            const sx = Math.sin(t * 0.9 + P.phase) * sway, sz = Math.cos(t * 0.7 + P.phase) * sway * 0.6;
            P.g.rotation.z = sx; P.g.rotation.x = sz;
            P.bulb.material.color.copy(this.lampColor).multiplyScalar(3.2);
            P.pool.material.color.copy(this.lampColor).multiplyScalar(0.13);
            P.pool.position.x = P.base.x - sx * 5.4; P.pool.position.z = P.base.z + sz * 5.4;
        }
        this.fill.color.copy(this.lampColor);
        this.wash.intensity = this.wash2.intensity = clamp01(H - 1) * 90 * (0.55 + 0.45 * Math.sin(t * 2.6));
    }
}
