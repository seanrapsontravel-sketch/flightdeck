// Million Pound Oche review renders — ONE command. The master at 1 / 4 / 6 players (long names), then each moment of
// a simulated game (?demo=1, seeded, real time): a question live, the lock-in, a right answer, a wrong answer, a
// bull (free pass), UP NEXT, the round crane, the million question and answer, the champion, a shared win, and the
// How to play explainer. Writes PNGs and contact.jpg, and prints console errors.
// usage: node docs/plans/tools/millionpound-look.cjs [outDir=docs/plans/millionpound-lookdev/look] [only=name,...]
const R = require('path').resolve(__dirname, '../../..') + '/';
const { chromium } = require(R + 'node_modules/playwright');
const { startHost } = require(R + 'tests/helpers.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const OUT = path.resolve(process.argv[2] || R + 'docs/plans/millionpound-lookdev/look');
const ONLY = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const host = await startHost();
    const b = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
    const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage(); const logs = [];
    page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') logs.push('error ' + m.text()); });
    const open = async (q) => { await page.goto(host.base + '/games/millionpound.html?demo=1&dpr=1&seed=3&' + q); await page.waitForFunction(() => window.__millionpound && window.__millionpound.game.gd && window.__millionpoundDemo, null, { timeout: 60000 }); };
    const shot = async (n) => { if (!ONLY || ONLY.has(n)) await page.screenshot({ path: `${OUT}/${n}.png` }); };
    const wait = (ms) => page.waitForTimeout(ms);
    const demo = (js, a) => page.evaluate(js, a);
    const until = (fn, ms = 20000, arg = null) => page.waitForFunction(fn, arg, { timeout: ms, polling: 50 });

    // 1 the masters, nothing moving (the first question's answers fully up)
    for (const n of [1, 4, 6]) { await open(`players=${n}&long=1&intro=0`); await demo(() => __millionpoundDemo.pause()); await wait(2600); await shot(`1-master-${n}p`); }
    // 2 a game's moments (4 players)
    const phaseIs = (t) => until((t) => __millionpound.game.gd.phase.type === t, 20000, t);
    const key = (which, treble = false) => demo(([w, t]) => { const k = __millionpound.game.gd.question.correctKey; __millionpoundDemo.key(w === 'right' ? k : w === 'wrong' ? (k === 'A' ? 'B' : 'A') : w, t); }, [which, treble]);
    const RIGHT = 'right', WRONG = 'wrong';
    const at = (t, round, ms = 30000) => until(([t, r]) => __millionpound.game.gd.phase.type === t && __millionpound.game.gd.currentRound === r, ms, [t, round]);
    await open('players=4&intro=0'); await demo(() => __millionpoundDemo.pause());
    await wait(2600);
    await key(RIGHT); await wait(700); await shot('2-locked-in');
    await phaseIs('reveal'); await wait(900); await shot('3-right');
    await phaseIs('playing'); await wait(2400);
    await key(RIGHT, true); await wait(700); await shot('4-treble-locked');
    await phaseIs('reveal'); await wait(700); await shot('5-treble-right');
    await phaseIs('playing'); await wait(2400);
    await key(WRONG, true); await phaseIs('reveal'); await wait(900); await shot('6-wrong-treble');
    await phaseIs('intermission'); await wait(1100); await shot('7-up-next');
    await phaseIs('playing'); await wait(2400);
    await key('X'); await wait(700); await shot('8-bull-free-pass');
    // through to visit 3 (3-number zones) and the final visit (2)
    await demo(() => __millionpoundDemo.queue(Array(40).fill('right')));
    await demo(() => __millionpoundDemo.resume());
    await at('round_announce', 3, 240000); await wait(1200); await shot('9-visit3-banner');
    await at('playing', 3); await demo(() => __millionpoundDemo.pause()); await wait(2600); await shot('10-visit3-question');
    await key('X'); await phaseIs('reveal'); await wait(700); await shot('11-bull-already-used');
    // the million
    await demo(() => __millionpoundDemo.force('million'));
    await until(() => __millionpound.game.gd.phase.type === 'playing' && __millionpound.game.gd.question.number === 15); await wait(1500); await shot('12-final-visit-stakes');
    await phaseIs('locked'); await wait(2800); await shot('13-million-locked');
    await phaseIs('reveal'); await wait(1300); await shot('14-million-won');
    // the end: a winner, and sudden death
    await open('players=5&intro=0'); await demo(() => __millionpoundDemo.force('winner')); await wait(2600); await shot('15-champion');
    await open('players=3&intro=0'); await demo(() => __millionpoundDemo.force('sudden')); await wait(1300); await shot('16-sudden-death-banner');
    await phaseIs('playing'); await wait(2400); await shot('17-sudden-death-question');
    // the explainer
    await open('players=4&intro=1'); await wait(3000); await shot('18-intro-1'); await wait(7400); await shot('19-intro-2');
    const truth = await demo(() => __millionpound.truth());
    await ctx.close(); await b.close(); await host.stop();
    execFileSync('python3', ['-c', `
import glob,os
from PIL import Image, ImageDraw, ImageFont
fs=sorted(glob.glob(os.path.join(${JSON.stringify(OUT)},'*.png')),key=lambda f:int(os.path.basename(f).split('-')[0]))
W,H=640,360;S=Image.new('RGB',(W*3,H*((len(fs)+2)//3)),(20,20,24))
try: F=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',20)
except OSError: F=ImageFont.load_default()
for i,f in enumerate(fs):
    im=Image.open(f).convert('RGB').resize((W,H));d=ImageDraw.Draw(im);t=os.path.basename(f)[:-4];d.text((11,H-29),t,font=F,fill=(0,0,0));d.text((10,H-30),t,font=F,fill=(255,255,255))
    S.paste(im,((i%3)*W,(i//3)*H))
S.save(os.path.join(${JSON.stringify(OUT)},'contact.jpg'),quality=86)
`], { stdio: 'inherit' });
    console.log('truth (last page):', JSON.stringify({ q: truth.question && truth.question.id, chips: truth.chips.length }));
    console.log(logs.slice(0, 20).join('\n') || 'no console errors');
})().catch((e) => { console.error(e); process.exit(1); });
