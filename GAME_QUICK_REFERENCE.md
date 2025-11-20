# 🎮 Where Winds Meet - Quick Commands

## Search Commands

| Command | Usage | Example |
|---------|-------|---------|
| `/weapon` | `/weapon <name>` | `/weapon jade` → Find Jade Spear |
| `/npc` | `/npc <name>` | `/npc master` → Find Old Master Chen |
| `/boss` | `/boss <name>` | `/boss dragon` → Find Dragon of the East |
| `/skill` | `/skill <name>` | `/skill strike` → Find Whirlwind Strike |
| `/item` | `/item <name>` | `/item potion` → Find Health Potion |
| `/gamestats` | `/gamestats` | Shows total counts of all entries |

## Example Output

```
⚔️ Celestial Saber
Type:       Saber
Damage:     25
Rarity:     Rare
Description: A legendary saber infused with celestial energy.

Footer: Where Winds Meet Game Database
```

## Current Database

| Category | Count | Examples |
|----------|-------|----------|
| ⚔️ Weapons | 4 | Iron Sword, Jade Spear, Celestial Saber, Wind Fan |
| 👤 NPCs | 3 | Old Master Chen, Merchant Lin, Liu Wei |
| 👹 Bosses | 2 | Shadow Phantom, Dragon of the East |
| ✨ Skills | 3 | Whirlwind Strike, Parry, Chi Burst |
| 📦 Items | 3 | Health Potion, Mana Elixir, Celestial Stone |

## Data Location

All game data is stored in JSON format in:
```
/game-data/
├── weapons.json
├── npcs.json
├── bosses.json
├── skills.json
└── items.json
```

## To Add Custom Data

1. Edit the JSON file in `/game-data/`
2. Add new entry following the existing format
3. Save file
4. Bot will automatically include new data in searches

## Feature Code Files

- `game-scraper.js` - Data management & scraping
- `game.js` - Discord command handlers
- Modified `index.js` - Slash command integration

## Next Steps

- Implement web scraper for wiki data
- Add more game information fields
- Enable pagination for large result sets
- Auto-update database from wiki source
