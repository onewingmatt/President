# President v1.6.141 - Turn Notification Only

## 🔔 NEW FEATURE: Turn Notification Only Mode

**Sound only when it's YOUR turn!**

### Settings:
1. **🔊 Sound Effects** - Master toggle (ON/OFF)
2. **🔔 Turn Notification Only** - NEW! Mutes all sounds except turn notification
3. **Volume** - 0-100%

### How It Works:
When "Turn Notification Only" is enabled:
- ✅ **Sound plays:** When it becomes your turn
- 🔇 **Muted:** Button clicks, card plays, passes, errors

When disabled (default):
- All sounds work as normal

### Benefits:
- Less distracting in multiplayer games
- Clear notification when action is needed
- Perfect for playing while multitasking

## ✅ Also Includes (from v1.6.140):
- Enhanced card sorting (value + suit)
- Fixed black 3s sorting (3♣ always first)
- Improved 3♣ detection
- Comprehensive gameplay testing
- Working sound system (v1.6.139 fix)

## 🚀 Deploy:

```bash
npm install
node server.js
```

Visit: http://localhost:8080

Or Fly.io:
```bash
flyctl deploy -a wippres
```

## 🧪 Test:

Open console (F12) and type:
```javascript
testSound()
```

## 🎮 Features:
- 2-8 players
- CPU opponents (0-7)
- Turn notification mode
- Volume control
- Card exchange
- President/Asshole ranking
- Mobile responsive
- Extended UI scaling
- Sticky buttons

Enjoy! 🎴🔔✨
