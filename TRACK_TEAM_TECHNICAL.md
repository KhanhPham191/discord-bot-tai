# Technical Details - Track Team Refactor

## Architecture Overview

```
User Action
    ↓
/track or /track-team
    ↓
track_team_select (dropdown) OR direct command
    ↓
Show preference buttons (📢 Channel | 💬 DM)
    ↓
track_pref_channel_<teamId> or track_pref_dm_<teamId>
    ↓
addUserTrackedTeam(userId, teamId, preference)
    ↓
Config saved (config.json)
    ↓
Later: Auto-reminder checks getUserTeamPreference()
    ↓
Send to Channel (📢) or DM (💬)
```

## Data Flow

### 1. Adding a Team
```javascript
// User interaction
interaction.values[0]  // e.g., "61" (Chelsea)
↓
// Show buttons
track_pref_channel_61
track_pref_dm_61
↓
// User clicks button
addUserTrackedTeam(userId, 61, 'channel')
↓
// Config structure updated
config.userTrackedTeams[userId][61] = { preference: 'channel' }
↓
// Saved to file
saveConfig()
```

### 2. Getting Preferences
```javascript
// Later: When reminder runs
getUserTeamPreference(userId, teamId)
  ↓
getUserTrackedTeamsWithPreferences(userId)
  ↓
Returns: { 61: {preference: 'channel'}, 65: {preference: 'dm'} }
  ↓
Returns: 'channel' for teamId 61
↓
if (preference === 'dm') {
  user.send(embed)  // DM
} else {
  channel.send(embed)  // Channel
}
```

## Key Functions

### addUserTrackedTeam(userId, teamId, preference = 'channel')
```javascript
// Ensures object format (not array)
// If old array format exists, converts to object
// Sets preference for team
// Auto-saves config
```

### getUserTeamPreference(userId, teamId)
```javascript
// Returns 'channel' or 'dm'
// Handles auto-migration from old format
// Safe - defaults to 'channel' if not found
```

### setUserTeamPreference(userId, teamId, preference)
```javascript
// Updates existing team preference
// Used for changing DM ↔️ Channel
// Saves config
```

### getUserTrackedTeamsWithPreferences(userId)
```javascript
// Returns full preferences object:
// {
//   61: { preference: 'channel' },
//   65: { preference: 'dm' }
// }
// Auto-migrates old array format
```

## Format Migration

### Old Format (Array)
```json
{
  "userTrackedTeams": {
    "userId": [61, 65, 66]
  }
}
```

### New Format (Object with Preferences)
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

### Auto-Migration Process
When `getUserTrackedTeamsWithPreferences()` is called:
1. Checks if format is array (old)
2. If array: Converts to object with all defaulting to 'channel'
3. Saves new format back to config.json
4. Returns new object format

**Result:** Seamless upgrade, no manual migration needed

## Notification Flow

### Match Reminder (Every 15 minutes)
```
for each user in config.userTrackedTeams:
  for each team in user's tracked teams:
    for each upcoming match (within 24h):
      get preference = getUserTeamPreference(userId, teamId)
      
      if preference === 'dm':
        user.send(embed)
      else:
        for each channel in footballReminder.channels:
          channel.send(embed)
```

### Lineup Notification (Every 15 minutes, 30min before match)
```
// Still sends to configured channels only
// (Independent of user preference - informational)
for each channel in footballReminder.channels:
  send lineups to channel
```

## Interaction Handlers

### 1. track_team_select (Dropdown)
- User selects team from dropdown
- Shows 2 buttons for preference
- Awaits button click

### 2. track_pref_channel_<teamId> (Button)
- addUserTrackedTeam(userId, teamId, 'channel')
- Sends confirmation
- Public message (5s auto-delete)

### 3. track_pref_dm_<teamId> (Button)
- addUserTrackedTeam(userId, teamId, 'dm')
- Sends confirmation
- Public message (5s auto-delete)

## Config Structure

```json
{
  "userTrackedTeams": {
    "userId_string": {
      "teamId_string": {
        "preference": "channel|dm"
      }
    }
  }
}
```

**Example:**
```json
{
  "userTrackedTeams": {
    "322648312958287872": {
      "61": { "preference": "channel" },
      "65": { "preference": "dm" }
    },
    "418995467720982561": {
      "66": { "preference": "channel" },
      "65": { "preference": "channel" }
    }
  }
}
```

## Helper Functions Summary

| Function | Input | Output | Purpose |
|----------|-------|--------|---------|
| `getUserTrackedTeams(userId)` | userId | `[61, 65]` | Get team IDs only |
| `getUserTrackedTeamsWithPreferences(userId)` | userId | `{61: {preference: 'channel'}}` | Get with preferences |
| `getUserTeamPreference(userId, teamId)` | userId, teamId | `'channel'\|'dm'` | Get one preference |
| `addUserTrackedTeam(userId, teamId, pref)` | userId, teamId, preference | void | Add/update team |
| `setUserTeamPreference(userId, teamId, pref)` | userId, teamId, preference | void | Update preference |
| `removeUserTrackedTeam(userId, teamId)` | userId, teamId | void | Remove team |

## Backward Compatibility Checklist

- ✅ Old array format still works
- ✅ Auto-converts on first access
- ✅ All old commands still work
- ✅ New commands coexist with old
- ✅ Preference defaults to 'channel'
- ✅ No breaking changes to API

## Testing Scenarios

### Scenario 1: New User
```
/track → select Chelsea → click DM button
→ Chelsea added with 'dm' preference
→ Future reminders send to DM
```

### Scenario 2: Old Format User Upgrading
```
// Old config: userTrackedTeams[userId] = [61, 65]
/mytracks
→ Auto-migrated to new format
→ Defaults both to 'channel'
→ Shows: 📢 Chelsea, 📢 Man City
```

### Scenario 3: Change Preference
```
User has: Chelsea (dm), Man City (channel)
/track-team team_id:61 notification:channel
→ Preference updates: Chelsea (channel)
/mytracks shows: 📢 Chelsea, 📢 Man City
```

### Scenario 4: Direct Command
```
/track-team team_id:65 notification:dm
→ Man City added with 'dm' preference
→ No dropdown, no buttons, direct add
```

## Error Handling

1. **Invalid team ID:**
   - Check config.livescoreTeams
   - Reply: "❌ Không tìm thấy team với ID..."

2. **User not found:**
   - Try to fetch user
   - Log warning, skip

3. **Channel not found:**
   - Try to fetch channel
   - Log warning, skip
   - Fallback to DM if configured

4. **Format migration failed:**
   - Log error but continue
   - Use safe defaults

## Performance Notes

- Object format: O(1) lookup for preferences
- Auto-migration: Happens once per user
- Saved to file: Real-time, but batched in practice
- No caching: Direct config access (simple, safe)

## Future Improvements

1. **Batch notifications:**
   - Group multiple match reminders
   - Send once per user instead of per team

2. **Per-league preferences:**
   - Set default for all PL teams
   - Override per-team

3. **Notification scheduling:**
   - Quiet hours (e.g., 11pm-8am)
   - Channel vs DM based on time

4. **Analytics:**
   - Track which users prefer DM vs Channel
   - Optimize notification frequency

5. **UI improvements:**
   - Toggle button to switch preference
   - Edit command to batch-update
