# 🎮 Where Winds Meet Game Feature Guide

## Overview

The Discord bot now includes a full game database search system for **Where Winds Meet** game. This feature allows users to search for:
- ⚔️ Weapons
- 👤 NPCs (Non-Player Characters)
- 👹 Bosses
- ✨ Skills
- 📦 Items

## Files Created

### 1. `game-scraper.js` - Data Management
Contains all scraping and data handling functions:
- **`scrapeAllData()`** - Main scraping function (for future web scraping from wiki)
- **`createSeedData()`** - Creates initial test data
- **Search functions:**
  - `searchWeapons(query)`
  - `searchNPCs(query)`
  - `searchBosses(query)`
  - `searchSkills(query)`
  - `searchItems(query)`
- **Get all functions:**
  - `getAllWeapons()`
  - `getAllNPCs()`
  - `getAllBosses()`
  - `getAllSkills()`
  - `getAllItems()`

**Data stored in:** `/game-data/` directory (JSON files)
- `weapons.json`
- `npcs.json`
- `bosses.json`
- `skills.json`
- `items.json`

### 2. `game.js` - Discord Command Handlers
Provides embed formatting and command handlers:
- **`handleWeaponSearch()`** - Handle `/weapon` command
- **`handleNPCSearch()`** - Handle `/npc` command
- **`handleBossSearch()`** - Handle `/boss` command
- **`handleSkillSearch()`** - Handle `/skill` command
- **`handleItemSearch()`** - Handle `/item` command
- **`handleGameStats()`** - Show database statistics

Each handler returns rich Discord embeds with:
- Color-coded headers
- Formatted information fields
- Footer with source info

### 3. `index.js` - Slash Commands
Added 6 new slash commands to the bot:
- `/weapon <name>` - Search for weapons
- `/npc <name>` - Search for NPCs
- `/boss <name>` - Search for bosses
- `/skill <name>` - Search for skills
- `/item <name>` - Search for items
- `/gamestats` - Show database statistics

## Discord Commands

### Weapon Search
```
/weapon <name>
```
Searches for weapons by name or type.

**Example:**
- `/weapon sword` - Find all swords
- `/weapon celestial` - Find Celestial Saber

**Output:**
```
⚔️ Celestial Saber
Type: Saber
Damage: 25
Rarity: Rare
Description: A legendary saber infused with celestial energy.
```

### NPC Search
```
/npc <name>
```
Searches for NPCs by name or role.

**Example:**
- `/npc master` - Find Old Master Chen
- `/npc merchant` - Find all merchants

### Boss Search
```
/boss <name>
```
Searches for bosses by name or location.

**Example:**
- `/boss dragon` - Find Dragon of the East
- `/boss shadow` - Find Shadow Phantom

### Skill Search
```
/skill <name>
```
Searches for skills by name or type.

**Example:**
- `/skill strike` - Find Whirlwind Strike
- `/skill chi` - Find Chi-based skills

### Item Search
```
/item <name>
```
Searches for items by name or type.

**Example:**
- `/item potion` - Find Health Potion
- `/item stone` - Find Celestial Stone

### Game Statistics
```
/gamestats
```
Shows overall database statistics:
- Total weapons count
- Total NPCs count
- Total bosses count
- Total skills count
- Total items count

## Current Data

### Seed Data (Testing)
The system comes with initial seed data:

**Weapons:**
- Iron Sword (Common, Damage: 15)
- Jade Spear (Uncommon, Damage: 18)
- Celestial Saber (Rare, Damage: 25)
- Wind Fan (Common, Damage: 12)

**NPCs:**
- Old Master Chen (Combat Trainer, Kaifeng)
- Merchant Lin (Merchant, Market District)
- Liu Wei (Quest Giver, Pagoda)

**Bosses:**
- Shadow Phantom (Level 25, Dark Forest)
- Dragon of the East (Level 35, Mountain Peak)

**Skills:**
- Whirlwind Strike (Attack, Physical)
- Parry (Defense)
- Chi Burst (Magic, Energy)

**Items:**
- Health Potion (Consumable)
- Mana Elixir (Consumable)
- Celestial Stone (Crafting)

## Future Enhancements

### 1. Web Scraping from Wiki
The `scrapeAllData()` function in `game-scraper.js` is ready for implementation:
```javascript
await scrapeWeapons()    // Parse weapons from wiki
await scrapeNPCs()       // Parse NPCs from wiki
await scrapeBosses()     // Parse bosses from wiki
await scrapeSkills()     // Parse skills from wiki
```

### 2. Full HTML Parsing
Add `cheerio` or similar HTML parser to extract data from:
- https://wherewindsmeet.wiki.fextralife.com/Martial+Arts+Weapons
- https://wherewindsmeet.wiki.fextralife.com/NPCs
- https://wherewindsmeet.wiki.fextralife.com/Bosses
- https://wherewindsmeet.wiki.fextralife.com/Skills

### 3. Auto-Update Database
Set up periodic scraping to keep game data updated:
```javascript
setInterval(() => {
  scrapeAllData(); // Update every 1 hour
}, 60 * 60 * 1000);
```

### 4. More Data Fields
Expand each entity with additional information:
- Weapon: Special abilities, requirements, farming location
- NPC: Quest rewards, dialogue, schedule
- Boss: Loot drops, weakness, strategy tips
- Skill: Upgrade paths, combinations, stat scaling
- Item: Recipes, locations, market value

### 5. Pagination
For searches with many results:
```javascript
// Show first 5, with buttons for next page
if (results.length > 5) {
  // Add pagination buttons
}
```

## Usage Example

User runs:
```
/weapon jade
```

Bot responds with:
```
Embed showing Jade Spear with all details
```

User runs:
```
/gamestats
```

Bot responds with:
```
🎮 Where Winds Meet - Database Stats
⚔️ Weapons: 4
👤 NPCs: 3
👹 Bosses: 2
✨ Skills: 3
📦 Items: 3
```

## Adding Custom Data

To add custom game data, edit the JSON files in `/game-data/`:

**Example: Add new weapon to `weapons.json`:**
```json
{
  "id": 5,
  "name": "Phoenix Fang",
  "type": "Dagger",
  "damage": 20,
  "rarity": "Rare",
  "description": "A rare dagger imbued with phoenix fire."
}
```

Then run commands and the new data will be searchable!

## Database Structure

Each JSON file follows a consistent structure:

**Weapon:**
```json
{
  "id": number,
  "name": string,
  "type": string,
  "damage": number,
  "rarity": string,
  "description": string
}
```

**NPC:**
```json
{
  "id": number,
  "name": string,
  "role": string,
  "location": string,
  "description": string
}
```

**Boss:**
```json
{
  "id": number,
  "name": string,
  "level": number,
  "health": number,
  "location": string,
  "rewards": string
}
```

**Skill:**
```json
{
  "id": number,
  "name": string,
  "type": string,
  "damageType": string,
  "cooldown": number,
  "description": string
}
```

**Item:**
```json
{
  "id": number,
  "name": string,
  "type": string,
  "effect": string,
  "rarity": string
}
```

## Troubleshooting

### No results found
- Check if search query matches the data exactly
- Try searching with a partial name
- Run `/gamestats` to verify database has entries

### Bot doesn't respond
- Ensure bot is running: `npm start`
- Check for errors: `npm start 2>&1 | tail -20`
- Verify Discord token in `.env` file

### Want to add more data?
Edit the JSON files in `/game-data/` directly or:
1. Implement HTML scraping in `game-scraper.js`
2. Run scraper to auto-populate data
3. Restart bot

## Integration with Other Features

The game feature works alongside existing bot features:
- **Movies** - `/search`, `/newmovies`
- **Football** - `/live`, `/fixtures`, `/standings`
- **General** - `/ping`, `/help`, `/echo`

All commands are accessible via `/help`
