# Kế hoạch: bản web để dạy và bản web để học viên làm bài

Trạng thái: **kế hoạch, chưa làm**. Khi bắt đầu làm, các quyết định ở mục 2 được
chuyển vào `ARCHITECTURE.md` (mục 1 và mục 12) và file này chỉ còn theo dõi tiến độ.

Hai việc, độc lập nhau về giá trị sử dụng:

1. **Trình chiếu trên web**: đăng bài học lên mạng để giáo viên dạy ở bất kỳ đâu.
2. **Bài tập cho học viên**: giáo viên soạn đề trong app, giao một đường link,
   học viên mở link, nhập tên, làm bài và nộp; giáo viên xem điểm.

Soạn bài và soạn đề **vẫn chỉ làm trong app desktop**. Web chỉ có phần xem và làm bài.

---

## 1. Cái đã có sẵn

- `core/`, `renderer/`, `templates/` là TypeScript thuần, chạy được trong trình duyệt.
- `src/platform/browser.ts` đã có bản lưu trữ chạy trên trình duyệt.
- Export tạo ra một file HTML độc lập kèm runtime, nên trình chiếu trên web dùng
  lại chính renderer và runtime này.
- Ảnh và audio đã đặt tên theo hash, hợp để lưu thành file riêng trên CDN.
- Mạng (Bing, Google Dịch) chỉ đi qua Rust (`web.rs`), nên không lẫn vào bản web.

## 2. Quyết định

| Hạng mục | Quyết định | Lý do |
| --- | --- | --- |
| Hosting | Cloudflare: Pages + Workers + D1 + R2 | Một nhà cung cấp; R2 không tính phí băng thông ra (hợp audio); không bị tạm dừng khi lâu không dùng như gói free của Supabase |
| Không dùng Supabase | Học viên chỉ nhập tên, không cần hệ thống tài khoản | Phần mạnh nhất của Supabase (Auth) không cần đến |
| Người xem bản trình chiếu | Chỉ giáo viên | Đặt sau một mật khẩu trong Worker (Cloudflare Access là phương án sau, xem mục 6) |
| Định danh học viên | Chỉ nhập tên, không tài khoản | Đơn giản cho lớp trẻ em |
| Xáo trộn | Là **lựa chọn của đề**: xáo thứ tự câu, xáo thứ tự đáp án, mỗi cái bật/tắt riêng | Giáo viên quyết định theo từng đề |
| Chấm điểm | **Phía server (Worker)**; bản gửi cho học viên không chứa đáp án đúng | Học viên không mở DevTools để xem đáp án |
| Loại tài liệu | `ExerciseDocument` riêng, không nhồi vào slide | Bài làm (nhiều phần, audio, đồng hồ, nộp bài) khác hẳn slide do giáo viên điều khiển |
| Soạn thảo | Chỉ trên desktop | Bing, Google Dịch, thư viện bài nằm trong Rust |

Giới hạn gói free của Cloudflare thay đổi theo thời gian; kiểm tra lại trên trang
giá trước khi bắt đầu từng giai đoạn.

## 3. Kiến trúc

```
App desktop (Tauri)                 Cloudflare
┌───────────────────┐   đăng bài    ┌──────────────────────────┐
│ Editor bài học    │ ────────────▶ │ Worker (API)             │
│ Editor bài tập    │               │   ├ R2: lesson + assets  │
└───────────────────┘               │   └ D1: assignments,     │
                                    │         submissions      │
Trình duyệt giáo viên ◀──────────── │ Pages: viewer, student,  │
  (viewer, bảng điểm)  sau mật khẩu │        teacher dashboard │
Trình duyệt học viên  ◀──────────── │                          │
  (link làm bài, nhập tên)          └──────────────────────────┘
```

Ba trang web cùng một repo, ba entry Vite: `viewer` (trình chiếu), `student` (làm
bài), `teacher` (bảng điểm). Dùng chung `core/` và `renderer/` với app.

## 4. Giai đoạn

### Giai đoạn 0: nền tảng
- Tạo project Cloudflare (Pages, Worker, D1, R2) và cấu hình triển khai.
- Thêm entry `viewer` vào Vite (chỉ renderer + runtime, không có editor).
- Quyết định chỗ đặt mã Worker (thư mục `worker/` trong repo).
- Kết quả: trang rỗng triển khai được, chạy cùng bộ test hiện có.

### Giai đoạn 1: trình chiếu trên web
- Nút **Đăng lên web** trong app: gửi `lesson.html` và các file `assets/` lên Worker,
  Worker ghi vào R2 theo `/lessons/<id>/…`. Chỉ tải lên file chưa có (so theo hash).
- Ảnh và audio để dạng file riêng, không nhúng `data:`, nên không vướng giới hạn
  ~50 MB của file export.
- Trang viewer: `/` liệt kê bài, `/l/<id>` trình chiếu; giữ phím Tiếp/Lùi, bút
  trình chiếu, màn đen/trắng.
- PWA: cache bài đã mở để dạy được khi mất mạng.
- Bảo vệ toàn bộ phần giáo viên bằng mật khẩu trong Worker (cookie phiên, giới hạn
  số lần thử sai).
- Gỡ bài khỏi web và đăng lại bản mới (cùng id) được.
- Kết quả: dạy được từ bất kỳ máy nào có trình duyệt.

### Giai đoạn 2: soạn đề trong app desktop
- Schema `ExerciseDocument` (Zod), có `schemaVersion` và migration như bài học:
  - Đề gồm nhiều **phần**; mỗi phần có tiêu đề, hướng dẫn, audio hoặc đoạn đọc chung.
  - Trong phần có các **câu hỏi**. Bản đầu: trắc nghiệm A/B/C/D, đáp án là chữ hoặc ảnh,
    có thể kèm audio riêng.
  - Cài đặt đề: nộp một lần hay cho làm lại, giới hạn thời gian (hoặc không),
    xáo thứ tự câu, xáo thứ tự đáp án,
    có cho xem đáp án và lời thoại sau khi nộp không.
  - Mỗi câu có giải thích và lời thoại (dùng ở màn kết quả).
- Màn hình soạn đề: dùng lại cách dựng form tự động của PropertiesPanel, asset
  manager, tìm ảnh, tạo giọng đọc.
- Nhập đề từ AI: prompt và validate như AI import hiện có, có ánh xạ lỗi.
- Test cho schema, validate, migration, lọc đáp án khỏi bản gửi học viên.
- Kết quả: tạo, lưu, mở lại được đề trong app.

### Giai đoạn 3: học viên làm bài
- Nút **Giao bài**: đăng đề lên Worker, trả về một link. Link khó đoán, không cho
  công cụ tìm kiếm lập chỉ mục.
- Worker:
  - `GET /a/<slug>`: trả đề **đã bỏ đáp án đúng**, áp dụng xáo trộn theo cài đặt.
  - `POST /a/<slug>/submit`: nhận tên, mã trình duyệt và đáp án, chấm, lưu một dòng
    mới vào D1 (không ghi đè lần trước), trả kết quả. Đề đặt "nộp một lần" thì từ chối
    khi mã trình duyệt đó đã nộp.
  - Giới hạn tần suất và kích thước, kiểm tra input bằng Zod.
- Giao diện học viên (ưu tiên điện thoại): nhập tên; trình phát audio có chỉnh tốc độ;
  đồng hồ đếm ngược; thanh tiến độ; tự lưu nháp vào `localStorage` để tải lại trang
  không mất bài; nút Nộp bài và Làm lại.
- Màn kết quả: điểm, Đúng/Sai từng câu, đáp án đúng, lời thoại, giải thích.
- Hết giờ thì tự nộp phần đã làm.
- Kết quả: giao link cho học viên, học viên nộp, điểm được lưu.

### Giai đoạn 4: bảng điểm và hoàn thiện
- Bảng giáo viên (sau mật khẩu): danh sách đề, danh sách bài nộp, điểm, câu nào sai
  nhiều nhất, xuất CSV.
- Xoá bài nộp, đóng/mở đề, hạn nộp.
- Thêm dạng câu hỏi: điền chỗ trống, sắp xếp câu, ghép cặp (đã có logic ở các
  template tương ứng).
- Sao lưu dữ liệu D1 về máy.

## 5. Rủi ro

| Rủi ro | Xử lý |
| --- | --- |
| Ảnh Bing và giọng Google Dịch lộ hơn khi đưa lên web công khai | Bài sau mật khẩu; link đề khó đoán; `noindex`. Người dùng đã chấp nhận rủi ro bản quyền khi dùng nội bộ, nhưng cần xác nhận lại khi đăng công khai |
| Link đề bị chia sẻ rộng | Cho đóng đề, đặt hạn nộp, giới hạn tần suất |
| Học viên nộp nhiều lần, hoặc trùng tên | Lưu mọi lần nộp; mỗi trình duyệt có một mã ngẫu nhiên để phân biệt các em trùng tên; đề chọn cho nộp một lần hay nhiều lần |
| Bài đã đăng không tương thích sau khi đổi schema | Migration theo `schemaVersion` cho cả bài học và đề |
| Hết hạn mức gói free | Theo dõi dung lượng R2 và số lượt gọi Worker; nén ảnh và audio trước khi tải lên |
| Khác biệt Safari/Chrome (audio, fullscreen) | Thử trên cả hai trước khi coi giai đoạn là xong |

## 6. Còn mở

- Đã chốt: dùng tên miền `*.pages.dev` miễn phí.
- Phần giáo viên: đề xuất mật khẩu trong Worker (không tốn gì, không phụ thuộc tên
  miền). Cloudflare Access có gói free (~50 người) nhưng cần kiểm tra có bảo vệ được
  `*.pages.dev` không và có đòi thẻ thanh toán không; cân nhắc khi mua tên miền riêng.
- Đã chốt cách xử lý nộp lại (mục 4, Giai đoạn 3): lưu mọi lần nộp; bảng điểm
  mặc định hiện lần cuối, kèm số lần làm và điểm cao nhất.
