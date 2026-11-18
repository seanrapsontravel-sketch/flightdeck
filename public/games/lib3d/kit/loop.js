// The frame loop every 3D game uses (lifted from Limbo).
//   - wall-clock pacing: a slow frame (a weak TV, a busy machine) is simulated in sub-steps of at most `maxStep`
//     through the real elapsed time, so the view keeps pace with the host's state instead of falling behind; only a
//     stall longer than `maxLag` is dropped
//   - ?capture=1: no requestAnimationFrame; frames are driven by step(n, dt) (docs/plans/tools/dcap.cjs, baseline.cjs)
//   - engine.adapt() (dynamic resolution) on real frames only
//   const loop = createLoop({ engine, before(ms) {drain state}, simulate(dt) {...}, after(ms) {pre-render} });
//   window.__game = { ..., step: loop.step };
export function createLoop({ engine, before, simulate, after, maxStep = 1 / 30, maxLag = 0.5 }) {
    function tick(ms) {
        if (before) before(ms);
        let left = Math.min(maxLag, Math.max(0, ms / 1000));
        do { const dt = Math.min(maxStep, left); simulate(dt); left -= dt; } while (left > 1e-4);
        if (after) after(ms);
        engine.render();
    }
    const capture = new URLSearchParams(location.search).has('capture');
    let last = performance.now();
    function frame(now) {
        requestAnimationFrame(frame);
        const ms = now - last; last = now;
        tick(ms);
        engine.adapt(ms);
    }
    if (!capture) requestAnimationFrame(frame);
    else tick(16);
    document.body.classList.add('booted');
    if (capture) document.body.classList.add('capture');
    return {
        tick, capture,
        /** capture mode: advance n frames of dt seconds each (renders every frame) */
        step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) tick(dt * 1000); },
    };
}
