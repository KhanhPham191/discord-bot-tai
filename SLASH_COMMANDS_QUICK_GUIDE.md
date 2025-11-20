# 🎉 Slash Commands - Hướng Dẫn Nhanh

## Thay Đổi Chính
Bot của bạn giờ đã hỗ trợ **slash commands** (`/command`) thay vì chỉ có prefix commands (`!command`).

## ✨ Các Lệnh Mới (Slash Commands)

### Lệnh Cơ Bản
| Lệnh | Mô Tả |
|------|-------|
| `/ping` | Kiểm tra bot sống hay không |
| `/hello` | Bot chào bạn |
| `/echo <nội dung>` | Bot lặp lại câu bạn nói |
| `/help` | Xem tất cả các lệnh |

### Lệnh Bóng Đá ⚽
| Lệnh | Mô Tả |
|------|-------|
| `/live` | Xem trận đang diễn ra |
| `/standings <league_code>` | Bảng xếp hạng |
| `/fixtures [team_id]` | Lịch thi đấu sắp tới |
| `/lineup <match_id>` | Xem line-up trước trận |
| `/findteam <name>` | Tìm Team ID |
| `/teams` | Danh sách team |

### Lệnh Theo Dõi Team 📍
| Lệnh | Mô Tả |
|------|-------|
| `/track` | Chọn team để theo dõi |
| `/untrack <team_id>` | Hủy theo dõi team |
| `/mytracks` | Xem danh sách team đang theo dõi |
| `/dashboard` | Xem dashboard với lịch thi đấu |

### Lệnh Phim 🎬
| Lệnh | Mô Tả |
|------|-------|
| `/search <name>` | Tìm phim |
| `/newmovies [page]` | Phim mới cập nhật |

## 🚀 Cách Sử Dụng

1. **Gõ `/` trong Discord chat**
   - Bot sẽ hiển thị danh sách các lệnh có sẵn
   - Bạn có thể tìm kiếm lệnh bằng tên

2. **Chọn lệnh từ danh sách**
   - Discord sẽ hiển thị mô tả của lệnh
   - Nhập các tham số cần thiết

3. **Nhấn Enter để thực thi**
   - Lệnh sẽ được thực hiện ngay lập tức

## 📝 Ví Dụ

```
/search avatar        - Tìm phim "avatar"
/live                 - Xem trận đang diễn ra
/standings PL         - Xem bảng xếp hạng Premier League
/fixtures 11         - Xem lịch thi đấu của team ID 11
/track               - Chọn team để theo dõi
```

## ✅ Lợi Ích Của Slash Commands

- ✅ **Gợi ý tự động** - Discord hiển thị các lệnh có sẵn
- ✅ **Mô tả rõ ràng** - Biết chính xác cần nhập gì
- ✅ **Dễ sử dụng** - Không cần nhớ cú pháp chính xác
- ✅ **Nhanh hơn** - Ít gõ hơn, đầy đủ thông tin hơn
- ✅ **Hỗ trợ tham số** - Dễ dàng chỉ định các tùy chọn

## 🔄 Lưu Ý Quan Trọng

- **Lệnh cũ `!` vẫn hoạt động** - Backward compatibility được giữ lại
- **Cả hai hệ thống có thể dùng cùng lúc** - Chọn cách nào bạn thích
- **Slash commands là cách hiện đại hơn** - Khuyên dùng slash commands

## 📞 Hỗ Trợ

Nếu gặp vấn đề gì:
1. Gõ `/help` để xem tất cả lệnh
2. Đảm bảo bot có quyền truy cập trong channel
3. Kiểm tra xem API key có được set đúng không

---

**Bot Version**: Slash Commands v1.0  
**Status**: ✅ Hoạt động bình thường
