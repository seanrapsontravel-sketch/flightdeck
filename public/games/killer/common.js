// Shared constants and helpers for 3D Killer ("The Ledger").
//
// The board lies in the floor, centred on the origin, the 20 pointing away from the audience (−z): board-plane
// (x, y) → world (x, 0, −y). Its double ring's outer wire (170 mm on a real board) sits at BOARD_R metres.
import * as THREE from 'three';
import { RADII } from '../lib3d/kit/darts.js';

export const BOARD_R = 3.6;                    // m: the double ring's outer edge
export const MM = BOARD_R / RADII.doubleOut;    // metres per real-board millimetre
export const RING_IN = BOARD_R + 0.06, RING_OUT = BOARD_R + 0.78;   // the gold number ring
export const AGENT_R = RING_OUT + 0.72;        // agents stand on their number, just outside the ring
export const SEGS = 3;
/** the three light bands of a wedge, in board mm: band 0 (the first mark) at the rim, band 2 nearest the bull */
export const BANDS = [[118, 168], [68, 116], [19, 66]];
export const SEG_S = 0.75;                     // seconds per segment flood/drain (inside the server's 0.9 s beat)
export const FLIGHT_S = 0.22;                  // a dart's flight from off-camera to the board

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/** board-plane mm → world */
export const boardToWorld = (x, y, h = 0) => V(x * MM, h, -y * MM);
/** a point at math angle a (radians, board plane) and radius r metres */
export const polarWorld = (a, r, h = 0) => V(Math.cos(a) * r, h, -Math.sin(a) * r);

export const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeIn = (t) => Math.pow(clamp01(t), 3);
export const easeOutBack = (t, s = 1.70158) => { t = clamp01(t) - 1; return 1 + t * t * ((s + 1) * t + s); };
export function rng(seed = 1) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }

export const PALETTE = ['#8FD91B', '#2BA4FF', '#FF7A18', '#B44AFF', '#FF2E55', '#F0C400', '#00C97B', '#E1008C'];
export const teamColor = (i) => ((window.FC_PLAYER_COLORS && window.FC_PLAYER_COLORS[i % 8]) || PALETTE[i % 8]);
export const CRIMSON = '#ff1f3a', GOLD = '#ffc76a';
/** head silhouettes by player index (hat or hair): players can be told apart without colour */
export const LOOKS = ['fedora', 'slick', 'tophat', 'bun', 'bowler', 'shades'];
export const SKIN = ['#c89a76', '#8a5a3c', '#e6bf9c', '#5c3b28', '#b07a56', '#f0cfb0'];

/** round → multiplier (src/engines/killer.js killerRoundMultiplier): the room's escalation level 0/1/2 */
export const roundMult = (r) => { r = Math.min(Math.max(r || 1, 1), 12); return r >= 10 ? 3 : r >= 7 ? 2 : 1; };

export const FONT = '"Avenir Next Condensed","DIN Condensed","Roboto Condensed","Arial Narrow",Arial,sans-serif';
export const SERIF = '"Didot","Bodoni 72","Bodoni MT","Playfair Display","Times New Roman",serif';

export const NOISE = `float gh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float gn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(gh(i),gh(i+vec2(1,0)),f.x),mix(gh(i+vec2(0,1)),gh(i+vec2(1,1)),f.x),f.y);}
float gf(vec2 p){return gn(p)*.5+gn(p*2.03+3.1)*.25+gn(p*4.11+7.7)*.15+gn(p*8.3+1.3)*.1;}`;

export { initials } from '../lib3d/kit/hud.js';
