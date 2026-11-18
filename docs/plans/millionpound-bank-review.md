# Million Pound question bank: fact-check review

Reviewed 2026-11-18 against `src/engines/millionpound/questions/level-1.json` … `level-6.json` (265 questions; 44 per level, 45 at level 5).

## Method

I read all 265 items, mainly from my own knowledge, and checked each one for four things: (1) is `correct` true as of late 2026, and could it change soon; (2) could a pub-quiz regular argue that one of the `wrong` options is also correct, or pick holes in the premise; (3) is the difficulty grossly wrong for its level; (4) UK spelling and grammar. A script also checked the mechanics: unique ids, exactly three distinct wrong answers, no option repeated, every question ending in "?", every item having a source, and a sweep for US spellings. All of those passed. I did not need web lookups. The facts I was least sure of (Littler's age and the 2025 title, Moore's seven Eon films, Vardon's six Opens, Piggott's nine Derbies, Rees in 1978, France's 12 time zones, O+ as the most common UK blood group) all match my records. I flag only real problems. Questions not in the table passed.

## Flagged questions

| id | level | problem | severity | suggested fix |
|---|---|---|---|---|
| nat-0024 | 5 | "How many legs does a lobster have?" with 10 as the answer and 8 as a wrong option. Lobsters have 8 walking legs plus 2 claws (chelipeds), so "8" is a common and defensible answer. | MUST FIX | Reword to: "Counting its two big claws, how many legs does a lobster have?" Keep 10 / 8 / 6 / 12. |
| sci-0023 | 4 | "How many chromosomes does a human cell normally have?" Sex cells (eggs and sperm) normally have 23, and 23 is one of the wrong options. | MUST FIX | Reword to: "How many chromosomes are there in a normal human body cell?" Keep 46 / 23 / 44 / 48. |
| nat-0021 | 4 | "Which is the only bird able to fly backwards?" The word "only" is disputed: some sources say other birds can briefly fly backwards. The answer is safe, but the premise invites a "well, actually". | SHOULD FIX | Reword to: "Which bird is famous for being able to fly backwards?" |
| geo-0039 | 6 | "Mount Kosciuszko is the highest mountain in which country?" It is the highest on the Australian mainland, but Australia's highest peak is Mawson Peak on Heard Island, an external territory. That is a known quiz trap. The answer is still Australia; only the premise is loose. | SHOULD FIX | Reword to: "Mount Kosciuszko is the highest mountain on which country's mainland?" |
| foo-0012 | 4 | Manchego: the wrong option "Mexico" is risky, because Mexico makes a widely sold cheese called "manchego" (a cow's-milk cheese). | SHOULD FIX | Replace "Mexico" with "France". |
| ent-0013 | 4 | "…in the most official Eon Bond films?" reads awkwardly. The fact is correct: Moore made 7 Eon films and Connery 6. | SHOULD FIX | Reword to: "Which actor played James Bond in the most official (Eon) Bond films?" |
| his-0029 | 6 | Far too easy for level 6: everyone knows Hadrian's Wall, and "a wall across northern Britain" gives it away. "Ordered the wall begun" is also clumsy. | SHOULD FIX | Move to level 3 and reword: "Which Roman emperor ordered a wall to be built across northern Britain in AD 122?" |
| dar-0009 | 5 | Far too easy for level 5 in a darts pub. Littler is a household name, and "aged 17, in 2025" gives it away. The fact is correct and not time-sensitive, because it is phrased as a past event. | SHOULD FIX | Move to level 2. |
| dar-0012 | 6 | "The Crafty Cockney" is common knowledge among darts players. Too easy for level 6 with this audience. | SHOULD FIX | Move to level 3. |
| ent-0018 | 5 | Agatha Christie created Poirot: most people know this. It is level 1 or 2 material. | SHOULD FIX | Move to level 2. |
| ent-0021 | 5 | Tom Hanks voices Woody: widely known. | SHOULD FIX | Move to level 2 or 3. |
| gen-0013 | 5 | The square root of 144 is times-table knowledge. | SHOULD FIX | Move to level 1 or 2, or replace it with something like the cube root of 343 (7). |
| sci-0031 | 5 | "Sodium chloride is better known as what?" is common knowledge. | SHOULD FIX | Move to level 2. |
| sci-0035 | 6 | The Higgs boson discovery in 2012 was big news and is widely known. Too easy for level 6. | SHOULD FIX | Move to level 3 or 4. |
| his-0028 | 6 | The 1929 Wall Street Crash is a well-known date. Too easy for level 6. | SHOULD FIX | Move to level 3 or 4. |

Moving questions between levels will unbalance the per-level counts (44 each). Each question moved down needs a harder replacement at its old level, or a swap with an easier-than-it-should-be question going the other way.

### Borderline (optional, not counted)

- **Difficulty, a little easy for their level:** his-0021 Trafalgar (L5), nat-0025 cygnet (L5), sci-0037 Marie Curie (L6), nat-0018 ants and Antarctica (L4). Worth swapping if you are rebalancing anyway.
- **Category labels:** ent-0022 (Dalí, a painting) sits under "film, tv & books". nat-0016 (conjunctivitis) and nat-0028 (liver) sit under "nature" but are about the human body, so "science" fits better.
- **Deliberate traps that are fine:** sci-0004 and sci-0010 use Fahrenheit numbers as °C wrong options (32°C, 212°C). his-0025 offers George IV as a trap for the Regency; the monarch was George III. gen-0010 has a chessboard with 64 squares, and 204 (counting squares of every size) is not offered. All three are fair.

## Summary

- Checked: **265**
- MUST FIX: **2** (nat-0024, sci-0023)
- SHOULD FIX: **13** (4 wording or premise, 9 difficulty)
- Passed unchanged: **250**
