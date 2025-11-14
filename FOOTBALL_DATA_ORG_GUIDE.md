# Football-Data.org API Guide

## Bot đã chuyển sang sử dụng [football-data.org](https://www.football-data.org/)

### Thay đổi chính:

1. **API Key**: Bây giờ dùng API key từ football-data.org thay vì api-sports.io
2. **Authentication**: Dùng header `X-Auth-Token` thay vì `x-apisports-key`
3. **URL Base**: `https://api.football-data.org/v4`

### Team IDs (Mẫu):

```
Chelsea: 49
Manchester United: 66
Manchester City: 65
Liverpool: 64
Arsenal: 57
```

Tìm Team ID: `!findteam <tên_đội>`

### Competition Codes (Giải Đấu):

```
PL    - Premier League
EL1   - La Liga
SA    - Serie A
BL1   - Bundesliga
FL1   - Ligue 1
PD    - Primeira Liga
EC    - Champions League
```

### Lệnh Bot

#### 1. `!live [competition_code]`
Xem trận đấu đang diễn ra
```
!live PL          # Trận đấu live Premier League
!live EC          # Trận đấu live Champions League
```

#### 2. `!findteam <tên_đội>`
Tìm Team ID của một đội
```
!findteam Chelsea
!findteam Manchester
```

#### 3. `!fixtures <team_id>`
Xem lịch thi đấu sắp tới
```
!fixtures 49      # Lịch Chelsea
!fixtures 65      # Lịch Man City
```

#### 4. `!livescore <team_id>`
Xem trận đấu live hoặc kết quả mới nhất
```
!livescore 49     # Score Chelsea
```

#### 5. `!standings <competition_code>`
Xem bảng xếp hạng
```
!standings PL     # Bảng Premier League
!standings EL1    # Bảng La Liga
```

### Cấu hình (.env)

```env
DISCORD_TOKEN=your_discord_token
FOOTBALL_API_KEY=93431cc3582947289d62d821712cf0e4
FOOTBALL_API_URL=https://api.football-data.org/v4
```

### Thay đổi trong config.json

`livescoreTeams` bây giờ dùng Team ID từ football-data.org:

```json
{
  "livescoreTeams": [
    { "id": 49, "name": "Chelsea", "enabled": true },
    { "id": 65, "name": "Manchester City", "enabled": true },
    { "id": 64, "name": "Liverpool", "enabled": true }
  ]
}
```

### API Plan

- **Free Plan**: Hỗ trợ đầy đủ
- **Giới hạn**: 10 requests/phút, 1000 requests/ngày
- **Ưu điểm**: Dữ liệu chính xác, cập nhật real-time

### Ghi chú

- Dùng Team ID (số) thay vì tên đội cho lệnh fixtures/livescore
- Competition codes luôn là chữ hoa (PL, EL1, SA, v.v.)
- Bot sẽ tự động cập nhật livescore 10 phút một lần
