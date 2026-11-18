// Shared by the Shanghai review tools (shanghai-look.cjs M2, shanghai-moments.cjs M3): a seeded, fixed-step page.
// Math.random is seeded, the clock is fake (the ?demo=1 simulator's timers advance with the frames), and frames are
// stepped at 60 fps through window.__shanghai.step — so every render is the same every run.
const R = require('path').resolve(__dirname, '../../..') + '/';
const { chromium } = require(R + 'node_modules/playwright');
const { startHost } = require(R + 'tests/helpers.cjs');

async function session() {
    const host = await startHost();
    const b = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
    const logs = [];
    async function open(q) {
        const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 } });
        await ctx.addInitScript(() => { let s = 0x9e3779b9; Math.random = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
        page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ' ' + m.text()); });
        const T0 = new Date('2026-11-18T20:00:00Z').getTime();
        await page.clock.install({ time: T0 }); await page.clock.pauseAt(T0 + 1000);
        await page.goto(host.base + '/games/shanghai-3d.html?capture=1&dpr=1&demo=1&intro=0&seed=5&' + q);
        for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__shanghai && window.__shanghaiDemo))); i++) await new Promise((r) => setTimeout(r, 100));
        const step = async (n) => { for (let i = 0; i < n; i++) { await page.clock.runFor(1000 / 60); await page.evaluate(() => __shanghai.step(1, 1 / 60)); } };
        /** step until the game's log shows event `e` (after the current seq), then `extra` more frames */
        const until = async (e, extra = 0, max = 900) => {
            const n0 = await page.evaluate(() => __shanghai.game.seq);
            for (let i = 0; i < max; i++) { await step(1); if (await page.evaluate(([e, n0]) => __shanghai.game.log.some((x) => x.n > n0 && x.e === e), [e, n0])) break; }
            await step(extra);
        };
        const demo = (js) => page.evaluate(js);
        return { ctx, page, step, until, demo };
    }
    return { open, logs, close: async () => { await b.close(); await host.stop(); } };
}
module.exports = { session, R };
