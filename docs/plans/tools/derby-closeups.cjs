// Derby hero review: 1:1 close-ups of horse, jockey and crowd, a galloping strip and black silhouettes.
// usage: node docs/plans/tools/derby-closeups.cjs <outdir> [query]
// Fixed cameras (director bypassed), HUD/intro hidden, real renderer + post. Prints sculpt stats and fps.
const R = '/Users/seanrapson/flightdeck-fork/';
const { chromium } = require(R + 'node_modules/playwright');
const { startHost } = require(R + 'tests/helpers.cjs');
const fs = require('fs');
(async () => {
    const OUT = process.argv[2] || R + 'docs/plans/derby-lookdev/closeups';
    const q = process.argv[3] || 'demo=1&seed=5&players=5&dpr=1';
    fs.mkdirSync(OUT, { recursive: true });
    const host = await startHost();
    const b = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
    const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 900 } });
    const page = await ctx.newPage();
    const logs = []; page.on('console', (m) => { if (['error', 'warning', 'info'].includes(m.type())) logs.push(m.type() + ': ' + m.text()); }); page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
    await page.goto(host.base + '/games/derby.html?' + q);
    await page.waitForTimeout(9000);
    await page.addStyleTag({ content: '.dh-hud,.k-intro,[class*="intro"],#matchWinnerScreen{display:none!important}' });
    await page.evaluate(() => {
        window.__derbyDemo.force('playing'); window.__derbyDemo.pause();
        const D = window.__derby, dir = D.director, T = D.THREE;
        dir.__fixed = null;
        const orig = dir.update.bind(dir);
        dir.update = (ctx, dt) => {
            if (!dir.__fixed) return orig(ctx, dt);
            const f = dir.__fixed(); dir.cam.position.copy(f.pos); dir.cam.lookAt(f.look);
            dir.cam.fov = f.fov; dir.cam.updateProjectionMatrix(); dir.look.copy(f.look);
            dir.dofFocus = dir.cam.position.distanceTo(f.look); dir.dofAp = f.ap || 0;
        };
        window.__cam = (fn) => { dir.__fixed = fn; };
        window.__V = (x, y, z) => new T.Vector3(x, y, z);
    });
    await page.waitForTimeout(3000);
    const shot = async (name, camJs, wait = 500) => { await page.evaluate(camJs); await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${name}.png` }); };
    const R0 = 'const r=__derby.race.runners[1];';
    // idle hero angles on one runner
    await shot('01-side', `${R0}__cam(()=>({pos:__V(r.x+0.15,1.25,r.z+5.6),look:__V(r.x+0.15,1.15,r.z),fov:30}))`);
    await shot('02-threequarter', `${R0}__cam(()=>({pos:__V(r.x+3.6,1.5,r.z+3.6),look:__V(r.x+0.1,1.2,r.z),fov:32}))`);
    await shot('03-head', `${R0}__cam(()=>({pos:__V(r.x+2.2,2.0,r.z+1.6),look:__V(r.x+1.1,1.8,r.z),fov:30}))`);
    await shot('04-jockey', `${R0}__cam(()=>({pos:__V(r.x+1.5,2.2,r.z+2.2),look:__V(r.x+0.3,1.9,r.z),fov:30}))`);
    await shot('05-rear', `${R0}__cam(()=>({pos:__V(r.x-3.8,1.6,r.z+2.6),look:__V(r.x-0.2,1.1,r.z),fov:32}))`);
    await shot('06-legs', `${R0}__cam(()=>({pos:__V(r.x+0.0,0.6,r.z+2.6),look:__V(r.x,0.55,r.z),fov:34}))`);
    // gallop strip: send the runner off and follow it alongside
    await page.evaluate(`${R0} r.targetX=r.x+400; __cam(()=>({pos:__V(r.x+0.2,1.3,r.z+6.2),look:__V(r.x+0.2,1.15,r.z),fov:30}))`);
    await page.waitForTimeout(2500);
    for (let i = 0; i < 6; i++) { await page.screenshot({ path: `${OUT}/07-gallop-${i}.png` }); await page.waitForTimeout(70); }
    await shot('08-gallop-front', `${R0}__cam(()=>({pos:__V(r.x+5,1.4,r.z+2.2),look:__V(r.x+0.4,1.3,r.z),fov:30}))`, 300);
    // silhouette: the same side view, every runner material black and unlit
    await page.evaluate(`${R0} r.targetX=r.x; r.vx=0; r.x=r.x;`);
    await page.waitForTimeout(2500);
    await page.evaluate(`${R0} const T=__derby.THREE; const blk=new T.MeshBasicMaterial({color:0}); window.__sil=[]; r.group.traverse(o=>{if(o.isMesh&&o!==r.blob){__sil.push([o,o.material]); o.material=blk;}}); __cam(()=>({pos:__V(r.x+0.15,1.35,r.z+5.8),look:__V(r.x+0.15,1.15,r.z),fov:30}))`);
    await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/09-silhouette.png` });
    await page.evaluate(`for(const [o,m] of __sil) o.material=m;`);
    // crowd: apron rail standing crowd and the stand
    await shot('10-crowd-rail', `const c=__derby.course; __cam(()=>({pos:__V(120,1.7,-6),look:__V(124,1.2,-14),fov:34}))`);
    await shot('10b-crowd-close', `__cam(()=>({pos:__V(121,1.55,-9.6),look:__V(122.5,1.25,-14),fov:30}))`);
    await shot('11-crowd-stand', `__cam(()=>({pos:__V(100,5,-24),look:__V(105,6,-38),fov:34}))`);
    await page.evaluate(() => { window.__cam(null); window.__derbyDemo.force('midrace'); window.__derbyDemo.resume(); });
    await page.waitForTimeout(6000); await page.screenshot({ path: `${OUT}/12-broadcast.png` });
    const fps = await page.evaluate(() => new Promise((r) => { let n = 0, t0 = performance.now(); function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); } requestAnimationFrame(f); }));
    console.log('fps', fps);
    console.log(logs.filter((l) => /derby|error|PAGEERROR/i.test(l)).slice(0, 20).join('\n'));
    await b.close(); await host.stop();
})().catch((e) => { console.error(e); process.exit(1); });
