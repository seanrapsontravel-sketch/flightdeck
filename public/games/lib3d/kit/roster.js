// Players and doubles teams, named the way the server's helpers name them (src/engines/core.js doubles*):
// a doubles entity has members[]; throwerIndices[i] says which member is throwing for entity i.
export const members = (gd, i) => (gd.isDoublesLineup && gd.players[i]?.members?.length ? gd.players[i].members : [gd.players[i]]);
export const teamName = (gd, i) => members(gd, i).map((m) => m.name).join(' & ');
export const throwerOf = (gd, i) => { const m = members(gd, i); return m[((gd.throwerIndices || [])[i] || 0) % m.length]; };
