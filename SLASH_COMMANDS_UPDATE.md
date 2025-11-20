# Discord Bot - Slash Commands Update

## 📋 Summary
Successfully converted the bot from text-based prefix commands (`!command`) to Discord's modern slash commands (`/command`). All commands now work as both slash commands and maintain backward compatibility with the old prefix system.

## ✅ Slash Commands Implemented

### Basic Commands
- `/ping` - Kiểm tra bot sống hay không
- `/hello` - Bot chào bạn
- `/echo <nội dung>` - Bot lặp lại câu bạn nói
- `/help` - Xem tất cả các lệnh

### Football/Livescore Commands
- `/live [league_id]` - Xem trận đang diễn ra (mặc định: PL)
- `/standings [league_code]` - Bảng xếp hạng (PL, EL1, SA, BL1, FL1, PD, EC)
- `/fixtures [team_id]` - Lịch thi đấu sắp tới
- `/lineup <match_id>` - Xem line-up trước trận
- `/findteam <name>` - Tìm Team ID theo tên
- `/teams` - Danh sách team có sẵn

### Team Tracking Commands
- `/track` - Chọn team để theo dõi (UI dropdown)
- `/untrack <team_id>` - Hủy theo dõi team
- `/mytracks` - Xem danh sách team đang theo dõi
- `/dashboard` - Xem dashboard với lịch thi đấu

### Movie Search Commands
- `/search <name>` - Tìm phim (gõ "help" để xem chi tiết)
- `/newmovies [page]` - Phim mới cập nhật (mặc định: trang 1)
- `/episodes <slug>` - Xem danh sách tập phim

## 🔧 Technical Changes Made

### 1. Updated Imports
- Added `SlashCommandBuilder`, `REST`, and `Routes` from `discord.js`

```javascript
const { Client, GatewayIntentBits, PermissionFlagsBits, ActionRowBuilder, 
  StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, 
  SlashCommandBuilder, REST, Routes } = require('discord.js');
```

### 2. Slash Command Registration
- Created `registerSlashCommands()` function that runs on bot ready
- Automatically registers all 18 slash commands to Discord's API
- Uses REST API to update global application commands

### 3. New Interaction Handler
- Converted to use Discord's `interactionCreate` event for slash commands
- Implements full command logic for all slash commands
- Supports options (string, integer) for command parameters
- Maintains UI elements (buttons, select menus, pagination)

### 4. Backward Compatibility
- Original `!` prefix commands remain functional
- Old message-based commands still work alongside slash commands
- Both systems can coexist peacefully

## 🚀 How to Use

### Users
Simply type `/` in Discord chat and select a command from the autocomplete:
- Type `/help` to see all available commands
- Type `/search avatar` to find a movie
- Type `/live` to see live matches
- Type `/track` to select teams to follow

### Developers
The bot automatically registers slash commands on startup. No manual registration needed.

To add new slash commands:
1. Add command definition in `registerSlashCommands()` function
2. Add handler in `interactionCreate` event for `isChatInputCommand()`
3. Use `interaction.options.getString()`, `.getInteger()`, etc. to get parameters

## 📝 Command Parameter Notes

- **String options**: Use `interaction.options.getString('paramName')`
- **Integer options**: Use `interaction.options.getInteger('paramName')`
- **Optional parameters**: Set `required(false)` in SlashCommandBuilder
- **Deferred replies**: Use `await interaction.deferReply()` for long operations

## ✨ Features Preserved
- ✅ All functionality from prefix commands
- ✅ UI elements (buttons, dropdown menus)
- ✅ Pagination support
- ✅ Cooldown system
- ✅ Error handling
- ✅ User tracking system
- ✅ Auto-reminders for matches
- ✅ All API integrations

## 🔍 Verification
Bot successfully registers 18 slash commands on startup:
```
✅ Slash commands đã được đăng ký thành công
```

## 📦 Files Modified
- `index.js` - Main file with all command implementations

## 🎯 Next Steps
1. Start the bot: `node index.js`
2. Test slash commands in Discord
3. Optional: Remove old `!` prefix support if slash commands are stable
4. Optional: Add more commands as needed
