# 🚀 Hướng dẫn Tối ưu Tốc độ Tìm kiếm Phim

## 🔍 Vấn đề Hiện Tại

### 1. **Bottleneck Chính: Fetch chi tiết phim khi hiển thị danh sách tìm kiếm**
```javascript
// ❌ SLOW - Dòng 1732-1750
for (let idx = 0; idx < movies.length; idx++) {
  const movie = movies[idx];
  // ...
  const detail = await getMovieDetail(slug); // ⏱️ API call cho MỖI phim!
  // Lấy totalEpisodes, category...
}
```

**Vấn đề:** 
- Tìm kiếm 10 phim = 10 API calls liên tiếp
- Mỗi call mất ~500ms - 1s
- Tổng cộng: 5-10 giây chỉ để hiển thị danh sách
- Người dùng phải chờ rất lâu

### 2. **Không Parallel hóa API calls**
- Các API calls được gọi tuần tự (`await` trong loop)
- Có thể parallelize bằng `Promise.all()`

### 3. **Cache không hiệu quả**
- Cache TTL 30 giây quá ngắn
- Không cache kết quả tìm kiếm (chỉ cache detail)

---

## ✅ Giải pháp Tối ưu

### **Cách 1: Xóa fetch detail không cần thiết khi hiển thị danh sách (⭐ NHANH NHẤT)**

**Thay vì fetch detail từng phim, chỉ hiển thị thông tin có sẵn:**

```javascript
// ✅ FAST - Không fetch detail
for (let idx = 0; idx < movies.length; idx++) {
  const movie = movies[idx];
  
  // Lấy thông tin từ search result (KHÔNG fetch detail)
  const title = movie.name || movie.title || 'Unknown';
  const year = movie.year || 'N/A';
  
  // Không fetch category và totalEpisodes tại đây
  // Người dùng sẽ thấy khi click vào chi tiết phim
  
  description += `${movieNum}. **${title}**\n`;
  if (year !== 'N/A') {
    description += `📅 ${year}\n\n`;
  }
}
```

**Lợi ích:**
- ⚡ Load danh sách tìm kiếm: ~1-2 giây (thay vì 5-10s)
- Chỉ fetch detail khi user click vào phim cụ thể

---

### **Cách 2: Parallel hóa API calls (nếu vẫn cần fetch detail)**

```javascript
// ✅ FASTER - Fetch detail song song
const movieDetails = await Promise.all(
  movies.map(movie => 
    movie.slug ? getMovieDetail(movie.slug) : Promise.resolve(null)
  )
);

for (let idx = 0; idx < movies.length; idx++) {
  const movie = movies[idx];
  const detail = movieDetails[idx];
  
  const title = movie.name || movie.title || 'Unknown';
  const year = movie.year || 'N/A';
  const totalEpisodes = detail?.total_episodes || 'N/A';
  const category = detail?.category?.[1]?.list?.[0]?.name || 'N/A';
  
  description += `${movieNum}. **${title}**\n`;
  description += `📅 ${year} | 📺 ${category} | 🎬 ${totalEpisodes} tập\n\n`;
}
```

**Lợi ích:**
- Tốc độ: ~2-3 giây (thay vì 5-10s)
- Vẫn hiển thị thông tin chi tiết

---

### **Cách 3: Tăng Cache TTL (Simple nhất)**

```javascript
// ❌ Current
const REQUEST_CACHE_TTL = 30 * 1000; // 30 seconds

// ✅ Better
const REQUEST_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
```

**Lợi ích:**
- Nếu tìm kiếm lại phim trong 5 phút, kết quả tức thì
- Không tốn thêm API call

---

### **Cách 4: Thêm Response Caching cho Search API**

```javascript
// movies.js - Thêm cache cho search results

const searchCache = new Map();
const SEARCH_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function searchMovies(keyword, maxResults = 100) {
  // ✅ Kiểm tra cache trước
  const cacheKey = `search_${keyword}_${maxResults}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL) {
    console.log(`📦 [SEARCH CACHE HIT] ${keyword}`);
    return cached.data;
  }

  // ... API call logic ...
  
  // ✅ Cache kết quả
  searchCache.set(cacheKey, {
    data: allMovies.slice(0, maxResults),
    timestamp: Date.now()
  });
  
  return allMovies.slice(0, maxResults);
}

// Clean up cache
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of searchCache.entries()) {
    if (now - value.timestamp > SEARCH_CACHE_TTL) {
      searchCache.delete(key);
    }
  }
}, 10 * 60 * 1000); // Check every 10 minutes
```

---

### **Cách 5: Lazy Load - Chỉ fetch detail khi user scroll/click**

```javascript
// index.js - Khi user click vào phim

movieCollector.on('collect', async (buttonInteraction) => {
  // User click -> LÚC ĐÓ mới fetch detail
  // Có thể show loading indicator
  await buttonInteraction.deferReply(); // Show "đang tải..."
  
  const detail = await getMovieDetail(slug); // Fetch khi cần
  
  await buttonInteraction.editReply({
    embeds: [movieDetail],
    components: [serverRow]
  });
});
```

---

## 📊 So Sánh Tốc độ

| Phương pháp | Danh sách | Click phim | Tổng |
|-----------|----------|-----------|------|
| Hiện tại | 5-10s | 1-2s | 6-12s |
| Cách 1 (⭐ Best) | 1-2s | 1-2s | 2-4s |
| Cách 2 | 2-3s | 1-2s | 3-5s |
| Cách 3 | 5-10s → ~0s (nếu cache hit) | 1-2s | 5-12s / 1-2s |
| Cách 4 | 1-2s (+ cache) | 1-2s | 2-4s / ~0s (cache hit) |
| Cách 5 | 1-2s | 1-2s | 2-4s |

---

## 🎯 Khuyến Cáo

### **Triển khai ngay:**
1. **Cách 1** (Xóa fetch detail không cần thiết) - Tăng 5x tốc độ, dễ implement
2. **Cách 4** (Cache search results) - Thêm ~1-2 phút code

### **Kết hợp tốt nhất:**
```
Cách 1 (lazy load) + Cách 4 (search cache) + Cách 3 (tăng TTL)
↓
Danh sách: 1-2s | Click phim: 1-2s | Repeat search: ~0s
```

---

## 🔧 Implementation Priority

**P1 (Ngay lập tức):**
- ✅ Xóa fetch detail khi hiển thị danh sách (Cách 1)

**P2 (Tiếp theo):**
- ✅ Thêm cache cho search results (Cách 4)
- ✅ Tăng REQUEST_CACHE_TTL (Cách 3)

**P3 (Nice to have):**
- ✅ Parallel hóa API calls nếu vẫn cần detail (Cách 2)
- ✅ Show loading indicator (Cách 5)

---

## 📝 Lưu ý

- **Rate Limiting:** API `phim.nguonc.com` có rate limit. Cách 1 & 4 giúp tránh vượt quá
- **User Experience:** Lazy load (Cách 1) tốt hơn hiển thị tất cả detail (người dùng thấy kết quả ngay)
- **Fallback:** Nếu API timeout, hiển thị dữ liệu có sẵn từ search result
