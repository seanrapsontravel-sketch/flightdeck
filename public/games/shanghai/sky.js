// The sky clock: round 1 is late sunset, round 8 full night with stars and a moon. One dome, one uniform (uT),
// cloud streaks lit from the sun side early and silhouetted late; it also goes into the image-based-light bake at
// each round change (Sky.bake), never per frame.
import * as THREE from 'three';
import { FOG } from '../lib3d/engine.js';
import { skyAt } from './common.js';

const VS = 'varying vec3 vD;void main(){vD=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}';
const FS = `uniform vec3 uZen,uHorSun,uHorAway,uSunDir,uSunCol,uMoonDir;uniform float uStars,uMoon,uSunUp,uTime;varying vec3 vD;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*vn(p);p=p*2.03+7.1;a*=.5;}return s;}
void main(){
  vec3 d=normalize(vD);float h=d.y;
  vec3 sh=normalize(vec3(uSunDir.x,0.,uSunDir.z));float mu=dot(normalize(vec3(d.x,0.,d.z)),sh);
  float side=smoothstep(-.6,1.,mu);
  vec3 hor=mix(uHorAway,uHorSun,side*side);
  float hh=max(h,0.);
  vec3 col=mix(hor,uZen,pow(smoothstep(0.,.75,hh),.55));
  // the glow round the sun, low on the horizon
  float sm=max(dot(d,normalize(uSunDir)),0.);
  col+=uSunCol*(pow(sm,9.)*.55+pow(sm,90.)*1.4)*uSunUp;
  col+=uSunCol*smoothstep(.9994,.9997,sm)*28.*uSunUp*step(0.,h);
  // clouds: long streaks low in the sky, lit warm on the sun side early, dark slate later
  if(h>.0){
    vec2 q=d.xz/(h+.12);
    float c=fbm(q*vec2(.55,2.4)+vec2(uTime*.004,0.));
    c=smoothstep(.52,.78,c)*smoothstep(.0,.08,h)*(1.-smoothstep(.35,.7,h));
    vec3 lit=mix(uHorAway*.55,uSunCol*1.15+uHorSun*.4,pow(side,1.6)*uSunUp);
    vec3 dark=uZen*.55+vec3(.01,.01,.02);
    vec3 cc=mix(dark,lit,.25+.75*uSunUp);
    col=mix(col,cc,c*.85);
    // stars, more near the zenith, none through cloud
    vec2 sp=d.xz/(h+.35)*240.;vec2 ci=floor(sp);float r=h21(ci);
    float st=step(.9935,r)*smoothstep(.45,.05,length(fract(sp)-.5))*(.5+.5*sin(uTime*2.+r*90.));
    col+=vec3(.85,.9,1.)*st*uStars*1.6*smoothstep(.05,.3,h)*(1.-c);
    // the moon
    float mm=dot(d,normalize(uMoonDir));
    col+=vec3(1.,.96,.86)*smoothstep(.99965,.9998,mm)*6.*uMoon+vec3(.5,.6,.9)*pow(max(mm,0.),60.)*.25*uMoon;
  } else col=mix(hor*.6,hor,exp(h*14.));
  gl_FragColor=vec4(col,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SUN_AZ = 18;
const dir = (az, el) => { const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el); return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize(); };

export class Sky {
    constructor(engine, { radius = 3000 } = {}) {
        this.engine = engine;
        this.U = {
            uZen: { value: new THREE.Color() }, uHorSun: { value: new THREE.Color() }, uHorAway: { value: new THREE.Color() },
            uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uMoonDir: { value: dir(120, 38) },
            uStars: { value: 0 }, uMoon: { value: 0 }, uSunUp: { value: 1 }, uTime: engine.time,
        };
        this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: VS, fragmentShader: FS, side: THREE.BackSide, depthWrite: false, fog: false }));
        this.mesh.frustumCulled = false; this.mesh.renderOrder = -10;
        engine.scene.add(this.mesh);
        this.set(0);
    }

    /** t = game progress (0 = round 1 … 1 = round 8): sky colours, the key light, fill and haze */
    set(t) {
        const s = skyAt(t), U = this.U, E = this.engine;
        this.state = s;
        U.uZen.value.copy(s.zen); U.uHorSun.value.copy(s.horSun); U.uHorAway.value.copy(s.horAway);
        // the sun sits low behind the pagoda's side of the courtyard; it sets as the rounds pass
        const sunEl = 4 - 10 * Math.min(1, t / 0.45);
        // the visible sun sets in frame, behind the pagoda's side of the courtyard; the key light stays on the
        // courtyard from the front-left (a cinematic cheat), and a warm rim from the sun's side sells the backlight
        U.uSunDir.value.copy(dir(SUN_AZ, sunEl)); U.uSunCol.value.set('#ff8a3c').lerp(new THREE.Color('#ff5a2a'), Math.min(1, t * 2));
        U.uStars.value = s.stars; U.uMoon.value = s.moon; U.uSunUp.value = s.sunUp;
        // the key light: the low sun early, the moon late (direction from the table)
        E.sunDir.copy(dir(s.az, s.el));
        E.sun.color.copy(s.key); E.sun.intensity = s.ki;
        E.hemi.color.copy(s.zen).lerp(new THREE.Color('#ffffff'), 0.25); E.hemi.groundColor.set('#2a1a14'); E.hemi.intensity = s.hemi;
        if (E.rim) { E.rim.color.copy(s.horSun); E.rim.intensity = 1.3 * s.sunUp + 0.12; E.rim.position.copy(dir(SUN_AZ, 12)).multiplyScalar(100); }
        // haze: warm toward the sunset, deep blue away (engine FOG layout: dir, density | away, height | toward, ramp)
        const F = FOG;
        {
            const fd = dir(SUN_AZ, 2);
            F[0] = fd.x; F[1] = fd.y; F[2] = fd.z;
            F[4] = s.away.r; F[5] = s.away.g; F[6] = s.away.b;
            F[8] = s.toward.r; F[9] = s.toward.g; F[10] = s.toward.b;
        }
        return s;
    }

    /** image-based light from this sky (+ extra emitters), once per round change */
    bake(extra) {
        const g = new THREE.Group();
        const m = this.mesh.clone(); m.material = this.mesh.material.clone(); m.material.uniforms = this.U; m.material.toneMapped = false;
        g.add(m);
        if (extra) g.add(extra);
        this.engine.bakeEnvironment(g);
        m.material.dispose();
    }
}
