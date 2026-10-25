# President — real-rules extraction

Source of truth for the President audit. **President has no single canonical rulebook** — it's a family of
shedding/climbing games (Daihinmin / Asshole / Presidents & A**holes). This port implements a specific
Western house variant. Sources used to characterize the family standard:

- Wikipedia *Daifugō* (Daihinmin) — rank order, dealing, card exchange, role hierarchy.
- Britannica *president (card game)* (David Parlett) — game flow, roles, card trading, 3♣ start.
- PAGAT / Instructables Presidents & A**holes — variant mechanics.
- The port's own `AGENTS.md`, `README.md`, `GameRules.js`, `RankSystem.js`, `Validator.js`.

## Family-standard facts (common across variants)
1. **Object**: shed all your cards first; roles assigned by finish order (President → ... → Asshole).
2. **Rank order** (high→low typically): Joker, 2, A, K, Q, J, 10, 9, 8, 7, 6, 5, 4, 3. 3 is lowest;
   the 3♣ holder leads.
3. **Play**: same number of cards, same type (singles, pairs, triples, quads; runs in some variants),
   must be higher rank than previous; pass or play; round ends when all pass; last player leads next.
4. **Roles & exchange** (next round): Asshole gives best card(s) to President; President gives unwanted
   card(s) back. This is the defining "social status" feature.
5. **Many optional rules**: Jokers wild/trump, revolution (doubling/tripling reverses rank), skips,
   Jack-back, sequences, deuces wild, etc. — all variant.

## This port's variant (encoded in engine)
- `RankSystem.baseRankOrder = 3 4 5 6 7 8 9 10 J Q K A 2` — **3 lowest, 2 high**, J♦ bomb = 15,
  black 3 bomb = 14, red 3 = 0.
- Start: player with **3♣** leads.
- Play types: single, set (2–4 same rank), run (same-suit consecutive 4..A, len 3–5, optional).
- **J♦ bomb** (unbeatable, alone only; triple-6 option beats it).
- **Black 3 bomb** (single black 3 or set with black 3s beats ≤4-length plays).
- **2s bombing** (2-containing plays beat limited lengths; 2s can't beat 2s/black3s/J♦).
- Roles by finish order: President/VP/Vice-Asshole/Asshole (4+), President/Asshole (≤3).
- Options: `num_players` 2–8, `num_decks` 1–4, `runsAllowed`, `min/maxRunLength` (3–5),
  `jackOfDiamondsBomb`, `tripleSixesBeatJd`, `cpuSpeedMultiplier`.

## Audit stance
Because President is a family game with no canonical rulebook, the audit checks:
1. **Internal consistency** — the engine's rank values, play validation, and beat rules agree with its
   own documented variant (this is what the 35-test suite + independent checks verify).
2. **Family-standard alignment** — the variant matches the common mechanics (3♣ start, same-type-beats,
   roles by finish order, shedding objective).
3. **Done-gate features** — the monorepo standard (server authority, leave, reconnect, etc.).
Divergences are noted as variant choices, not bugs, unless they contradict the engine's own documented rules.
