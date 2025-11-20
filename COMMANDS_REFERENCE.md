# 📚 Complete Slash Commands Reference

## All Available Slash Commands

### 🔷 Basic Commands (4)
```
/ping                   - Kiểm tra bot sống hay không
/hello                  - Bot chào bạn
/echo <nội dung>        - Bot lặp lại câu bạn nói
/help                   - Xem tất cả các lệnh
```

### ⚽ Football/Livescore Commands (6)
```
/live [league_id]       - Xem trận đang diễn ra
                         (Optional: league_id, default: PL)

/standings [league_code] - Bảng xếp hạng
                         (Optional: PL, EL1, SA, BL1, FL1, PD, EC)

/fixtures [team_id]     - Lịch thi đấu sắp tới
                         (Optional: team ID)

/lineup <match_id>      - Xem line-up trước trận (khi công bố)
                         (Required: match ID)

/findteam <name>        - Tìm Team ID
                         (Required: tên đội bóng)

/teams                  - Danh sách team có sẵn
```

### 📍 Team Tracking Commands (4)
```
/track                  - Chọn team để theo dõi (UI dropdown)

/untrack <team_id>      - Hủy theo dõi team
                         (Required: team ID)

/mytracks               - Xem danh sách team đang theo dõi

/dashboard              - Xem dashboard với lịch thi đấu
                         (Includes pagination, cooldown: 60s)
```

### 🎬 Movie Commands (3)
```
/search <name>          - Tìm phim
                         (Required: tên phim, gõ "help" để xem chi tiết)

/newmovies [page]       - Phim mới cập nhật
                         (Optional: số trang, default: 1)

/episodes <slug>        - Xem danh sách tập phim
                         (Required: slug của phim)
```

---

## Command Usage Examples

### Basic Commands
```
/ping
→ Pong! 🏓

/hello
→ Hello <username> 😎

/echo Xin chào
→ Xin chào

/help
→ Shows all commands
```

### Football Commands
```
/live
→ Shows live matches in Premier League

/live EL1
→ Shows live matches in La Liga

/standings
→ Shows list of available competitions

/standings PL
→ Shows Premier League standings

/fixtures 11
→ Shows Manchester United fixtures

/lineup 123456
→ Shows line-up for match ID 123456

/findteam chelsea
→ Finds all teams with "chelsea" in name

/teams
→ Shows list of teams
```

### Team Tracking
```
/track
→ Shows dropdown menu to select teams

/untrack 11
→ Unfollow Manchester United (ID: 11)

/mytracks
→ Shows your tracked teams

/dashboard
→ Shows dashboard with all tracked teams' fixtures
```

### Movie Commands
```
/search avatar
→ Shows results for "avatar" movies
→ Click buttons to see details
→ Click servers to see episodes

/search help
→ Shows detailed help for search command

/newmovies
→ Shows 10 newest movies

/newmovies 2
→ Shows movies from page 2

/episodes avatar-2009
→ Shows episodes for Avatar (2009)
```

---

## Command Parameters Guide

### Optional vs Required

**Required Parameters:**
- Must provide value or command fails
- Example: `/lineup 123456` ← match_id is required

**Optional Parameters:**
- Can skip if you want default
- Example: `/live` ← league_id optional, defaults to PL

### Parameter Types

**String (Text):**
```
/search avatar              ← "avatar" is a string
/findteam manchester united ← "manchester united" is a string
```

**Integer (Number):**
```
/fixtures 11               ← 11 is an integer
/lineup 123456            ← 123456 is an integer
/newmovies 2              ← 2 is an integer
```

---

## Quick Tips

### 💡 Pro Tips

1. **Use Tab to autocomplete** - After typing `/`, press Tab to jump to next field
2. **Click command suggestions** - Discord shows all matching commands as you type
3. **Parameters are typed** - Can't accidentally pass wrong type (Discord validates)
4. **See descriptions** - Hover over parameters to see what they mean
5. **Ephemeral messages** - Some error messages only show to you

### 🎯 Common Workflows

**Check Live Matches:**
```
/live
```

**Track a Team:**
```
/findteam chelsea
→ Note down the ID (11)
/track
→ Select Chelsea from dropdown
```

**View Tracked Teams:**
```
/mytracks
```

**Check Team Schedule:**
```
/dashboard
```

**Search for Movie:**
```
/search avatar
→ Click "1. Avatar (2009)"
→ Click a server
→ View episodes
```

---

## League Codes (for /standings)

| Code | League |
|------|--------|
| **PL** | Premier League (England) |
| **EL1** | La Liga (Spain) |
| **SA** | Serie A (Italy) |
| **BL1** | Bundesliga (Germany) |
| **FL1** | Ligue 1 (France) |
| **PD** | Primeira Liga (Portugal) |
| **EC** | Champions League |

---

## Troubleshooting

### Command not appearing
- Try typing `/help` first
- Restart Discord app
- Wait 5-10 seconds for Discord cache
- Restart bot: `node index.js`

### Parameter not accepting input
- Check if it's required or optional
- Ensure correct type (text vs number)
- Read the parameter description (hover/tooltip)

### Command times out
- Bot might be processing
- Check bot console for errors
- Ensure bot has internet connection
- Restart bot and try again

### Button/Menu not responding
- Make sure it's for YOUR interaction
- Wait a few seconds for cache update
- Try again
- Check bot console for errors

---

## Feature Comparison: Old vs New

| Feature | `!command` | `/command` |
|---------|-----------|-----------|
| Autocomplete | ❌ No | ✅ Yes |
| Parameter hints | ❌ No | ✅ Yes |
| Type validation | ❌ No | ✅ Yes |
| Error messages | ❌ Custom | ✅ Built-in |
| Modern Discord UX | ❌ No | ✅ Yes |
| Still works? | ✅ Yes | ✅ Yes |

---

## Statistics

- **Total Slash Commands**: 18
- **With Required Parameters**: 8
- **With Optional Parameters**: 6
- **Football Commands**: 6
- **Movie Commands**: 3
- **Team Tracking**: 4
- **Basic Commands**: 4

---

**Last Updated**: November 20, 2025  
**Status**: ✅ All commands functional  
**Discord.js Version**: 14.x
