// Picker, venue settings, view paths and player limits share this catalogue.
const games = [
    ['demolition', 'Demolition', 'social', 2, 6],
    ['limbo', 'Limbo', 'social', 2, 6],
    ['derby', 'Derby', 'social', 2, 6],
    ['killer', 'Killer', 'social', 2, 6],
    ['quackshot', 'Quackshot', 'social', 2, 6],
    ['shanghai', 'Shanghai', 'social', 2, 6],
    ['warmup', 'Warm Up', 'classic', 1, 6],
    ['quick10', 'Quick 10', 'classic', 1, 6],
    ['x01', 'X01', 'classic', 1, 4],
    ['cricket', 'Cricket', 'classic', 2, 4],
    ['aroundtheworld', 'Around the World', 'classic', 1, 6]
].map(([id, title, category, minPlayers, maxPlayers]) => ({
    id, title, category, minPlayers, maxPlayers, view: `/games/${id}.html`,
    championship: !['quick10', 'warmup'].includes(id),
    options: id === 'x01' ? ['startScore', 'dartIn', 'dartOut'] : id === 'aroundtheworld' ? ['variant'] : []
}));
module.exports = { games, byId: Object.fromEntries(games.map(g => [g.id, g])) };
