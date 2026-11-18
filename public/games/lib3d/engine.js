// Renderer, light, sky, haze and the post chain. The approach is La Cala's: the scene renders linear HDR into a
// multisampled half-float target; its brightest parts spread into a soft bloom through a small mip chain; then a
// vignette, dither and an AgX filmic grade go to the screen. Materials get image-based light from the sky itself.
//
// Shared by the 3D games (Derby, Demolition, Limbo). Everything scene-specific is a preset: `new Engine(canvas, PRESETS.day)`
// is exactly the Derby look; a game passes its own preset (or overrides on top of one) for a different light.
import * as THREE from 'three';

/**
 * Light / sky / haze presets. Fields:
 *  key      — the main shadow-casting directional light: az/el in degrees, colour, intensity, shadow box half-size + map size
 *  sky      — zenith + horizon colours for the procedural sky; `false` = no sky dome (the game draws its own backdrop)
 *  fog      — haze colour away from / toward the key light, density per metre, height scale, ramp-in distance;
 *             optional az/el aim the warm "toward" lobe somewhere other than the key (dusk: the sunset, not the moon)
 *  hemi     — sky/ground fill colours + intensity; rim — a kicker opposite the key light (null = none)
 *  envFloor — linear colour of the ground disc in the image-based-light bake
 *  grade    — saturation / warmth / lift after tone mapping; bloom, vignette, ca (chromatic aberration) post knobs
 */
export const PRESETS = {
    // Derby: low golden sun, raking across the track from behind the camera's left so shadows fall toward the stands
    day: {
        key: { az: 214, el: 21, color: '#ffd2a0', intensity: 5.6, extent: 48, map: 4096, far: 600, dist: 300 },
        sky: { zen: '#1f5fb8', hor: '#c9d8e8' },
        fog: { away: '#a9bed3', toward: '#ffd6a6', density: 0.00085, height: 70, ramp: 160 },
        hemi: { sky: '#bcd6ff', ground: '#5c6a3a', intensity: 0.08 },
        rim: { color: '#b9d2ff', intensity: 1.1 },
        envFloor: [0.035, 0.06, 0.02],
        grade: { sat: 1, warm: 0.35, lift: 0 },
        bloom: 0.06, vignette: 0.38, ca: 0.6,
    },
    // Demolition: a construction yard at night. The key is the big LED floodlight rig high on the camera's left
    // (cool white, it casts the shadows); a teal kicker rims from behind; the game adds sodium spots, its own sky
    // and the city glow. Thick low haze so the floodlight beams and the skyline sit in air.
    night: {
        key: { az: 242, el: 40, color: '#dce7ff', intensity: 2.3, extent: 30, map: 4096, far: 260, dist: 120 },
        sky: false,
        fog: { away: '#0a1624', toward: '#1a1a22', density: 0.0085, height: 24, ramp: 34 },
        hemi: { sky: '#40608f', ground: '#141110', intensity: 0.22 },
        rim: { color: '#5cc6ff', intensity: 1.5 },
        envFloor: [0.006, 0.006, 0.007],
        grade: { sat: 1.04, warm: -0.12, lift: 0.006 },
        bloom: 0.1, vignette: 0.52, ca: 0.7,
    },
    // Limbo: a lagoon at blue hour, the sun just under the sea. The key is a cool moon high behind the camera's
    // right (it casts the shadows); the haze glows coral toward the sunset on the horizon beyond the rig, and a warm
    // kicker from that side rims everything. The game draws its own sky; fire and torches are its practicals.
    dusk: {
        key: { az: 148, el: 34, color: '#9fb8ff', intensity: 1.9, extent: 26, map: 4096, far: 260, dist: 120 },
        sky: false,
        fog: { away: '#141d42', toward: '#7e4a4c', density: 0.0011, height: 40, ramp: 120, az: 8, el: 2 },
        hemi: { sky: '#4a63a8', ground: '#1c1922', intensity: 0.3 },
        rim: { color: '#ff9a6a', intensity: 0.35 },
        envFloor: [0.012, 0.014, 0.022],
        grade: { sat: 1.08, warm: 0, lift: 0.002 },
        bloom: 0.1, vignette: 0.45, ca: 0.6,
    },
};

/** preset with nested overrides: `withPreset('day', { key: { intensity: 3 } })` */
export function withPreset(name, over = {}) {
    const base = PRESETS[name], out = {};
    for (const k of new Set([...Object.keys(base), ...Object.keys(over)])) {
        const b = base[k], o = over[k];
        out[k] = o === undefined ? b : (o && b && typeof o === 'object' && typeof b === 'object' && !Array.isArray(o)) ? { ...b, ...o } : o;
    }
    return out;
}

// ---------------------------------------------------------------- grade (CustomToneMapping)
const GRADE = `vec3 CustomToneMapping(vec3 color){
  vec3 c=clamp(AgXToneMapping(max(color,0.)),0.,1.);
  c=pow(c,vec3(1.12))*pow(.18,-.12);
  float y=dot(c,vec3(.2126,.7152,.0722));
  return clamp(mix(vec3(y),c,1.14),0.,1.);}`;
{
    const S = THREE.ShaderChunk, stub = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
    if (S.tonemapping_pars_fragment.includes(stub)) S.tonemapping_pars_fragment = S.tonemapping_pars_fragment.replace(stub, GRADE);
}

// ---------------------------------------------------------------- aerial haze (replaces three's fog chunks)
// uFog[0] = sun dir + density/m, [1] = haze colour away from sun + height scale, [2] = colour toward sun + ramp-in distance
export const FOG = new Float32Array([0, 1, 0, 0.0014, 0.62, 0.7, 0.8, 60, 1.0, 0.86, 0.68, 90]);
export const HAZE_GLSL = `uniform vec4 uFog[3];
vec3 dHazeCol(vec3 rd){float s=max(dot(rd,uFog[0].xyz),0.);return mix(uFog[1].rgb,uFog[2].rgb,s*s*s*.6+pow(s,10.)*.4);}
float dHazeT(vec3 wp){vec3 rv=wp-cameraPosition;float d=length(rv);
  float y0=max(cameraPosition.y,0.),y1=max(wp.y,0.),H=uFog[1].w,dy=y1-y0;
  float lay=abs(dy)>.5?H*(exp(-y0/H)-exp(-y1/H))/dy:exp(-y0/H);
  return exp(-uFog[0].w*lay*max(d-uFog[2].w,0.)*d/(d+uFog[2].w));}
vec3 dHaze(vec3 col,vec3 wp){float T=dHazeT(wp);return col*T+dHazeCol(normalize(wp-cameraPosition))*(1.-T);}
`;
{
    const S = THREE.ShaderChunk;
    S.fog_pars_vertex = '#ifdef USE_FOG\nvarying vec3 vFogW;\n#endif';
    S.fog_vertex = '#ifdef USE_FOG\nvFogW=(mvPosition.xyz-viewMatrix[3].xyz)*mat3(viewMatrix);\n#endif';
    S.fog_pars_fragment = '#ifdef USE_FOG\nuniform vec3 fogColor;varying vec3 vFogW;\n' + HAZE_GLSL + '#endif';
    S.fog_fragment = '#ifdef USE_FOG\ngl_FragColor.rgb=dHaze(gl_FragColor.rgb,vFogW);\n#endif';
    for (const k in THREE.ShaderLib) { const u = THREE.ShaderLib[k].uniforms; if (u.fogColor) u.uFog = { value: FOG }; }
}

// ---------------------------------------------------------------- sky
const SKY_VS = 'varying vec3 vD;void main(){vD=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}';
const SKY_FS = `uniform vec3 uSun,uSunCol,uZen,uHor;uniform float uTime;varying vec3 vD;
float hsh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hsh(i),hsh(i+vec2(1,0)),f.x),mix(hsh(i+vec2(0,1)),hsh(i+vec2(1,1)),f.x),f.y);}
const float CH=1500.,CT=800.;
float cfield(vec2 P,float det){vec2 q=P/1000.;q+=(vec2(vn(q*.6+1.3),vn(q*.6+8.1))-.5)*.9;
  return vn(q)*.55+vn(q*2.07+5.2)*.27+(vn(q*4.3+1.7)*.16+vn(q*8.9+3.3)*.08)*det+(.12-.12*det);}
void main(){
  vec3 d=normalize(vD),sd=normalize(uSun);float mu=dot(d,sd),h=max(d.y,0.);
  vec3 hz=dHazeCol(d);
  vec3 zen=uZen*(1.-.2*(1.-mu*mu)*smoothstep(.1,.9,h));
  vec3 col=mix(mix(uFog[1].rgb*1.06,uHor,.35+.65*smoothstep(-.4,1.,mu)),zen,pow(h,.42));
  col=mix(col,hz,exp(-h*12.));
  float m=max(mu,0.);vec3 sg=mix(vec3(dot(uSunCol,vec3(.3,.59,.11))),uSunCol,.5);
  col+=uSunCol*(smoothstep(.99985,.99993,mu)*40.+pow(m,700.)*2.)+sg*(pow(m,80.)*.4+pow(m,7.)*.16*(1.-h*.6));
  vec3 co=vec3(0.,cameraPosition.y,0.);
  if(d.y>.004){
    float t0=(CH-co.y)/d.y,det=exp(-t0/14000.),dt=min(CT/d.y,1600.)/10.,j=hsh(gl_FragCoord.xy)*.8+.1;
    vec2 W=vec2(6.,-2.)*uTime;
    vec3 amb=mix(uZen,uHor,.55),sunW=mix(vec3(dot(uSunCol,vec3(.3,.59,.11))),uSunCol,.45);
    float thr=.79-.18*vn(d.xz*(t0+CT*.5/d.y)/5200.+vec2(3.1,7.7));
    vec4 acc=vec4(0.);
    float pm=max(cfield(d.xz*t0+W,det),max(cfield(d.xz*(t0+dt*5.)+W,det),cfield(d.xz*(t0+dt*10.)+W,det)));
    if(pm>thr-.1)for(int i=0;i<10;i++){
      float hf=(float(i)+j)/10.,t=t0+dt*(float(i)+j);
      float b=cfield(d.xz*t+W,det),th=thr+.3*hf*hf;
      float a=smoothstep(th,th+.12,b)*(i==0?.85:.6);
      if(a>0.){
        float lit=clamp((.12+hf*1.1+(1.-h)*.25)*(1.-.35*m*m),0.,1.);
        vec3 cc=mix(amb*.6+sunW*.06,sunW*.95+amb*.32,lit)+sunW*pow(m,8.)*(1.-a)*.8;
        acc.rgb+=(1.-acc.a)*a*cc;acc.a+=(1.-acc.a)*a;
      }
      if(acc.a>.97)break;
    }
    if(acc.a>0.){vec3 cc=acc.rgb/acc.a;cc=mix(cc,hz,1.-exp(-t0/26000.));col=mix(col,cc,acc.a*smoothstep(.004,.05,d.y));}
  }
  if(d.y<0.)col=hz;
  gl_FragColor=vec4(col,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- post
const VS = 'varying vec2 vU;void main(){vU=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}';
const PRE = `uniform sampler2D tSrc;uniform vec2 uTx;varying vec2 vU;
vec3 bp(vec2 o){vec3 c=min(texture2D(tSrc,vU+o*uTx).rgb,vec3(24.));float l=max(c.r,max(c.g,c.b)),k=clamp(l-.85,0.,1.2);k=k*k/2.4;return c*max(k,l-1.4)/max(l,1e-4);}
void main(){gl_FragColor=vec4((bp(vec2(-1))+bp(vec2(1))+bp(vec2(-1,1))+bp(vec2(1,-1)))*.25,1.);}`;
const DOWN = `uniform sampler2D tSrc;uniform vec2 uTx;varying vec2 vU;
void main(){vec3 s=texture2D(tSrc,vU).rgb*4.;s+=texture2D(tSrc,vU+uTx*vec2(-1)).rgb+texture2D(tSrc,vU+uTx).rgb+texture2D(tSrc,vU+uTx*vec2(-1,1)).rgb+texture2D(tSrc,vU+uTx*vec2(1,-1)).rgb;gl_FragColor=vec4(s/8.,1.);}`;
const UP = `uniform sampler2D tSrc;uniform vec2 uTx;varying vec2 vU;
vec3 t(float x,float y){return texture2D(tSrc,vU+uTx*vec2(x,y)).rgb;}
void main(){gl_FragColor=vec4((t(-2.,0.)+t(2.,0.)+t(0.,-2.)+t(0.,2.)+2.*(t(-1.,-1.)+t(1.,-1.)+t(-1.,1.)+t(1.,1.)))/12.,1.);}`;
const COMP = `uniform sampler2D tScene,tBloom,tDepth,tB1,tB2,tB3;uniform float uDofFar,uBloom,uVig,uFlash,uCA,uTime,uSat,uWarm,uLift,uFocus,uAper,uNear,uFar,uDof;uniform vec2 uRes;varying vec2 vU;
float lin(float d){return uNear*uFar/(uFar-d*(uFar-uNear));}
void main(){
  vec2 c=vU-.5;float r2=dot(c,c);
  vec3 col;
  if(uCA>0.){vec2 o=c*r2*uCA;col=vec3(texture2D(tScene,vU-o).r,texture2D(tScene,vU).g,texture2D(tScene,vU+o).b);}
  else col=texture2D(tScene,vU).rgb;
  if(uDof>.5&&uAper>.001){
    // depth of field: blend toward pre-blurred copies by each pixel's circle of confusion; the far field takes the
    // background blur, the near field a little less so foreground edges don't smear over what's in focus
    float z=lin(texture2D(tDepth,vU).r);
    float coc=clamp(abs(z-uFocus)/max(z,.01)*uAper*(z<uFocus?.7:1.),0.,1.);
    vec3 b=mix(texture2D(tB1,vU).rgb,texture2D(tB2,vU).rgb,smoothstep(.35,.9,coc));
    if(uDofFar>.5)b=mix(b,texture2D(tB3,vU).rgb,smoothstep(.5,1.,coc));
    col=mix(col,b,smoothstep(.04,.45,coc));
  }
  col+=texture2D(tBloom,vU).rgb*uBloom;
  vec2 q=c*vec2(uRes.x/uRes.y,1.)*.9;col*=1.-uVig*smoothstep(.1,.7,dot(q,q));
  col=col*(1.+uFlash*1.5)+uFlash*vec3(1.,.97,.92)*.35;
  gl_FragColor=vec4(col,1.);
  #include <tonemapping_fragment>
  {vec3 g=gl_FragColor.rgb;float y=dot(g,vec3(.2126,.7152,.0722));g=mix(vec3(y),g,uSat);
   g*=vec3(1.+.05*uWarm,1.+.012*uWarm,1.-.06*uWarm);g+=uLift*(1.-g);gl_FragColor.rgb=clamp(g,0.,1.);}
  #include <colorspace_fragment>
  gl_FragColor.rgb+=(fract(sin(dot(gl_FragCoord.xy+uTime,vec2(12.9898,78.233)))*43758.5453)-.5)/255.;}`;

export class Engine {
    constructor(canvas, preset = PRESETS.day) {
        this.preset = preset;
        const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
        r.outputColorSpace = THREE.SRGBColorSpace;
        r.toneMapping = THREE.CustomToneMapping;
        r.toneMappingExposure = 1;
        r.shadowMap.enabled = true;
        r.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer = r;
        const fixed = Number(new URLSearchParams(location.search).get('dpr'));
        this.fixedDpr = fixed > 0 ? fixed : 0;
        this.maxDpr = this.fixedDpr || Math.min(window.devicePixelRatio || 1, 1.5);
        this.dpr = this.maxDpr;
        r.setPixelRatio(this.dpr);
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0xc8d0d6, 0.001);
        this.camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.3, 9000);
        this.time = { value: 0 };
        const G = preset.grade;
        this.grade = { uSat: { value: G.sat }, uWarm: { value: G.warm }, uLift: { value: G.lift } };
        this.flash = 0; this.bloom = preset.bloom; this.vignette = preset.vignette; this.ca = preset.ca;
        this.hdr = r.capabilities.isWebGL2 && !!(r.getContext().getExtension('EXT_color_buffer_float') || r.getContext().getExtension('EXT_color_buffer_half_float'));
        this.setupLights();
        this.setupSky();
        this.setupPost();
        this.frameMs = 16; this._slow = 0;
        // functions run at the start of render(), before the main pass (e.g. a planar reflection into a target)
        this.prePasses = [];
    }

    /** the key light (a sun by day; for night scenes, the dominant floodlight direction) plus fill and rim */
    setupLights() {
        const P = this.preset, K = P.key;
        const dir = (az, el) => { const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el); return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize(); };
        this.sunDir = dir(K.az, K.el);
        const sun = new THREE.DirectionalLight(K.color, K.intensity);
        sun.castShadow = true;
        sun.shadow.mapSize.set(K.map, K.map);
        Object.assign(sun.shadow.camera, { left: -K.extent, right: K.extent, top: K.extent, bottom: -K.extent, near: 1, far: K.far });
        sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.035; sun.shadow.radius = 2.5;
        this.scene.add(sun, sun.target);
        this.sun = sun;
        this.shadowDist = K.dist;
        const S = P.sky || { zen: '#000000', hor: '#000000' };
        this.U = {
            uSun: { value: this.sunDir }, uSunCol: { value: new THREE.Color(K.color) }, uZen: { value: new THREE.Color(S.zen) }, uHor: { value: new THREE.Color(S.hor) },
            uTime: this.time, uFog: { value: FOG },
        };
        const F = P.fog, fa = new THREE.Color(F.away), fb = new THREE.Color(F.toward);
        this.fogDir = F.az === undefined ? this.sunDir.clone() : dir(F.az, F.el ?? 0);
        FOG.set([this.fogDir.x, this.fogDir.y, this.fogDir.z, F.density, fa.r, fa.g, fa.b, F.height, fb.r, fb.g, fb.b, F.ramp]);
        // soft fill from the sky dome so shade isn't black before the env map is ready
        this.hemi = new THREE.HemisphereLight(P.hemi.sky, P.hemi.ground, P.hemi.intensity);
        this.scene.add(this.hemi);
        // a cool kicker opposite the key light: rims subjects against the background
        if (P.rim) {
            const rim = new THREE.DirectionalLight(P.rim.color, P.rim.intensity);
            rim.position.copy(this.sunDir).multiplyScalar(-100).setY(60);
            this.scene.add(rim);
            this.rim = rim;
        }
        // ?quality=low for slower screens: smaller shadow map, no depth of field, capped resolution
        this.low = new URLSearchParams(location.search).get('quality') === 'low';
        if (this.low) { sun.shadow.mapSize.set(K.map >> 1, K.map >> 1); this.maxDpr = Math.min(this.maxDpr, 1); this.dpr = this.maxDpr; }
    }

    setupSky() {
        if (this.preset.sky === false) { this.sky = null; return; }
        const mat = new THREE.ShaderMaterial({
            side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { ...this.U },
            vertexShader: SKY_VS, fragmentShader: HAZE_GLSL + SKY_FS,
        });
        this.sky = new THREE.Mesh(new THREE.SphereGeometry(8000, 48, 24), mat);
        this.sky.frustumCulled = false;
        this.sky.renderOrder = -10;
        this.scene.add(this.sky);
    }

    /** image-based light from the sky (and the scene's own colours, roughly: a floor disc of `preset.envFloor`) plus `extra` */
    bakeEnvironment(extra) {
        const pm = new THREE.PMREMGenerator(this.renderer);
        const s = new THREE.Scene();
        let skyMat = null;
        if (this.sky) {
            skyMat = this.sky.material.clone();
            skyMat.uniforms = { ...this.U };
            // the env must stay linear: draw the sky without tone mapping
            skyMat.toneMapped = false;
            s.add(new THREE.Mesh(this.sky.geometry, skyMat));
        }
        const floor = new THREE.Mesh(new THREE.CircleGeometry(4000, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(...this.preset.envFloor) }));
        floor.position.y = -2; s.add(floor);
        if (extra) s.add(extra);
        const prevTM = this.renderer.toneMapping;
        this.renderer.toneMapping = THREE.NoToneMapping;
        const rt = pm.fromScene(s, 0.03, 0.5, 4000);
        this.renderer.toneMapping = prevTM;
        this.scene.environment = rt.texture;
        if (skyMat) skyMat.dispose();
        floor.geometry.dispose(); floor.material.dispose(); pm.dispose();
    }

    setupPost() {
        if (!this.hdr) { this.post = null; return; }
        const tgt = (samples = 0) => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples, depthBuffer: samples > 0, stencilBuffer: false });
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
        const quad = new THREE.Mesh(g); quad.frustumCulled = false;
        const scene = new THREE.Scene(); scene.add(quad);
        const mat = (fs, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, toneMapped: false, ...extra });
        const u = () => ({ tSrc: { value: null }, uTx: { value: new THREE.Vector2() } });
        const rt = tgt(4);
        rt.depthTexture = new THREE.DepthTexture(1, 1); rt.depthTexture.type = THREE.UnsignedIntType;
        // dof.far: a third, coarser blur level for a strongly defocused background (bokeh skyline); off for Derby
        this.dof = { focus: 10, aperture: 0, far: false };
        this.post = {
            rt, blur: [tgt(), tgt(), tgt()], mips: [tgt(), tgt(), tgt(), tgt(), tgt()], quad, scene, cam: new THREE.Camera(), w: 0, h: 0,
            pre: mat(PRE, u()), down: mat(DOWN, u()), up: mat(UP, u(), { blending: THREE.AdditiveBlending, transparent: true }),
            comp: mat(COMP, { tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0 }, uVig: { value: 0 }, uFlash: { value: 0 }, uCA: { value: 0 }, uTime: this.time, uRes: { value: new THREE.Vector2() }, tDepth: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null }, uDofFar: { value: 0 }, uFocus: { value: 10 }, uAper: { value: 0 }, uNear: { value: 0.3 }, uFar: { value: 9000 }, uDof: { value: 1 }, ...this.grade }, { toneMapped: true }),
        };
    }

    resize(w, h) {
        this.renderer.setPixelRatio(this.dpr);
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    /** keep the sun's shadow box centred on what the camera is looking at, snapped to texels so edges don't crawl */
    placeShadow(focus) {
        const sun = this.sun, s = sun.shadow.camera;
        const texel = (s.right - s.left) / sun.shadow.mapSize.x;
        const light = new THREE.Matrix4().lookAt(new THREE.Vector3(), this.sunDir.clone().negate(), new THREE.Vector3(0, 1, 0));
        const inv = light.clone().invert();
        const p = focus.clone().applyMatrix4(inv);
        p.x = Math.round(p.x / texel) * texel; p.y = Math.round(p.y / texel) * texel;
        p.applyMatrix4(light);
        sun.target.position.copy(p);
        sun.position.copy(p).addScaledVector(this.sunDir, this.shadowDist);
        sun.target.updateMatrixWorld();
    }

    pass(m, src, w, h, dst) {
        const p = this.post;
        m.uniforms.tSrc.value = src; m.uniforms.uTx.value.set(1 / w, 1 / h);
        p.quad.material = m; this.renderer.setRenderTarget(dst); this.renderer.render(p.scene, p.cam);
    }

    render() {
        const R = this.renderer, p = this.post;
        for (const f of this.prePasses) f(this);
        if (!p) { R.setRenderTarget(null); R.render(this.scene, this.camera); return; }
        const sz = R.getDrawingBufferSize(new THREE.Vector2());
        if (sz.x !== p.w || sz.y !== p.h) {
            p.w = sz.x; p.h = sz.y; p.rt.setSize(p.w, p.h);
            p.mips.forEach((m, i) => m.setSize(Math.max(1, p.w >> (i + 1)), Math.max(1, p.h >> (i + 1))));
            p.blur[0].setSize(Math.max(1, p.w >> 1), Math.max(1, p.h >> 1)); p.blur[1].setSize(Math.max(1, p.w >> 2), Math.max(1, p.h >> 2)); p.blur[2].setSize(Math.max(1, p.w >> 3), Math.max(1, p.h >> 3));
        }
        R.setRenderTarget(p.rt); R.render(this.scene, this.camera);
        const M = p.mips, ac = R.autoClear; R.autoClear = false;
        this.pass(p.pre, p.rt.texture, p.w, p.h, M[0]);
        for (let i = 1; i < M.length; i++) this.pass(p.down, M[i - 1].texture, M[i - 1].width, M[i - 1].height, M[i]);
        for (let i = M.length - 1; i > 0; i--) this.pass(p.up, M[i].texture, M[i].width, M[i].height, M[i - 1]);
        const dofOn = this.dof.aperture > 0.001 && !this.low;
        if (dofOn) {
            this.pass(p.down, p.rt.texture, p.w, p.h, p.blur[0]);
            this.pass(p.down, p.blur[0].texture, p.blur[0].width, p.blur[0].height, p.blur[1]);
            if (this.dof.far) this.pass(p.down, p.blur[1].texture, p.blur[1].width, p.blur[1].height, p.blur[2]);
        }
        const u = p.comp.uniforms;
        u.tDepth.value = p.rt.depthTexture; u.tB1.value = p.blur[0].texture; u.tB2.value = p.blur[1].texture; u.tB3.value = p.blur[2].texture; u.uDofFar.value = this.dof.far ? 1 : 0;
        u.uFocus.value = this.dof.focus; u.uAper.value = dofOn ? this.dof.aperture : 0; u.uNear.value = this.camera.near; u.uFar.value = this.camera.far;
        u.tScene.value = p.rt.texture; u.tBloom.value = M[0].texture; u.uBloom.value = this.bloom; u.uVig.value = this.vignette;
        u.uFlash.value = this.flash; u.uCA.value = this.ca * 0.012; u.uRes.value.set(p.w, p.h);
        p.quad.material = p.comp; R.setRenderTarget(null); R.render(p.scene, p.cam);
        R.autoClear = ac;
    }

    /** dynamic resolution: step pixel density down when frames run long, back up with headroom */
    adapt(ms) {
        this.frameMs = this.frameMs * 0.95 + ms * 0.05;
        if (this.fixedDpr || ++this._slow < 90) return;
        this._slow = 0;
        let next = this.dpr;
        if (this.frameMs > 21) next = Math.max(0.6, this.dpr - 0.15);
        else if (this.frameMs < 14 && this.dpr < this.maxDpr) next = Math.min(this.maxDpr, this.dpr + 0.1);
        if (next !== this.dpr) { this.dpr = next; const c = this.renderer.domElement; this.resize(c.clientWidth, c.clientHeight); }
    }
}
