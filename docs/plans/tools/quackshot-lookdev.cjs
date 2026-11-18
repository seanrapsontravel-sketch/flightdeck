// Quackshot look-dev deliverables — ONE command renders every still, 1:1 crop, silhouette, reference overlay and
// contact sheet (plan §1 rule 7). Milestone 0 = the ducks + one rough target still.
// usage: node docs/plans/tools/quackshot-lookdev.cjs [outDir=docs/plans/quackshot-lookdev/m0] [filter-substring]
const R = require('path').resolve(__dirname, '../../..') + '/';
const { chromium } = require(R + 'node_modules/playwright');
const { startHost } = require(R + 'tests/helpers.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const OUT = path.resolve(process.argv[2] || R + 'docs/plans/quackshot-lookdev/m0');
const ONLY = process.argv[3] || '';
const VIEWS = ['front', 'side', '34', 'back', 'top'];

(async () => {
    fs.mkdirSync(OUT + '/stills', { recursive: true });
    const host = await startHost();
    const b = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
    const logs = [];
    const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ' ' + m.text()); });
    await page.goto(host.base + '/games/quackshot-3d.html?capture=1&dpr=1&lookdev=duck&variant=A&view=side');
    await page.waitForFunction(() => window.__ld && window.__ld.ready, null, { timeout: 120000 });
    const jobs = [];
    for (const v of ['A', 'B', 'C']) {
        for (const light of ['studio', 'blue', 'sil']) for (const view of VIEWS) jobs.push([`duck-${v}-${light}-${view}`, { subject: 'duck', variant: v, view, light }]);
        jobs.push([`duck-${v}-studio-head`, { subject: 'duck', variant: v, view: 'head', light: 'studio' }]);
        jobs.push([`duck-${v}-blue-head`, { subject: 'duck', variant: v, view: 'head', light: 'blue' }]);
        jobs.push([`duck-${v}-blue-far`, { subject: 'duck', variant: v, view: 'far', light: 'blue', lod: 1 }]);
        jobs.push([`duck-${v}-blue-farlod2`, { subject: 'duck', variant: v, view: 'far', light: 'blue', lod: 2 }]);
    }
    jobs.push(['lineup-studio-side', { subject: 'lineup', view: 'side', light: 'studio' }]);
    jobs.push(['lineup-sil-side', { subject: 'lineup', view: 'side', light: 'sil' }]);
    jobs.push(['lineup-studio-34', { subject: 'lineup', view: '34', light: 'studio' }]);
    for (const light of ['studio', 'blue']) for (const view of ['side', '34']) jobs.push([`tin-${light}-${view}`, { subject: 'tin', view, light }]);
    jobs.push(['tin-sil-side', { subject: 'tin', view: 'side', light: 'sil' }]);
    for (const v of ['A', 'B', 'C']) jobs.push([`target-concept-${v}`, { subject: 'target', variant: v }]);
    jobs.push(['target-bull-A', { subject: 'target', variant: 'A', view: 'bull' }]);
    jobs.push(['target-fire-A', { subject: 'target', variant: 'A', fire: true }]);
    for (const [name, o] of jobs) {
        if (ONLY && !name.includes(ONLY)) continue;
        await page.evaluate((o) => window.__ld.show(o), o);
        await page.screenshot({ path: `${OUT}/stills/${name}.png` });
    }
    await ctx.close(); await b.close(); await host.stop();
    if (!ONLY) execFileSync('python3', [R + 'docs/plans/tools/quackshot-sheets.py', OUT, R + 'docs/plans/quackshot-lookdev/reference'], { stdio: 'inherit' });
    console.log(logs.slice(0, 20).join('\n') || 'no console errors');
})().catch((e) => { console.error(e); process.exit(1); });
