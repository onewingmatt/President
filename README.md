# President v1.6.55 - Swap Card Display Fix

## Fixed in v1.6.55
- **Swap cards now properly sized** - match normal hand cards
- **Single machine verified** in fly.toml
- All v1.6.54 special card rules preserved

## Special Card Rules
1. **2s**: Single 2 beats singles/pairs, two 2s beat triples
2. **Black 3s (♣3, ♠3)**: Beat up to 4-of-a-kind
3. **Jack of Diamonds (J♦)**: Wildcard - plays on any meld

## Deploy
```bash
flyctl deploy
# Verify single machine:
flyctl status
flyctl machines list
```