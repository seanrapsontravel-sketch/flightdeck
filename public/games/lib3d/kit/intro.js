// "How to play": the explainer every 3D game opens with (docs/plans/GAME-INTROS-3D.md). View-only: it never changes
// or waits on the state. It cycles its pages over the game's own 3D world until the first dart lands, then gets out
// of the way at once.
//
//   const intro = new Intro(CONTENT);                 // content from the game's own intro.js
//   intro.show({ first: 'Alice', round: { max: 6 } }) // a fresh game: who throws first (textContent)
//   intro.hide()                                      // the first dart, or any non-playing phase
//
// Content: { title, tagline, accent, ink?, pages: [{ eyebrow, title, lines?: [..], board?: BOARD, legend?: [ROW] }] }
//   BOARD: { zones: [ZONE], dim?: true }   ZONE: { beds: ['bull'|'outer_bull'|'single_inner'|'treble'|'single_outer'|
//          'double'|'miss'], numbers?: [n] (default all), color }
//   ROW (a legend line, lit in step with its board zone): { zone: ZONE, label, value, note? }
// ?intro=1 on the page shows it regardless of state (review); ?intro=0 never shows it.
import { RADII, SLICE, WHEEL, wedgeAngle } from './darts.js';
import { el } from './hud.js';

const TAU = Math.PI * 2;
const PAGE_MS = 7200, ROW_MS = 1500;
const Q = new URLSearchParams(location.search);

let styled = false;
function injectStyles() {
    if (styled) return; styled = true;
    const s = document.createElement('style');
    s.textContent = `
.kit-intro{--u:calc(100vh/108);position:fixed;inset:0;z-index:20;pointer-events:none;display:grid;grid-template-columns:1.05fr .95fr;align-items:center;gap:calc(var(--u)*4);padding:calc(var(--u)*7) calc(var(--u)*8) calc(var(--u)*15);
  background:linear-gradient(90deg,rgba(6,8,22,.95) 0%,rgba(6,8,22,.9) 50%,rgba(6,8,22,.55) 100%);color:var(--ki-ink,#f6efe0);font-family:var(--ki-font,"Avenir Next Condensed","DIN Condensed","Roboto Condensed","Arial Narrow",Arial,sans-serif);
  opacity:0;transition:opacity .5s ease;visibility:hidden}
.kit-intro.is-on{opacity:1;visibility:visible}
.kit-intro.is-out{opacity:0;transition:opacity .28s ease}
.kit-intro-head{position:absolute;left:calc(var(--u)*8);top:calc(var(--u)*5);right:calc(var(--u)*8);display:flex;align-items:baseline;gap:calc(var(--u)*3)}
.kit-intro-title{font-weight:900;font-size:calc(var(--u)*9.5);line-height:.9;letter-spacing:.02em;text-transform:uppercase;color:var(--ki-accent);text-shadow:0 calc(var(--u)*.6) 0 rgba(0,0,0,.45)}
.kit-intro-tag{font-weight:700;font-size:calc(var(--u)*2.8);letter-spacing:.08em;text-transform:uppercase;opacity:.85}
.kit-intro-how{position:absolute;right:calc(var(--u)*8);top:calc(var(--u)*6.5);font-weight:800;font-size:calc(var(--u)*2.2);letter-spacing:.4em;opacity:.7}
.kit-intro-page{position:relative;margin-top:calc(var(--u)*8)}
.kit-intro-eyebrow{font-weight:800;font-size:calc(var(--u)*2.4);letter-spacing:.42em;color:var(--ki-accent);margin-bottom:calc(var(--u)*1.2)}
.kit-intro-h{font-weight:900;font-size:calc(var(--u)*6.4);line-height:1;text-transform:uppercase;margin-bottom:calc(var(--u)*2.6)}
.kit-intro-lines{display:grid;gap:calc(var(--u)*1.6)}
.kit-intro-line{font-weight:600;font-size:calc(var(--u)*3.1);line-height:1.2;display:flex;gap:calc(var(--u)*1.4);opacity:0;transform:translateX(calc(var(--u)*-3));transition:opacity .5s ease,transform .5s ease}
.kit-intro-line::before{content:'';flex:none;width:calc(var(--u)*1.3);height:calc(var(--u)*1.3);margin-top:calc(var(--u)*1.1);border-radius:50%;background:var(--ki-accent)}
.kit-intro-page.is-in .kit-intro-line{opacity:1;transform:none}
.kit-intro-legend{display:grid;gap:calc(var(--u)*1.1)}
.kit-intro-row{display:grid;grid-template-columns:calc(var(--u)*2.6) 1fr auto;align-items:center;gap:calc(var(--u)*1.6);padding:calc(var(--u)*.9) calc(var(--u)*1.6);border-radius:calc(var(--u)*.8);background:rgba(255,255,255,.04);transition:background .35s,transform .35s;font-size:calc(var(--u)*2.9)}
.kit-intro-row i{width:calc(var(--u)*2.6);height:calc(var(--u)*2.6);border-radius:calc(var(--u)*.5);background:var(--ki-c)}
.kit-intro-row b{font-weight:800;text-transform:uppercase;letter-spacing:.02em}
.kit-intro-row small{display:block;font-weight:600;font-size:calc(var(--u)*2.1);opacity:.75;text-transform:none}
.kit-intro-row em{font-style:normal;font-weight:900;font-size:calc(var(--u)*4);color:var(--ki-c);min-width:calc(var(--u)*7);text-align:right}
.kit-intro-row.is-lit{background:rgba(255,255,255,.14);transform:scale(1.03)}
.kit-intro-board{justify-self:center;width:min(calc(var(--u)*62),42vw);aspect-ratio:1;filter:drop-shadow(0 calc(var(--u)*2) calc(var(--u)*4) rgba(0,0,0,.6))}
.kit-intro-board svg{width:100%;height:100%;overflow:visible}
.kit-intro-board .z{opacity:.22;transition:opacity .35s ease}
.kit-intro-board .z.is-lit{opacity:1}
.kit-intro-board .z.is-dim{opacity:.6}
/* the game's own HUD steps back while the explainer is up */
body.kit-intro-on [class$="-hud"]{opacity:0!important;transition:opacity .3s}
.kit-intro-foot{position:absolute;left:calc(var(--u)*8);right:calc(var(--u)*8);bottom:calc(var(--u)*4.5);display:flex;align-items:center;gap:calc(var(--u)*3)}
.kit-intro-dots{display:flex;gap:calc(var(--u)*1)}
.kit-intro-dots i{width:calc(var(--u)*5);height:calc(var(--u)*.8);border-radius:calc(var(--u)*.4);background:rgba(255,255,255,.2);overflow:hidden;position:relative}
.kit-intro-dots i.is-on::after{content:'';position:absolute;inset:0;background:var(--ki-accent);transform-origin:left;animation:kitIntroBar var(--ki-ms) linear forwards}
.kit-intro-dots i.is-done{background:var(--ki-accent)}
@keyframes kitIntroBar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.kit-intro-first{font-weight:800;font-size:calc(var(--u)*2.8);letter-spacing:.06em;text-transform:uppercase}
.kit-intro-first span{color:var(--ki-accent)}
.kit-intro-go{margin-left:auto;font-weight:900;font-size:calc(var(--u)*3.4);letter-spacing:.12em;padding:calc(var(--u)*1.1) calc(var(--u)*3);border:calc(var(--u)*.35) solid var(--ki-accent);border-radius:calc(var(--u)*1);color:var(--ki-accent);animation:kitIntroPulse 1.3s ease-in-out infinite alternate}
@keyframes kitIntroPulse{to{transform:scale(1.06);box-shadow:0 0 calc(var(--u)*3) var(--ki-accent)}}
body.capture .kit-intro *{animation-duration:0s!important;transition:none!important}
`;
    document.head.appendChild(s);
}

// ---------------------------------------------------------------- the SVG dartboard
const SCALE = 150 / RADII.doubleOut, C = 200, SURROUND = 186, NUMR = 172;
const BED_R = { bull: [0, RADII.bull], outer_bull: [RADII.bull, RADII.outerBull], single_inner: [RADII.outerBull, RADII.trebleIn], treble: [RADII.trebleIn, RADII.trebleOut], single_outer: [RADII.trebleOut, RADII.doubleIn], double: [RADII.doubleIn, RADII.doubleOut] };
const pt = (r, a) => `${(C + Math.cos(a) * r).toFixed(2)},${(C - Math.sin(a) * r).toFixed(2)}`;
function sector(r0, r1, a0, a1) {
    if (a1 - a0 >= TAU - 1e-6) return r0 <= 0 ? `M${C - r1},${C}a${r1},${r1} 0 1,0 ${2 * r1},0a${r1},${r1} 0 1,0 ${-2 * r1},0Z`
        : `M${C - r1},${C}a${r1},${r1} 0 1,0 ${2 * r1},0a${r1},${r1} 0 1,0 ${-2 * r1},0ZM${C - r0},${C}a${r0},${r0} 0 1,1 ${2 * r0},0a${r0},${r0} 0 1,1 ${-2 * r0},0Z`;
    return `M${pt(r1, a0)}A${r1},${r1} 0 0,0 ${pt(r1, a1)}L${pt(r0, a1)}A${r0},${r0} 0 0,1 ${pt(r0, a0)}Z`;
}
/** the path(s) for a zone: beds × numbers */
function zonePath(zone) {
    let d = '';
    for (const bed of zone.beds) {
        if (bed === 'miss') { d += sector(RADII.doubleOut * SCALE + 1, SURROUND, 0, TAU); continue; }
        const [r0, r1] = BED_R[bed].map((r) => r * SCALE);
        if (bed === 'bull' || bed === 'outer_bull') { d += sector(r0, r1, 0, TAU); continue; }
        for (const n of zone.numbers || WHEEL) { const a = wedgeAngle(n); d += sector(r0, r1, a - SLICE / 2, a + SLICE / 2); }
    }
    return d;
}
function boardSVG(zones) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 400 400');
    const add = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
    add('circle', { cx: C, cy: C, r: SURROUND + 8, fill: '#16120e', stroke: '#c9a24e', 'stroke-width': 4 });
    // the classic board underneath, muted
    WHEEL.forEach((n, i) => {
        const a = wedgeAngle(n), a0 = a - SLICE / 2, a1 = a + SLICE / 2, dark = i % 2 === 0;
        const single = dark ? '#1c1814' : '#4a4436', ring = dark ? '#3a1a18' : '#1c3422';   // muted: the lit zones carry the colour
        add('path', { d: sector(RADII.outerBull * SCALE, RADII.trebleIn * SCALE, a0, a1), fill: single });
        add('path', { d: sector(RADII.trebleIn * SCALE, RADII.trebleOut * SCALE, a0, a1), fill: ring });
        add('path', { d: sector(RADII.trebleOut * SCALE, RADII.doubleIn * SCALE, a0, a1), fill: single });
        add('path', { d: sector(RADII.doubleIn * SCALE, RADII.doubleOut * SCALE, a0, a1), fill: ring });
        const t = add('text', { x: C + Math.cos(a) * NUMR, y: C - Math.sin(a) * NUMR + 6, 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 800, fill: '#e8d9b0', 'font-family': 'Avenir Next Condensed, DIN Condensed, Arial Narrow, sans-serif' });
        t.textContent = String(n);
    });
    add('circle', { cx: C, cy: C, r: RADII.outerBull * SCALE, fill: '#1c3422' });
    add('circle', { cx: C, cy: C, r: RADII.bull * SCALE, fill: '#3a1a18' });
    // the highlight layers, one per zone (glowing)
    const defs = add('defs', {});
    const f = add('filter', { id: 'kitGlow', x: '-20%', y: '-20%', width: '140%', height: '140%' }, defs);
    add('feGaussianBlur', { stdDeviation: 4, result: 'b' }, f);
    const m = add('feMerge', {}, f); add('feMergeNode', { in: 'b' }, m); add('feMergeNode', { in: 'SourceGraphic' }, m);
    const layers = zones.map((z) => add('path', { d: zonePath(z), fill: z.color, class: 'z', filter: 'url(#kitGlow)', 'fill-rule': 'evenodd' }));
    // wires on top
    for (const r of [RADII.bull, RADII.outerBull, RADII.trebleIn, RADII.trebleOut, RADII.doubleIn, RADII.doubleOut]) add('circle', { cx: C, cy: C, r: r * SCALE, fill: 'none', stroke: '#d8c690', 'stroke-width': 1, opacity: 0.7 });
    WHEEL.forEach((n) => { const a = wedgeAngle(n) + SLICE / 2; add('line', { x1: C + Math.cos(a) * RADII.outerBull * SCALE, y1: C - Math.sin(a) * RADII.outerBull * SCALE, x2: C + Math.cos(a) * RADII.doubleOut * SCALE, y2: C - Math.sin(a) * RADII.doubleOut * SCALE, stroke: '#d8c690', 'stroke-width': 1, opacity: 0.7 }); });
    return { svg, layers };
}

// ---------------------------------------------------------------- the explainer
export class Intro {
    constructor(content) {
        injectStyles();
        this.content = content;
        // '1' force on, '0' never; capture runs (review tools) leave it off unless asked
        this.mode = Q.get('intro') ?? (Q.has('capture') ? '0' : null);
        const root = (this.root = el('div', 'kit-intro', document.body));
        root.style.setProperty('--ki-accent', content.accent || '#ffc94a');
        if (content.ink) root.style.setProperty('--ki-ink', content.ink);
        if (content.font) root.style.setProperty('--ki-font', content.font);
        const head = el('div', 'kit-intro-head', root);
        el('div', 'kit-intro-title', head).textContent = content.title;
        el('div', 'kit-intro-tag', head).textContent = content.tagline || '';
        el('div', 'kit-intro-how', root).textContent = 'HOW TO PLAY';
        this.left = el('div', 'kit-intro-page', root);
        this.right = el('div', 'kit-intro-board', root);
        const foot = el('div', 'kit-intro-foot', root);
        this.dots = el('div', 'kit-intro-dots', foot);
        this.dotEls = content.pages.map(() => el('i', null, this.dots));
        this.first = el('div', 'kit-intro-first', foot);
        el('div', 'kit-intro-go', foot).textContent = 'THROW A DART TO START';
        this.timers = [];
        this.visible = false;
        if (this.mode === '1') this.show({});
    }

    /** every state: the explainer is up exactly while the game is fresh (no dart yet); content.fresh/first decide */
    sync(gd) {
        const C = this.content;
        if (C.fresh(gd)) this.show({ first: C.first ? C.first(gd) : '' }); else this.hide();
    }
    /** one full pass through the pages, in ms (a demo waits this long before its first dart) */
    get cycleMs() {
        return this.content.pages.reduce((t, P) => t + (P.legend && P.legend.length ? 400 + P.legend.length * ROW_MS + 2600 : PAGE_MS), 0);
    }
    /** a fresh game: start the explainer. opts.first = the first thrower's name */
    show({ first } = {}) {
        if (this.mode === '0') return;
        this.first.textContent = '';
        if (first) { this.first.append('FIRST UP: '); const s = el('span', null, this.first); s.textContent = first; }
        if (this.visible) return;
        this.visible = true;
        this.root.classList.remove('is-out'); this.root.classList.add('is-on'); document.body.classList.add('kit-intro-on');
        this.page(0);
    }
    /** the game has begun (the first dart, or any takeover): leave at once */
    hide() {
        if (!this.visible || this.mode === '1') return;
        this.visible = false;
        this.clear();
        this.root.classList.add('is-out'); this.root.classList.remove('is-on'); document.body.classList.remove('kit-intro-on');
    }
    clear() { for (const t of this.timers) clearTimeout(t); this.timers = []; }
    later(fn, ms) { this.timers.push(setTimeout(fn, ms)); }

    /** render page k and schedule the next (the pages loop until the first dart) */
    page(k) {
        this.clear();
        const P = this.content.pages[k], n = this.content.pages.length;
        const L = this.left; L.textContent = ''; L.classList.remove('is-in');
        el('div', 'kit-intro-eyebrow', L).textContent = P.eyebrow || '';
        el('div', 'kit-intro-h', L).textContent = P.title || '';
        // the board: zones lit in step with the legend rows, or all lit (dim) to show the roles
        this.right.textContent = '';
        const rows = P.legend || [];
        const zones = rows.length ? rows.map((r) => r.zone) : (P.board?.zones || []);
        const { svg, layers } = boardSVG(zones);
        this.right.appendChild(svg);
        let ms = PAGE_MS;
        if (rows.length) {
            const box = el('div', 'kit-intro-legend', L);
            const rowEls = rows.map((r) => {
                const e = el('div', 'kit-intro-row', box); e.style.setProperty('--ki-c', r.zone.color);
                el('i', null, e);
                const t = el('div', null, e); el('b', null, t).textContent = r.label; if (r.note) el('small', null, t).textContent = r.note;
                el('em', null, e).textContent = r.value;
                return e;
            });
            const lite = (j) => { rowEls.forEach((e, i) => e.classList.toggle('is-lit', i === j)); layers.forEach((z, i) => { z.classList.toggle('is-lit', i === j); z.classList.toggle('is-dim', j < 0 || j >= rows.length); }); };
            rows.forEach((_, j) => this.later(() => lite(j), 400 + j * ROW_MS));
            this.later(() => lite(-1), 400 + rows.length * ROW_MS);           // then all of them together
            ms = 400 + rows.length * ROW_MS + 2600;
        } else {
            layers.forEach((z) => z.classList.add(P.board?.dim ? 'is-dim' : 'is-lit'));
        }
        if (P.lines) {
            const box = el('div', 'kit-intro-lines', L);
            P.lines.forEach((t) => { el('div', 'kit-intro-line', box).textContent = t; });
            box.querySelectorAll('.kit-intro-line').forEach((e, i) => { e.style.transitionDelay = `${0.15 + i * 0.35}s`; });
        }
        void L.offsetWidth; L.classList.add('is-in');
        this.dotEls.forEach((d, i) => { d.className = i < k ? 'is-done' : i === k ? 'is-on' : ''; d.style.setProperty('--ki-ms', ms + 'ms'); });
        this.later(() => this.page((k + 1) % n), ms);
    }
}

/** shared "fresh game" test: round 1, first player, no darts this visit, no throw yet, nobody scored */
export function freshGame(gd, scoreOf = (p) => p.score || 0) {
    return !!gd && (gd.currentRound || 1) === 1 && (gd.activeIdx || 0) === 0 && !gd.throwsThisTurn && !gd.lastThrow
        && (gd.phase?.type || 'playing') === 'playing' && (gd.players || []).every((p) => !scoreOf(p));
}

/**
 * ?demo=1 pages: hold the simulator for one full explainer cycle before its first dart, so the demo shows how to
 * play first. `demo` is the simulator's controller (every 3D demo has pause/resume). Off when the explainer is off
 * (capture runs, ?intro=0).
 */
export function holdDemo(demo, intro) {
    if (!demo || !intro || intro.mode === '0' || !demo.pause || !demo.resume) return;
    demo.pause();
    setTimeout(() => demo.resume(), intro.cycleMs);
}
