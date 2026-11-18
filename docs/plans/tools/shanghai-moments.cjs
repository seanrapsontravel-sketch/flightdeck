// Shanghai Milestone 3 set pieces — ONE command: one strip of 8 frames per moment across its window (fixed-step,
// seeded), and moments.mp4 (every moment in real time, 30 fps). Moments: a single, a treble (firecrackers), a dart that
// scores nothing (dust), the round crane (tier lights), intermission (the scroll unrolls), a Shanghai, the champion
// (every lantern rises, fireworks), a tie.
// usage: node docs/plans/tools/shanghai-moments.cjs [outDir=docs/plans/shanghai-lookdev/m3] [only]
const { session, R } = require('./shanghai-cap.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const OUT = path.resolve(process.argv[2] || R + 'docs/plans/shanghai-lookdev/m3');
const ONLY = process.argv[3] || '';

// name, query, setup (runs at frame 20), the event to wait for, frames after it to start, frames to cover
const MOMENTS = [
    ['1-single', 'players=6&long=1', "__shanghaiDemo.table(3);__shanghaiDemo.queue(['single']);__shanghaiDemo.jump(3)", 'throw', 0, 150],
    ['2-treble', 'players=6&long=1', "__shanghaiDemo.table(6);__shanghaiDemo.queue(['treble']);__shanghaiDemo.jump(6)", 'throw', 0, 170],
    ['3-treble-master', 'players=6&long=1&shot=master', "__shanghaiDemo.table(6);__shanghaiDemo.queue(['treble']);__shanghaiDemo.jump(6)", 'throw', 0, 190],
    ['4-nothing', 'players=6&long=1', "__shanghaiDemo.table(4);__shanghaiDemo.queue(['other']);__shanghaiDemo.jump(4)", 'throw', 0, 80],
    ['5-round-crane', 'players=4&long=1', "__shanghaiDemo.table(4);__shanghaiDemo.jump(4);__shanghaiDemo.force('round')", 'title', 0, 175],
    ['6-intermission', 'players=4&long=1', "__shanghaiDemo.table(3);__shanghaiDemo.jump(3);__shanghaiDemo.force('dart3')", 'title', -10, 140],
    ['7-shanghai', 'players=6&long=1', "__shanghaiDemo.table(5);__shanghaiDemo.jump(5);__shanghaiDemo.force('shanghai')", 'impact', 0, 330],
    ['8-champion', 'players=6&long=1', "__shanghaiDemo.table(8);__shanghaiDemo.jump(8);__shanghaiDemo.pause();setTimeout(()=>__shanghaiDemo.force('winner'),800)", 'title', 0, 300],
    ['9-tied', 'players=4&long=1', "__shanghaiDemo.table(8);__shanghaiDemo.jump(8);__shanghaiDemo.pause();setTimeout(()=>__shanghaiDemo.force('draw'),800)", 'title', 0, 180],
];

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const S = await S0();
    async function S0() { return session(); }
    const clip = fs.mkdtempSync(path.join(OUT, 'f-')); let cf = 0;
    for (const [name, q, setup, ev, off, n] of MOMENTS) {
        if (ONLY && !name.includes(ONLY)) continue;
        const { ctx, page, step, until, demo } = await S.open(q);
        await step(20); await demo(`(()=>{${setup}})()`);
        await until(ev, Math.max(0, off));
        const strip = fs.mkdtempSync(path.join(OUT, 's-'));
        for (let i = 0; i < n; i++) {
            if (i % 2 === 0) await page.screenshot({ path: `${clip}/${String(cf++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 85 });
            if (i % Math.floor(n / 8) === 0 && i / Math.floor(n / 8) < 8) await page.screenshot({ path: `${strip}/${String(i).padStart(4, '0')}.png` });
            await step(1);
        }
        execFileSync('python3', ['-c', `
import glob,sys
from PIL import Image, ImageDraw, ImageFont
fs=sorted(glob.glob(sys.argv[1]+'/*.png'))[:8];W,H=480,270
S=Image.new('RGB',(W*4,H*2+44),(20,20,24));d=ImageDraw.Draw(S)
try: F=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',26)
except OSError: F=ImageFont.load_default()
d.text((14,8),sys.argv[2],font=F,fill=(255,255,255))
for i,f in enumerate(fs): S.paste(Image.open(f).convert('RGB').resize((W,H)),((i%4)*W,44+(i//4)*H))
S.save(sys.argv[3],quality=86)`, strip, name + ` — ${(n / 60).toFixed(1)} s from the ${ev}`, `${OUT}/${name}.jpg`]);
        fs.rmSync(strip, { recursive: true });
        await ctx.close();
    }
    await S.close();
    if (!ONLY) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', `${clip}/%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', `${OUT}/moments.mp4`]);
    fs.rmSync(clip, { recursive: true });
    console.log(S.logs.slice(0, 20).join('\n') || 'no console errors');
})().catch((e) => { console.error(e); process.exit(1); });
