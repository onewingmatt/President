# President — SCOPE

**Game:** President (a.k.a. Daihinmin / Asshole / Presidents & A**holes) — shedding/climbing card game.
This port implements a **specific Western house variant** with documented options; audited against the
Daihinmin/President family standard (Wikipedia Daifugō + Britannica + PAGAT).

**Port:** `~/github/President` (Node/Express + Socket.IO backend, vanilla JS frontend; `president-deploy`
mirrors it). 2–8 players, CPU opponents, real-time rooms.

## Rules implemented (from engine: `GameRules.js`, `RankSystem.js`, `Validator.js`)

### Rank order
- `baseRankOrder = 3 4 5 6 7 8 9 10 J Q K A 2` (low→high).
- **3♣ (and black 3s)** are special: `rankValue(black3) = 14` (bomb), `rankValue(red 3) = 0` (lowest).
- **J♦** = 15 (jack-of-diamonds bomb, unbeatable unless triple-6 option). With `jackOfDiamondsBomb=false`,
  J♦ ranks at normal J.
- **2** = 13 (high; single 2 cannot beat another 2).

### Play types
- **Single**, **set** (2–4 same rank), **run** (same suit, consecutive ranks 4..A, length min 3 / max 5,
  optional `runsAllowed`).
- **J♦ bomb**: must be played alone (cannot combine), beats everything except triple-6 (option).
- **Black 3 bomb**: a single black 3 or set containing black 3s beats any play of length ≤ 4 (except J♦
  and higher rules).
- **2s bombing**: singles/sets containing 2s beat lower plays of limited length; 2s cannot beat equal/more
  2s, black 3s, or J♦.
- **Triple 6 ("Perfect 666")** (option `tripleSixesBeatJd`): beats J♦.

### Start & flow
- Player holding **3♣ leads first** (game start). Otherwise first player.
- On your turn: play a higher play of matching type+length, or pass.
- Round ends when everyone passes; last player leads next round.
- Finish order → **roles**: President, Vice President, Vice Asshole, Asshole (4+ players); President/Asshole
  only (≤3 players).
- Game continues until all but one player empty their hand; roles reassigned each deal.

## Real-game identity
This is the **Daihinmin/President family** (not a single canonical rulebook — the game has many variants).
The port's specific variant (3♣ start, black-3 bombs, J♦ bomb, 2s bombing, runs optional) is a coherent,
documented Western variant. **There is no single "official" President rulebook to be 100% faithful to**;
the audit verifies internal consistency + alignment with the family standard, not a specific publisher.

## Divergences / notes (see RULES-AUDIT)
- `assignRoles` uses finish order → roles; the classic game also **trades cards** (President gives unwanted
  cards, Asshole gives best cards). This port's role exchange across deals is per finish order; card
  trading between rounds is a common variant — verify whether implemented.
- Runs restricted to same-suit 4..A; many variants allow off-suit runs.
- 2s bomb length limits are house-defined.
