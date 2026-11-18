const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const {startHost}=require('../helpers.cjs');
let host;
// the TV renders WebGL: give the browser the GPU
test.use({launchOptions:{args:['--enable-gpu','--use-angle=metal','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']}});
test.beforeAll(async()=>{host=await startHost();});
test.afterAll(async()=>{if(host){await host.stop();fs.rmSync(host.dataDir,{recursive:true,force:true});}});

// docs/plans/GAME-INTROS-3D.md: every 3D game opens on its "How to play" explainer (how it works, how to score, how
// to win), holds the demo while it's up, and gets out of the way the moment the first dart lands.
const GAMES=[['Quackshot','quackshot-3d.html','__quackshotDemo'],['Killer','killer.html','__killerDemo'],['Limbo','limbo.html','__limboDemo'],['Derby','derby.html','__derbyDemo'],['Demolition','demolition-3d.html','__demolitionDemo']];
for(const [title,file,demo] of GAMES){
    test(`${title}: the How to play explainer opens the game and leaves on the first dart`,async({page})=>{
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.setViewportSize({width:1920,height:1080});
        await page.goto(`${host.base}/games/${file}?demo=1&players=3&seed=2&dpr=1`);
        const intro=page.locator('.kit-intro');
        await expect(intro).toHaveClass(/is-on/,{timeout:40000});
        await expect(page.locator('.kit-intro-title')).toHaveText(title);
        await expect(page.locator('.kit-intro-dots i')).toHaveCount(3);
        await expect(page.locator('.kit-intro-board svg')).toHaveCount(1);
        await expect(page.locator('.kit-intro-first')).toContainText('FIRST UP');
        expect(await page.evaluate(()=>document.body.classList.contains('kit-intro-on'))).toBe(true);
        // the demo waits for the explainer: still up a few seconds later (no dart thrown)
        await page.waitForTimeout(3500);
        await expect(intro).toHaveClass(/is-on/);
        // let the demo throw: the explainer leaves with the first dart, and the game's HUD is back
        await page.evaluate(d=>window[d].resume(),demo);
        await expect(intro).not.toHaveClass(/is-on/,{timeout:15000});
        expect(await page.evaluate(()=>document.body.classList.contains('kit-intro-on'))).toBe(false);
        expect(errors).toEqual([]);
    });
}
