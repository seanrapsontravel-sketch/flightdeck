// Quackshot Milestone 3 review: every set piece as a strip of frames across its window (fixed-step, seeded, fake
// clock), one sheet per moment + a clip of them all. Frame times are seconds after the dart lands / the phase starts.
// usage: node docs/plans/tools/quackshot-moments.cjs [outDir=docs/plans/quackshot-lookdev/m3] [only]
const R = require('path').resolve(__dirname, '../../..') + '/';
const { chromium } = require(R + 'node_modules/playwright');
const { startHost } = require(R + 'tests/helpers.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const OUT = path.resolve(process.argv[2] || R + 'docs/plans/quackshot-lookdev/m3');
const ONLY = process.argv[3] || '';
// kind: how to start it; at: frame times (s) after the start; lead: frames from force() to the start (a dart lands
// ~0.64 s after force: 0.3 s timer + 0.34 s flight)
const MOMENTS = [
    { name: 'parade', go: "__quackshotDemo.force('parade')", lead: 39, at: [0, 0.1, 0.25, 0.6, 1.0, 1.3, 1.6, 2.1] },
    { name: 'outer-bull', go: "__quackshotDemo.force('bull')", lead: 39, at: [0.05, 0.3, 0.6, 0.9, 1.3, 1.7, 2.3, 3.4] },
    { name: 'double-bull', go: "__quackshotDemo.force('dbull')", lead: 39, at: [0.05, 0.3, 0.6, 0.9, 1.3, 1.7, 2.3, 3.4] },
    { name: 'ring-of-fire', go: "__quackshotDemo.force('fire')", lead: 39, at: [0.05, 0.2, 0.4, 0.7, 1.2, 2.0, 2.8, 3.6] },
    { name: 'splash', go: "__quackshotDemo.force('splash')", lead: 39, at: [0.05, 0.2, 0.35, 0.55, 0.8, 1.2, 1.8, 3.0] },
    { name: 'miss', go: "__quackshotDemo.force('miss')", lead: 39, at: [0, 0.1, 0.25, 0.45, 0.8, 1.2, 1.8, 3.0] },
    { name: 'round-crane', go: "__quackshotDemo.force('round')", lead: 39 + 30, at: [0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.9] },
    { name: 'intermission', go: "__quackshotDemo.force('dart3')", lead: 39 + 40, at: [0, 0.3, 0.6, 0.9, 1.2, 1.6, 2.0, 2.4] },
    { name: 'winner', go: "__quackshotDemo.force('winner')", lead: 2, at: [0, 0.4, 0.8, 1.3, 2.0, 3.0, 4.0, 5.0] },
    { name: 'draw', go: "__quackshotDemo.force('draw')", lead: 2, at: [0, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0] },
];

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const host = await startHost();
    const b = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
    const logs = [];
    const clip = fs.mkdtempSync(path.join(OUT, 'f-')); let cf = 0;
    for (const M of MOMENTS) {
        if (ONLY && !M.name.includes(ONLY)) continue;
        const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 } });
        await ctx.addInitScript(() => { let s = 0x9e3779b9; Math.random = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => logs.push(`${M.name} PAGEERROR ${e.message}`));
        page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`${M.name} ${m.type()} ${m.text()}`); });
        const T0 = new Date('2026-11-18T20:00:00Z').getTime();
        await page.clock.install({ time: T0 }); await page.clock.pauseAt(T0 + 1000);
        await page.goto(host.base + '/games/quackshot-3d.html?capture=1&dpr=1&demo=1&players=4&seed=5');
        for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__quackshot && window.__quackshotDemo))); i++) await new Promise((r) => setTimeout(r, 100));
        const step = async (n) => { for (let i = 0; i < n; i++) { await page.clock.runFor(1000 / 60); await page.evaluate(() => __quackshot.step(1, 1 / 60)); } };
        await step(30);
        await page.evaluate(() => { const d = __quackshotDemo; d.set(0, { score: 6, bullseyes: 2 }); d.set(1, { score: -2, bullseyes: 0 }); d.set(2, { score: 9, bullseyes: 3 }); d.set(3, { score: 3, bullseyes: 1 }); });
        await page.evaluate(M.go); await step(M.lead);
        const dir = path.join(OUT, M.name); fs.mkdirSync(dir, { recursive: true });
        let t = 0;
        for (let k = 0; k < M.at.length; k++) {
            const target = Math.round(M.at[k] * 60);
            // render the clip frames on the way (every frame), so the clip shows the whole moment in real time
            while (t < target) { await step(1); t++; await page.screenshot({ path: `${clip}/${String(cf++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 85 }); }
            await page.screenshot({ path: `${dir}/${k}-${M.at[k].toFixed(2)}s.jpg`, type: 'jpeg', quality: 92 });
        }
        await ctx.close();
        execFileSync('python3', ['-c', `
import sys,glob
from PIL import Image, ImageDraw
fs=sorted(glob.glob(sys.argv[1]+'/*.jpg'),key=lambda f:int(f.split('/')[-1].split('-')[0]))
S=Image.new('RGB',(4*480,2*270+40),(20,20,24));d=ImageDraw.Draw(S);d.text((12,12),sys.argv[2],fill=(255,255,255))
for i,f in enumerate(fs):
  im=Image.open(f).convert('RGB').resize((480,270));ImageDraw.Draw(im).text((8,250),f.split('/')[-1][:-4].split('-',1)[1],fill=(255,255,0));S.paste(im,((i%4)*480,40+(i//4)*270))
S.save(sys.argv[3],quality=88)`, dir, M.name, `${OUT}/${M.name}.jpg`]);
    }
    if (cf > 0) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '60', '-i', `${clip}/%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', `${OUT}/${ONLY ? 'moments-' + ONLY : 'moments'}.mp4`]);
    fs.rmSync(clip, { recursive: true });
    await b.close(); await host.stop();
    console.log(logs.slice(0, 20).join('\n') || 'no console errors');
})().catch((e) => { console.error(e); process.exit(1); });
