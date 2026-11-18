// Million Pound Oche on the real host: one dart per question, darts between questions dropped (never queued),
// duplicate board events ignored, and a rematch in the same session repeats no question.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startHost, until } = require('./helpers.cjs');

test('millionpound through the server', { timeout: 90000 }, async () => {
    const host = await startHost();
    try {
        const cookie = await host.pair();
        const peer = await host.connect(cookie);
        await peer.command({ action: 'ADD_PLAYER', name: 'Alice' });
        await peer.command({ action: 'ADD_PLAYER', name: 'Ben' });
        await peer.command({ action: 'FILL_LINEUP' });
        await peer.command({ action: 'SAVE_VENUE_CONFIG', patch: { viewerVideoEnabled: false, dartCalloutMode: 'off' } });
        await peer.command({ action: 'START_SESSION', minutes: 30 });
        await peer.command({ action: 'SELECT_GAME', gameType: 'millionpound' });
        const gd = () => peer.state.gameData;
        assert.equal(gd().gameType, 'millionpound');
        assert.equal(gd().phase.type, 'playing');
        const firstIds = gd().questionIds.slice();
        assert.equal(firstIds.length, 30);

        const dart = (number, eventId) => peer.command({ action: 'FORWARD_GAME_ACTION', payload: { type: 'TRIGGER_SPECIFIC_THROW', number, multiplier: 1, sector: `s${number}`, eventId } });
        const q1 = gd().question.id;
        await dart(20, 'v1:0');
        assert.equal(gd().phase.type, 'locked');
        assert.equal(gd().phase.data.answer, 'A');
        await dart(20, 'v1:0');                       // the same board event again
        await dart(6, 'v1:1');                        // a second dart during the lock
        assert.equal(gd().phase.type, 'locked');
        assert.equal(gd().phase.data.answer, 'A', 'the second dart did not change the answer');
        assert.equal(gd().dartsThisQuestion, 1);
        await until(() => gd().phase.type === 'reveal', 6000);
        await dart(3, 'v1:2');                        // a dart during the reveal: must not be held for question 2
        await until(() => gd().phase.type === 'playing', 8000);
        assert.equal(gd().activeIdx, 0, 'still Alice: three questions a turn');
        assert.equal(gd().question.number, 2);
        assert.notEqual(gd().question.id, q1);
        assert.equal(gd().dartsThisQuestion, 0, 'no held dart answered question 2');
        assert.equal(gd().throwsThisTurn, 1);

        // a rematch in the same session draws fresh questions
        await peer.command({ action: 'NAVIGATE', screen: 'GAME_SELECTION' });
        await peer.command({ action: 'SELECT_GAME', gameType: 'millionpound' });
        const again = gd().questionIds;
        assert.equal(again.filter((id) => firstIds.includes(id)).length, 0);
    } finally {
        await host.stop();
    }
});
