// Shanghai look-dev deliverables — ONE command renders every still, 1:1 close-up, silhouette, reference overlay and
// contact sheet (plan §1 rule 7). Milestone 0 = the pagoda (3 variants) + the moon-gate board + one sky lantern,
// plus a rough courtyard concept at round 1 and round 8. Seeded, fixed (no animation clock).
// usage: node docs/plans/tools/shanghai-lookdev.cjs [outDir=docs/plans/shanghai-lookdev/m0] [filter-substring]
const R = require('path').resolve(__dirname, '../../..') + '/';
const { chromium } = require(R + 'node_modules/playwright');
const { startHost } = require(R + 'tests/helpers.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const OUT = path.resolve(process.argv[2] || R + 'docs/plans/shanghai-lookdev/m0');
const ONLY = process.argv[3] || '';
const VIEWS = ['front', 'corner', '34', 'low', 'top'];
const LIGHTS = ['studio', 'sunset', 'night', 'sil'];

(async () => {
    fs.mkdirSync(OUT + '/stills', { recursive: true });
    const host = await startHost();
    const b = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
    const logs = [];
    const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ' ' + m.text()); });
    await page.goto(host.base + '/games/shanghai-3d.html?capture=1&dpr=1&lookdev=pagoda&light=studio');
    await page.waitForFunction(() => window.__ld && window.__ld.ready, null, { timeout: 120000 });
    const jobs = [];
    for (const v of ['A', 'B', 'C']) {
        for (const light of LIGHTS) for (const view of VIEWS) jobs.push([`pagoda-${v}-${light}-${view}`, { subject: 'pagoda', variant: v, view, light }]);
        jobs.push([`pagoda-${v}-studio-eave`, { subject: 'pagoda', variant: v, view: 'eave', light: 'studio' }]);
        jobs.push([`pagoda-${v}-sunset-eave`, { subject: 'pagoda', variant: v, view: 'eave', light: 'sunset' }]);
        jobs.push([`pagoda-${v}-night-eave`, { subject: 'pagoda', variant: v, view: 'eave', light: 'night', lit: 8 }]);
        jobs.push([`pagoda-${v}-sunset-far`, { subject: 'pagoda', variant: v, view: 'far', light: 'sunset', lit: 1 }]);
        jobs.push([`pagoda-${v}-night-far`, { subject: 'pagoda', variant: v, view: 'far', light: 'night', lit: 5 }]);
    }
    jobs.push(['lineup-studio-front', { subject: 'lineup', view: 'front', light: 'studio' }]);
    jobs.push(['lineup-sil-front', { subject: 'lineup', view: 'front', light: 'sil' }]);
    jobs.push(['lineup-sunset-corner', { subject: 'lineup', view: 'corner', light: 'sunset' }]);
    jobs.push(['lineup-night-front', { subject: 'lineup', view: 'front', light: 'night', lit: 4 }]);
    for (const light of ['studio', 'sunset', 'night']) jobs.push([`gate-${light}-front`, { subject: 'gate', view: 'front', light, target: light === 'night' ? 8 : 20 }]);
    jobs.push(['gate-sunset-34', { subject: 'gate', view: '34', light: 'sunset', target: 20 }]);
    jobs.push(['gate-sil-front', { subject: 'gate', view: 'front', light: 'sil' }]);
    jobs.push(['gate-sunset-wedge', { subject: 'gate', view: 'wedge', light: 'sunset', target: 20 }]);
    jobs.push(['gate-night-wedge', { subject: 'gate', view: 'wedge', light: 'night', target: 20 }]);
    jobs.push(['gate-sunset-gong', { subject: 'gate', view: 'gong', light: 'sunset', target: 20 }]);
    jobs.push(['gate-studio-gong', { subject: 'gate', view: 'gong', light: 'studio', target: 20 }]);
    jobs.push(['lantern-night-hero', { subject: 'lantern', light: 'night' }]);
    jobs.push(['lantern-sunset-hero', { subject: 'lantern', light: 'sunset' }]);
    jobs.push(['lantern-night-colours', { subject: 'lantern', view: 'colours', light: 'night' }]);
    jobs.push(['lantern-night-flock', { subject: 'lantern', view: 'flock', light: 'night' }]);
    jobs.push(['lantern-sil-hero', { subject: 'lantern', light: 'sil' }]);
    for (const round of [1, 4, 8]) jobs.push([`concept-round${round}`, { subject: 'concept', round }]);
    const stats = {};
    for (const [name, o] of jobs) {
        if (ONLY && !name.includes(ONLY)) continue;
        await page.evaluate((o) => window.__ld.show(o), o);
        await page.screenshot({ path: `${OUT}/stills/${name}.png` });
        if (name.endsWith('-sil-front') && name.startsWith('pagoda')) stats[name] = await page.evaluate(() => window.__ld.stats().triangles);
    }
    await ctx.close(); await b.close(); await host.stop();
    if (!ONLY) execFileSync('python3', [R + 'docs/plans/tools/shanghai-sheets.py', OUT, R + 'docs/plans/shanghai-lookdev/reference'], { stdio: 'inherit' });
    console.log('triangles (whole pagoda, silhouette pass):', JSON.stringify(stats));
    console.log(logs.slice(0, 20).join('\n') || 'no console errors');
})().catch((e) => { console.error(e); process.exit(1); });
