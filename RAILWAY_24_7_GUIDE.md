# Chạy Discord Bot 24/7 trên Railway

## 1. Setup trên Railway Dashboard

### Bước 1: Tạo Project
- Truy cập [railway.app](https://railway.app)
- Click **"New Project"** → **"Deploy from GitHub"**
- Connect GitHub account và chọn repo `discord-bot-tai`

### Bước 2: Environment Variables
Sau khi project được tạo, vào **Variables** tab và thêm:

```
DISCORD_TOKEN=<your_bot_token>
FOOTBALL_API_KEY=<your_football_data_org_key>
```

**Lấy giá trị từ:**
- `DISCORD_TOKEN`: Discord Developer Portal → Applications → Your Bot → Token
- `FOOTBALL_API_KEY`: football-data.org → Account Settings → API Token

### Bước 3: Deploy Settings
Trong **Settings** tab:

- **Root Directory**: `.` (root)
- **Start Command**: `node index.js`
- Procfile sẽ được Railway tự nhận diện

### Bước 4: Enable 24/7 Service (Premium)
Railway cung cấp 2 tier:

**Free Tier:**
- ✅ $5/tháng credit (miễn phí lần đầu)
- ⚠️ Dừng sau 72 tiếng không hoạt động
- ✅ Thích hợp để test

**Hobby Tier:**
- ✅ $5/tháng hoặc trả theo giờ
- ✅ **Chạy 24/7 không gián đoạn**
- ✅ Recommended cho production

## 2. Cách chạy 24/7

### Option A: Upgrade lên Hobby Plan (Recommended)
1. Vào **Account Settings** → **Billing**
2. Click **"Upgrade to Hobby"**
3. Bot sẽ chạy liên tục

### Option B: Keep-alive Service (Free, nhưng rủi ro)
Thêm service ping mỗi 5 phút để tránh Railway tắt bot:

```javascript
// Thêm vào cuối index.js
const http = require('http');

setInterval(() => {
  // Self-ping để tránh bị tắt
  http.get('http://localhost:3000/ping', () => {});
}, 5 * 60 * 1000);
```

**Lưu ý:** Cách này không 100% reliable.

## 3. Monitoring & Logs

### Xem logs real-time
1. Vào Railway dashboard
2. Chọn project → **Deployments** tab
3. Xem **Logs** để debug

### Setup Alerts (Optional)
- Vào **Settings** → **Alerts**
- Nhận thông báo nếu deployment fail

## 4. Database Persistence

Config của bot lưu trong `config.json` (local file). Để data persist across restarts:

**Option 1: Commit config.json vào Git** (hiện tại)
- ✅ Simple nhất
- ⚠️ Có thể conflict khi multiple instances

**Option 2: Dùng Railway Volumes** (Recommended)
1. Vào project **Variables** tab
2. Add **Volume**: `/app/config.json` → mount point
3. Data sẽ persist giữa restarts

## 5. Testing Deployment

```bash
# Test build locally
npm install

# Test chạy bot
node index.js

# Check logs trên Railway
```

## 6. Troubleshooting

| Vấn đề | Giải pháp |
|--------|---------|
| Bot stop sau 72h | Upgrade Hobby plan |
| Config.json missing | Commit file vào Git |
| Env variables wrong | Check Railway Variables tab |
| Bot disconnected | Xem logs, check Discord token |
| Memory error | Upgrade Railway plan |

## 7. Cost Estimate

- **Free Tier**: $0 (5 credit/tháng, đủ test)
- **Hobby Tier**: $5/tháng (24/7 guarantee)
- **Pro Tier**: $20/tháng (multiple apps + priority)

## 8. Quick Deploy Checklist

- [ ] `.env` file có `DISCORD_TOKEN` và `FOOTBALL_API_KEY`
- [ ] `Procfile` đúng: `worker: node index.js`
- [ ] `package.json` có all dependencies
- [ ] `config.json` committed to Git
- [ ] GitHub repo connected to Railway
- [ ] Environment Variables setup trên Railway
- [ ] Start bot: Railway sẽ auto-deploy khi push
- [ ] Check logs xem có errors

## 9. Auto-Deploy on Git Push

Railway tự động deploy khi bạn push:
```bash
git add .
git commit -m "Your message"
git push origin main
```

Bot sẽ tự-restart với code mới trong ~2 phút.
