# President — RULES-AUDIT

Status: **AUDITED — engine is internally consistent with its documented Daihinmin/President-family
variant; 30/30 independent rule checks PASS + 35/35 unit tests PASS.**
Run: `npm run audit` → 30 PASS / 0 FAIL, exit 0. `node test.js` → 35/35 PASS.
Source: `references/rulebook-extract.md` (Wikipedia Daifugō + Britannica Parlett + PAGAT + the port's own
GameRules/RankSystem/Validator).

## Real game identity
**President** (Daihinmin / Asshole / Presidents & A**holes) — a shedding/climbing card game with no single
canonical rulebook; it is a *family* of variants. This port implements a specific, coherent Western variant
(3♣ start, black-3 bombs, J♦ bomb, 2s bombing, optional same-suit runs, roles by finish order). The audit
therefore verifies **internal consistency with the documented variant** + **alignment with the family
standard** — not fidelity to one publisher's sheet (none exists).

## Independent checks (30 PASS)
- **Rank order**: 3 lowest, 2 high; black 3 bomb = 14; J♦ bomb = 15; J♦ normal with option off; A>K>Q>J>10. ✅
- **Play types**: single/pair/triple/quad valid; mixed ranks invalid; J♦ alone only; runs disabled by
  default, valid when allowed, same-suit, 4..A only, min length 3. ✅
- **Beat logic**: 6 beats 5, 4 doesn't; pair beats pair; length must match. ✅
- **Bombs**: J♦ beats all; nothing beats J♦; black 3 beats pair 5 but not J♦; single 2 beats 5 but not
  another 2; triple-6 beats J♦ when option on. ✅
- **Roles**: 4p → President/VP/Vice-Asshole/Asshole; 3p → President/Asshole only. ✅
- **Start**: 3♣ holder leads first. ✅

## Family-standard alignment (documented variant, not bugs)
| Feature | Port | Standard |
|---|---|---|
| 3♣ starts | ✅ | common |
| Same-type-higher beats | ✅ | core |
| Roles by finish order | ✅ | core |
| Card trading between deals (Asshole gives best to President, President returns unwanted) | ⚠️ NOT verified in engine — the port reassigns roles but may not implement the cross-deal card swap | the defining "social status" feature of the family |
| Runs | same-suit 4..A only (optional) | many variants allow off-suit |
| 2s/J♦/black-3 bombs | house-defined | variant |

## Done-gate features (monorepo bar)
| Feature | Status |
|---|---|
| Server-authoritative rules | ✅ (server.js + GameRoom.js; client intents) |
| Leave in lobby AND in-game | ⚠️ UNKNOWN — needs client check |
| Reconnect | ⚠️ UNKNOWN |
| Pan/zoom | N/A (no map — card table) |
| CVD-safe palette + symbols | ✅ (card ranks/suits text + colors) |
| Legal-move highlight | ⚠️ UNKNOWN |
| Scoreboard + named log | ⚠️ UNKNOWN |
| How-to-play with REAL rules | ⚠️ UNKNOWN (README exists) |
| Working bots | ✅ (CPUAI.js, server-driven) |
| cache-bust | ⚠️ UNKNOWN (vanilla JS, no hash) |

## Engine bugs found
None in the audited rules core (Validator/RankSystem/GameRules). The card-trading gap and several
done-gate items need a client/server inspection follow-up — flagged as UNKNOWN, not verified.

## Verification
`npm run audit` → 30 PASS / 0 FAIL. `node test.js` → 35/35 PASS. Rules core untouched by this audit.
