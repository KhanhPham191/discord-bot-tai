# 📢 Hướng Dùng /track-team + Channel/DM Preferences

## Cách 1: Dùng `/track` (UI Dropdown)

**Bước 1:** Gõ lệnh
```
/track
```

**Bước 2:** Bot hiển thị dropdown với danh sách team
```
⚽ Chọn đội bóng muốn theo dõi:
[Dropdown menu]
```

**Bước 3:** Chọn team (VD: Chelsea)

**Bước 4:** Bot hiển thị 2 nút để chọn cách nhận thông báo
```
🎯 Chọn cách nhận thông báo cho Chelsea:
📢 Kênh - nhận thông báo ở đây
💬 DM - nhận tin nhắn riêng

[📢 Kênh]  [💬 Tin nhắn riêng]
```

**Bước 5:** Bấm nút theo ý thích
```
✅ Đang theo dõi Chelsea
📢 Nhận thông báo ở kênh này
```

---

## Cách 2: Dùng `/track-team` (Direct Command)

**Để nhận thông báo ở kênh:**
```
/track-team team_id:61 notification:channel
```
→ `✅ Đang theo dõi Chelsea | 📢 Nhận thông báo ở kênh`

**Để nhận thông báo qua DM:**
```
/track-team team_id:61 notification:dm
```
→ `✅ Đang theo dõi Chelsea | 💬 Nhận thông báo qua tin nhắn riêng`

**Nếu không chọn preference (default = channel):**
```
/track-team team_id:61
```
→ Thêm Chelsea, nhận notification ở kênh

---

## Xem Danh Sách Teams Đang Theo Dõi

```
/mytracks
```

**Output:**
```
📋 Danh sách team bạn theo dõi:
📢 Chelsea
💬 Manchester City
📢 Liverpool

📢 = Kênh | 💬 = DM

Dùng `/untrack <team_id>` để xóa.
```

---

## Hủy Theo Dõi

```
/untrack team_id:61
```
→ `✅ Đã hủy theo dõi Chelsea`

---

## Thay Đổi Preference (Change Channel ↔️ DM)

Chỉ cần re-track team với preference khác:

**Hiện tại:** Chelsea → DM (💬)
```
/track-team team_id:61 notification:channel
```
→ Preference tự động update thành Channel (📢)

---

## Team IDs (Ví Dụ)

| Team | ID |
|------|-----|
| Chelsea | 61 |
| Manchester City | 65 |
| Manchester United | 66 |
| Liverpool | 64 |
| Arsenal | 57 |
| Bayern Munich | 40 |

**Tìm team ID:**
```
/findteam chelsea
```

---

## ⏰ Khi Nào Bot Gửi Thông Báo?

1. **24h trước trận:** ⏰ Nhắc nhở trận sắp bắt đầu
   - Nếu user chọn **DM** → Gửi tin nhắn riêng
   - Nếu user chọn **Channel** → Gửi ở kênh

2. **30p trước trận:** 👥 Đội hình
   - Gửi tới configured channels (informational)

3. **Live matches:** 🔄 Cập nhật tỷ số
   - Gửi tới configured channels

---

## 🎯 Ví Dụ Thực Tế

**User: Tôi muốn:**
- Nhận thông báo Chelsea ở **DM** (vì spam)
- Nhận thông báo Man City ở **kênh** (vì hay)
- Không theo dõi Liverpool

**Cách làm:**
```
/track-team team_id:61 notification:dm
/track-team team_id:65 notification:channel
```

**Kiểm tra:**
```
/mytracks
→
💬 Chelsea
📢 Manchester City
```

---

## ❌ Lỗi Thường Gặp

### "❌ Không tìm thấy team với ID..."
- Kiểm tra Team ID đúng chưa
- Dùng `/findteam chelsea` để tìm ID

### Không nhận thông báo
- Kiểm tra bot có permission gửi DM không
- Nếu chọn Channel → Kiểm tra bot có access kênh không
- Chạy `/mytracks` xem team đã được thêm chưa

---

## 💡 Tips

- **Default preference:** `channel` nếu không chọn
- **Re-track:** Có thể track cùng team nhiều lần, chỉ update preference
- **Backward compatible:** Old format still works
- **Real-time save:** Config lưu ngay, không cần restart
