// Thumbnails for the demo menu (public/demos.html): each 3D game's ?demo=1 sim, real time, no intro,
// screenshotted at a few moments. usage: node docs/plans/tools/demo-thumbs.cjs [only] [--pick game=N,...]
// Writes candidates to scratch dir (DEMO_THUMBS_RAW or os.tmpdir) and the chosen one to public/assets/demos/<game>.jpg.
const R = require('path').resolve(__dirname, '../../..') + '/';
const { chromium } = require(R + 'node_modules/playwright');
const { startHost } = require(R + 'tests/helpers.cjs');
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const OUT = R + 'public/assets/demos';
const RAW = process.env.DEMO_THUMBS_RAW || path.join(os.tmpdir(), 'demo-thumbs');
const ONLY = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : '';
const PICK = Object.fromEntries(((process.argv.find((a) => a.startsWith('--pick=')) || '').slice(7) || '').split(',').filter(Boolean).map((s) => s.split('=')).map(([k, v]) => [k, Number(v)]));
const SHOTS = [8, 14, 20, 26]; // seconds after load (2026-11-18 picks: derby=3,demolition=1,limbo=2,killer=3,quackshot=0,shanghai=3,millionpound=0,zerohour=1)
const GAMES = [['derby', 'derby.html'], ['demolition', 'demolition.html'], ['limbo', 'limbo.html'], ['killer', 'killer.html'],
    ['quackshot', 'quackshot-3d.html'], ['shanghai', 'shanghai-3d.html'], ['millionpound', 'millionpound.html'], ['zerohour', 'zerohour.html']];
(async () => {
    fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(RAW, { recursive: true });
    const host = await startHost();
    const b = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
    const logs = [];
    for (const [name, file] of GAMES) {
        if (ONLY && !name.includes(ONLY)) continue;
        const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => logs.push(`${name} PAGEERROR ${e.message}`));
        page.on('console', (m) => { if (m.type() === 'error') logs.push(`${name} error ${m.text()}`); });
        await page.goto(`${host.base}/games/${file}?demo=1&players=4&seed=3&intro=0&dpr=1`);
        let t = 0;
        for (let i = 0; i < SHOTS.length; i++) {
            await page.waitForTimeout((SHOTS[i] - t) * 1000); t = SHOTS[i];
            await page.screenshot({ path: `${RAW}/${name}-${i}.png` });
        }
        await ctx.close();
        console.log('captured', name);
    }
    await b.close(); await host.stop();
    // chosen frame (default: index 2) → 960×540 jpg
    for (const [name] of GAMES) {
        if (ONLY && !name.includes(ONLY)) continue;
        const src = `${RAW}/${name}-${PICK[name] ?? 2}.png`;
        execFileSync('python3', ['-c', 'import sys\nfrom PIL import Image\nImage.open(sys.argv[1]).convert("RGB").resize((960,540),Image.LANCZOS).save(sys.argv[2],quality=84)', src, `${OUT}/${name}.jpg`]);
    }
    console.log('raw frames in', RAW);
    console.log(logs.slice(0, 20).join('\n') || 'no console errors');
})().catch((e) => { console.error(e); process.exit(1); });
