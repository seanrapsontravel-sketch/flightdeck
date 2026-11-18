const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const {startHost}=require('../helpers.cjs');
let host;
test.use({viewport:{width:1920,height:1080},launchOptions:{args:['--enable-gpu','--use-angle=metal','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']}});
test.beforeAll(async()=>{host=await startHost();});
test.afterAll(async()=>{if(host){await host.stop();fs.rmSync(host.dataDir,{recursive:true,force:true});}});

// The demo arcade (public/demos.html): keyboard picks a game, Enter opens its ?demo=1 sim in a full-screen frame,
// keys pressed while the game has focus (Esc, ]) still reach the menu, and every listed game page exists.
test('Demo arcade lists every 3D game and drives the demos from the keyboard',async({page,request})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(host.base+'/demos.html');
    const cards=page.locator('.card');
    await expect(cards).toHaveCount(8);
    for(const f of ['derby','demolition','limbo','killer','quackshot-3d','shanghai-3d','millionpound','zerohour']){
        expect((await request.get(`${host.base}/games/${f}.html`)).status(),f).toBe(200);
    }
    await expect(cards.nth(0)).toHaveClass(/is-sel/);
    await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowDown');
    await expect(cards.nth(5)).toHaveClass(/is-sel/);                       // Shanghai
    await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowLeft');
    await expect(cards.nth(7)).toHaveClass(/is-sel/);                       // wraps 0 → Zero Hour
    await page.keyboard.press('ArrowUp');await expect(cards.nth(3)).toHaveClass(/is-sel/);   // Killer
    await page.keyboard.press('ArrowRight');                                 // Quackshot
    await page.keyboard.press('=');await page.keyboard.press('-');await page.keyboard.press('-');
    await expect(page.locator('#o-players')).toHaveText('3');
    await page.keyboard.press('i');await expect(page.locator('#o-intro')).toHaveText('off');
    await page.keyboard.press('Enter');
    const frame=page.locator('#stage iframe');
    await expect(frame).toHaveAttribute('src',/\/games\/quackshot-3d\.html\?demo=1&players=3&seed=\d+&intro=0/);
    await expect(frame).toHaveClass(/is-loaded/,{timeout:30000});
    await expect(page).toHaveURL(/#quackshot$/);
    await page.waitForFunction(()=>!!document.querySelector('#stage iframe').contentWindow.__quackshot,null,{timeout:30000});
    await page.waitForTimeout(1500);
    // keys inside the game frame still reach the menu
    await frame.focus();
    await page.keyboard.press(']');
    await expect(frame).toHaveAttribute('src',/\/games\/shanghai-3d\.html\?/);
    await expect(page).toHaveURL(/#shanghai$/);
    await expect(frame).toHaveClass(/is-loaded/,{timeout:30000});
    await page.keyboard.press('Escape');
    await expect(page.locator('#stage')).not.toHaveClass(/is-on/);
    await expect(page.locator('#stage iframe')).toHaveCount(0);
    await expect(page).not.toHaveURL(/#/);
    await expect(cards.nth(5)).toHaveClass(/is-sel/);
    // number keys jump straight in; browser Back returns to the menu
    await page.keyboard.press('i');await expect(page.locator('#o-intro')).toHaveText('on');
    await page.keyboard.press('3');
    await expect(frame).toHaveAttribute('src',/\/games\/limbo\.html\?/);
    expect(await frame.getAttribute('src')).not.toContain('intro=');       // ?intro=1 would pin the explainer up forever
    await page.goBack();
    await expect(page.locator('#stage iframe')).toHaveCount(0);
    // deep link
    await page.goto(host.base+'/demos.html#zerohour');
    await expect(frame).toHaveAttribute('src',/\/games\/zerohour\.html\?/);
    // with the intro on, the explainer leaves once the demo's first dart lands
    await page.goto(host.base+'/demos.html#derby');
    await expect(frame).toHaveClass(/is-loaded/,{timeout:30000});
    const game=page.frameLocator('#stage iframe');
    await expect(game.locator('.kit-intro')).toHaveClass(/is-on/,{timeout:30000});
    await expect(game.locator('.kit-intro')).not.toHaveClass(/is-on/,{timeout:90000});
    expect(errors).toEqual([]);
});
