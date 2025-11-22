# Track-Team Refactor - Channel/DM Preference System

## ✅ Hoàn Thành

### 1. **Slash Commands Mới**
#### `/track-team <team_id> [notification]`
- Theo dõi team với chọn lựa nhận thông báo
- Options:
  - `team_id` (required): ID của team
  - `notification` (optional): `channel` (📢) hoặc `dm` (💬)
- Default: `channel` nếu không chọn

**Ví dụ:**
```
/track-team team_id:61 notification:dm
→ Theo dõi Chelsea, nhận thông báo qua DM

/track-team team_id:61 notification:channel
→ Theo dõi Chelsea, nhận thông báo ở kênh
```

### 2. **Cập Nhật Config Structure**
**Old Format (Still Supported):**
```json
{
  "userTrackedTeams": {
    "userId": [61, 65, 66]
  }
}
```

**New Format (Backward Compatible):**
```json
{
  "userTrackedTeams": {
    "userId": {
      "61": { "preference": "channel" },
      "65": { "preference": "dm" },
      "66": { "preference": "channel" }
    }
  }
}
```

**Auto-Migration:** Old format tự động convert sang new format khi app run.

### 3. **Helper Functions**

| Function | Purpose |
|----------|---------|
| `getUserTrackedTeams(userId)` | Get array of tracked team IDs |
| `getUserTrackedTeamsWithPreferences(userId)` | Get `{teamId: {preference}}` object |
| `getUserTeamPreference(userId, teamId)` | Get preference for specific team |
| `addUserTrackedTeam(userId, teamId, preference)` | Add team with preference |
| `setUserTeamPreference(userId, teamId, preference)` | Update preference |
| `removeUserTrackedTeam(userId, teamId)` | Remove team |

### 4. **User Interactions**

#### Via `/track` (Dropdown UI)
1. User chạy `/track`
2. Bot hiển thị dropdown chọn team
3. Sau khi chọn → Bot hiển thị 2 nút:
   - 📢 Kênh (Channel)
   - 💬 Tin nhắn riêng (DM)
4. User bấm nút → Team được thêm với preference

#### Via `/track-team` (Direct Command)
```
/track-team team_id:61 notification:dm
→ Thêm Chelsea, nhận DM
```

### 5. **Notification System**

**Match Reminder (24h trước):**
- ✅ Check user preference (`channel` or `dm`)
- ✅ Gửi DM nếu user chọn `dm`
- ✅ Gửi kênh nếu user chọn `channel`
- Chạy mỗi 15 phút, kiểm tra trận đấu trong 24h tới

**Lineup Notification (30p trước):**
- Vẫn gửi tới configured channels (informational, không user-specific)

### 6. **Updated Commands**

#### Slash Commands
- `/track` → Hiển thị dropdown, sau chọn show preference buttons
- `/track-team` → Direct add với preference choice
- `/untrack <team_id>` → Xóa team
- `/mytracks` → Hiển thị danh sách với emoji preference (📢 hoặc 💬)

#### Prefix Commands (Backward Compatible)
- `!track` → Hiển thị dropdown (same as slash)
- `!untrack <team_id>` → Xóa team
- `!mytracks` → Hiển thị danh sách với emoji preference

### 7. **Button Handlers**
- `track_pref_channel_<teamId>` → Set preference = channel
- `track_pref_dm_<teamId>` → Set preference = dm

Auto-delete public confirmations sau 5 giây.

## 🔄 Backward Compatibility

✅ Old format arrays automatically convert to new object format
✅ Existing tracked teams default to `channel` preference
✅ All existing commands still work
✅ Preference defaults to `channel` if not set

## 📊 Real-time Save

- ✅ Config lưu ngay khi user chọn preference
- ✅ Không cần reload bot
- ✅ Persistent qua restart

## 🧪 Testing Checklist

```
- [ ] `/track-team 61 dm` → Adds Chelsea with DM preference
- [ ] `/track-team 65 channel` → Adds Man City with Channel preference
- [ ] `/track` → Shows dropdown, then preference buttons
- [ ] `/mytracks` → Shows all teams with emoji (📢 or 💬)
- [ ] `!track` → Works same as slash command
- [ ] Match reminder sends to DM for DM-preference teams
- [ ] Match reminder sends to channel for channel-preference teams
- [ ] Untrack removes preference too
- [ ] Old config format still works
```

## 📝 Notes

1. **Notification Types:**
   - `dm`: Gửi tin nhắn riêng tới user
   - `channel`: Gửi tới configured footballReminder channels

2. **Default Behavior:**
   - Nếu user không chọn preference → Default `channel`
   - Nếu không có configured channels + user chọn channel → Fallback to DM

3. **Real-time Config:**
   - All changes automatically saved to config.json
   - No caching needed, direct file writes

4. **Preference Change:**
   - User có thể re-track team với preference khác
   - Sẽ update preference thay vì duplicate

## 🚀 Next Steps (Optional)

- [ ] Add `/setpreference <team_id> <channel|dm>` để change preference
- [ ] Add preference management UI (buttons để toggle)
- [ ] Per-league preferences (all Premier League teams → DM, etc.)
