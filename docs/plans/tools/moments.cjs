// usage: GLOBAL=__killer DEMO=__killerDemo [PRE='js'] [WARM=frames] node moments.cjs <outdir> <page> <query> <kind,kind,...> [frameOffsets]
// Moment review for a 3D game with a ?demo=1 simulator: for each kind, a fresh seeded page (fake clock, fixed step),
// warm up, demo.force(kind), then frames at the given offsets (60 fps frames after the force) tiled into
// <outdir>/<kind>.jpg (and the frames as <kind>-<n>.png). Also prints the game's truth() at the end of each.
const R = '/Users/seanrapson/flightdeck-fork/';
const { chromium } = require(R + 'node_modules/playwright');
const { startHost } = require(R + 'tests/helpers.cjs');
const fs = require('fs'), { execFileSync } = require('child_process');

(async () => {
    const [OUT, pageP, q, kinds, offs = '20,50,80,120,160,200,260,330'] = process.argv.slice(2);
    const G = process.env.GLOBAL || '__killer', DEMO = process.env.DEMO || '__killerDemo', WARM = Number(process.env.WARM || 240);
    const offsets = offs.split(',').map(Number);
    fs.mkdirSync(OUT, { recursive: true });
    const host = await startHost();
    const b = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
    for (const kind of kinds.split(',')) {
        const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } });
        await ctx.addInitScript(() => { let s = 0x9e3779b9; Math.random = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
        const page = await ctx.newPage();
        const logs = [];
        page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
        page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ' ' + m.text()); });
        const T0 = new Date('2026-11-18T12:00:00Z').getTime();
        await page.clock.install({ time: T0 }); await page.clock.pauseAt(T0 + 1000);
        await page.goto(host.base + '/' + pageP + '?' + q);
        for (let i = 0; i < 300 && !(await page.evaluate(([g, d]) => !!(window[g] && window[d]), [G, DEMO])); i++) await new Promise((r) => setTimeout(r, 100));
        const step = async (n) => { for (let i = 0; i < n; i++) { await page.clock.runFor(1000 / 60); await page.evaluate((g) => window[g].step(1, 1 / 60), G); } };
        await step(WARM);
        // PRE: optional JS run before the force (e.g. jump the round: __killerDemo.set(0, { round: 9 }))
        if (process.env.PRE) { await page.evaluate(process.env.PRE); await step(30); }
        await page.evaluate(([d, k]) => window[d].force(k), [DEMO, kind]);
        let f = 0; const files = [];
        for (const o of offsets) {
            await step(o - f); f = o;
            const file = `${OUT}/${kind}-${String(o).padStart(4, '0')}.png`;
            await page.screenshot({ path: file }); files.push(file);
        }
        const cols = Math.min(4, files.length), rows = Math.ceil(files.length / cols);
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...files.flatMap((x) => ['-i', x]), '-filter_complex',
            files.map((_, i) => `[${i}:v]scale=640:360[v${i}]`).join(';') + ';' + files.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${files.length}:layout=` +
            files.map((_, i) => `${(i % cols) * 640}_${Math.floor(i / cols) * 360}`).join('|') + (files.length < cols * rows ? ':fill=black' : ''), '-frames:v', '1', `${OUT}/${kind}.jpg`]);
        const truth = await page.evaluate((g) => window[g].truth && window[g].truth(), G);
        console.log(kind, JSON.stringify(truth));
        if (logs.length) console.log('  LOGS: ' + logs.slice(0, 10).join('\n  '));
        await ctx.close();
    }
    await b.close(); await host.stop();
})().catch((e) => { console.error(e); process.exit(1); });
