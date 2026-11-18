// Zero Hour on the real host (fast pace): a whole game through the server and tablet protocol. The draw secret never
// reaches a client until the match is over, darts thrown during the spin are ignored (never held for a shootout),
// and the session records every player's place from the winning number.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startHost, until } = require('./helpers.cjs');

test('zerohour through the server', { timeout: 150000 }, async () => {
    process.env.ZEROHOUR_PACE = 'fast';
    const host = await startHost();
    try {
        const cookie = await host.pair();
        const peer = await host.connect(cookie);
        await peer.command({ action: 'ADD_PLAYER', name: 'Alice' });
        await peer.command({ action: 'ADD_PLAYER', name: 'Ben' });
        await peer.command({ action: 'FILL_LINEUP' });
        await peer.command({ action: 'SAVE_VENUE_CONFIG', patch: { viewerVideoEnabled: false, dartCalloutMode: 'off' } });
        await peer.command({ action: 'START_SESSION', minutes: 30 });
        await peer.command({ action: 'SELECT_GAME', gameType: 'zerohour' });
        const gd = () => peer.state.gameData;
        assert.equal(gd().gameType, 'zerohour');
        assert.equal(gd().phase.type, 'playing');
        assert.equal(gd().secret, undefined, 'the secret is stripped from the public state');
        assert.match(gd().zh.commit, /^[0-9a-f]{64}$/);
        assert.equal(gd().zh.secret, null);
        const sawSecret = () => peer.messages.some((m) => m.type === 'STATE_UPDATE' && m.data.gameData && m.data.gameData.secret !== undefined);

        // the mock board never pulls its darts: clear the takeout gate between visits as the integration test does
        const pulled = async () => { if (peer.board?.awaitingTakeout) { await peer.command({ action: 'BOARD_COMMAND', command: 'RESET_PHASE' }); await until(() => !peer.board.awaitingTakeout); } };
        let ev = 0;
        const dart = (number, multiplier) => peer.command({ action: 'FORWARD_GAME_ACTION', payload: { type: 'TRIGGER_SPECIFIC_THROW', number, multiplier, sector: (multiplier === 3 ? 'T' : multiplier === 2 ? 'D' : 's') + number, eventId: 'zh:' + (ev++) } });
        let lastHot = null;
        for (let v = 0; v < 10; v++) {
            const seat = v % 2;
            await until(() => gd().phase.type === 'playing' && gd().activeIdx === seat && !gd().throwsThisTurn, 15000);
            await pulled();
            const hot = gd().zh.hot;
            if (seat === 0) { assert.notDeepEqual(hot, null); lastHot = hot.join(); }
            for (let d = 0; d < 3; d++) {
                await dart(seat === 0 ? hot[0] : 20, seat === 0 ? 3 : 1);
                await until(() => gd().throwsThisTurn === d + 1 || gd().phase.type !== 'playing', 5000);
            }
            const lv = gd().zh.lastVisit;
            assert.equal(lv.round, Math.floor(v / 2) + 1);
            assert.equal(lv.drops.reduce((a, x) => a + x.v, 0), lv.points);
        }
        assert.ok(lastHot);
        await until(() => gd().phase.type === 'spin', 10000);
        const before = JSON.stringify(gd().players);
        await pulled();
        await dart(20, 3); // a dart thrown while the wheel spins
        assert.equal(JSON.stringify(gd().players), before, 'the spin ignores darts');
        await until(() => gd().phase.type === 'winner', 30000);
        const end = gd();
        assert.equal(end.secret, undefined);
        assert.equal(sawSecret(), false, 'no state update ever carried the secret');
        assert.equal(crypto.createHash('sha256').update(end.zh.secret).digest('hex'), end.zh.commit, 'revealed secret matches the commit');
        // Alice threw hot trebles all night, Ben single 20s: Alice has far more points (she can still lose the spin)
        assert.ok(end.players[0].score > end.players[1].score);
        for (const p of end.players) assert.equal(p.drops.reduce((a, x) => a + x.v, 0), p.score);
        assert.equal(end.zh.placings[0].id, end.phase.data.winnerId);
        await until(() => (peer.state.results || []).some((r) => r.gameType === 'zerohour'), 5000);
        const result = peer.state.results.find((r) => r.gameType === 'zerohour');
        assert.equal(result.rankingRule, 'engine_standings');
        const byId = Object.fromEntries(result.participants.map((p) => [p.id, p.place]));
        for (const row of end.zh.placings) assert.equal(byId[row.id], row.place);
    } finally {
        delete process.env.ZEROHOUR_PACE;
        await host.stop();
    }
});
