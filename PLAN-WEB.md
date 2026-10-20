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
| Hosting | Cloudflare: Pages + Workers + D1 | Gói free, không cần thẻ; không bị tạm dừng khi lâu không dùng như gói free của Supabase |
| File ảnh và audio | **Backblaze B2**, region US West; Worker đứng trước để cache và trả `Range` | B2 free ~10 GB và không cần thẻ (R2 buộc phải thêm thẻ). Không có region châu Á nên cần cache của Cloudflare để học viên ở Việt Nam không phải chạy sang Mỹ mỗi lần |
| Không dùng Supabase | Học viên chỉ nhập tên, không cần hệ thống tài khoản | Phần mạnh nhất của Supabase (Auth) không cần đến |
| Người xem bản trình chiếu | Chỉ giáo viên | Đặt sau một mật khẩu trong Worker (Cloudflare Access là phương án sau, xem mục 7) |
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
│ Editor bài tập    │               │   ├ B2: lesson + assets  │
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
- Tạo project Cloudflare (Pages, Worker, D1) và cấu hình triển khai.
- Tạo bucket B2 (US West), khoá ứng dụng chỉ có quyền ghi vào đúng bucket đó, cấu
  hình CORS. Khoá lưu bằng secret của Worker, không đưa vào repo.
- Giao diện lưu file nhỏ (`put`, `get` có `Range`) bọc B2, để đổi nơi lưu về sau chỉ
  sửa một chỗ.
- Thêm entry `viewer` vào Vite (chỉ renderer + runtime, không có editor).
- Quyết định chỗ đặt mã Worker (thư mục `worker/` trong repo).
- Kết quả: trang rỗng triển khai được, chạy cùng bộ test hiện có.

### Giai đoạn 1: trình chiếu trên web
- Nút **Đăng lên web** trong app: gửi `lesson.html` và các file `assets/` lên Worker,
  Worker ghi vào B2 theo `/lessons/<id>/…`. Chỉ tải lên file chưa có (so theo hash).
  File lớn đẩy thẳng lên B2 bằng link có chữ ký do Worker cấp, không gửi qua Worker.
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
Chi tiết dạng câu hỏi, âm thanh, trải nghiệm làm bài ở mục 5; phần dưới là bản tóm tắt.
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

## 5. Chi tiết phần bài tập

### 5.1. Quan sát từ video tham khảo

Video chỉ để tham khảo **chức năng**, không phải mẫu giao diện để chép lại. Giao diện
học viên theo phong cách chung của app: dùng hệ theme hiện có (biến CSS, hình trang
trí, font Nunito, âm thanh phản hồi), để bài tập và bài giảng nhìn như cùng một bộ.
Mỗi đề chọn một theme như mỗi bài học. Bố cục ở mục 5.5 là gợi ý, được phép khác video.

Video là một đề thi thử HSK 5 (bài 1, 32 câu, 60 phút), dài khoảng 2 phút nên mới
thấy phần nghe và đầu phần đọc; phần 书写 (viết) chưa thấy. Những gì nhìn được:

- **Đầu đề:** thẻ tiêu đề (nhãn "mô phỏng", tên bài, cấp HSK, số câu, thời gian) và
  mục lục ba kỹ năng: 听力 nghe, 阅读 đọc, 书写 viết.
- **Thanh trên cùng cố định:** lùi 5 giây, chọn file nghe (听力 1, 听力 2), phát/dừng,
  thanh tua, âm lượng, tốc độ (1.0x–1.5x), đồng hồ đếm ngược, tiến độ "9/32".
- **Đề chia theo phần**, mỗi phần có dòng hướng dẫn (ví dụ "chọn đáp án đúng",
  "chọn từ điền vào chỗ trống") và khoảng số câu. Phần nghe có nút "Chọn phần nghe n"
  để nhảy tới file nghe tương ứng.
- **Câu trắc nghiệm** A/B/C/D xếp lưới 2×2, đáp án là chữ Hán; bấm để chọn, bấm lại
  để đổi, ô được chọn có viền nổi.
- **Thanh dưới cố định:** "Nộp bài" và "Làm lại".
- **Sau khi nộp:** mỗi câu hiện trạng thái, đáp án đúng, và câu đầy đủ (hoặc lời
  thoại) để đối chiếu.
- **Đồng hồ chạy từ câu trả lời đầu tiên**, ghi ở đầu đề.
- **Không có máy chủ:** bài được gửi cho giáo viên bằng nút "Tải phiếu gửi giáo
  viên". Bản của mình thay bằng gửi thẳng lên Worker, nhưng nên giữ nút tải phiếu làm
  dự phòng khi mất mạng.

### 5.2. Cấu trúc đề

```
ExerciseDocument
├─ settings      thời gian, xáo trộn, số lần nộp, số lần nghe, cho xem đáp án…
├─ tracks[]      file nghe: id, nhãn ("听力 1"), file, thời lượng, mốc từng câu (tuỳ chọn)
└─ parts[]       phần: kỹ năng (nghe/đọc/viết), tiêu đề, hướng dẫn
   ├─ trackId?   file nghe dùng chung cả phần
   ├─ passage?   đoạn văn dùng chung (bài đọc, hoặc ngân hàng từ A–F)
   └─ questions[]
        id · type · prompt · ảnh/audio riêng (tuỳ chọn) · điểm · giải thích · lời thoại
        + phần riêng theo type (lựa chọn, đáp án đúng, cặp, thẻ từ…)
```

Mỗi câu có `id` ổn định, mỗi lựa chọn có `optionId` ổn định. Học viên nộp theo
`optionId`, không theo vị trí, nên xáo trộn không làm sai điểm.

### 5.3. Các dạng câu hỏi

| Dạng | Mô tả | Chấm | Dùng lại từ | Giai đoạn |
| --- | --- | --- | --- | --- |
| `choice` | 2–4 lựa chọn A–D; lựa chọn là chữ Hán, pinyin, nghĩa hoặc ảnh | Tự động | `quiz` | 2 |
| `true-false` | Đúng/Sai (✓/✗) cho một câu hoặc một đoạn nghe | Tự động | `quiz` | 2 |
| `choice-blank` | Câu có chỗ trống, chọn từ điền vào (như câu 15–16 trong video) | Tự động | `fill-blank` | 2 |
| `passage-choice` | Một đoạn đọc hoặc một file nghe, nhiều câu hỏi đi kèm | Tự động | `passage` + `quiz` | 2 |
| `picture-choice` | Nghe hoặc đọc, chọn hình đúng | Tự động | `guess-picture`, `picture-card` | 3 |
| `word-bank` | Ngân hàng từ A–F dùng chung, điền vào nhiều chỗ trống của một đoạn | Tự động, mỗi chỗ một điểm | `fill-blank` | 3 |
| `matching` | Nối chữ Hán với nghĩa hoặc hình | Tự động, điểm theo từng cặp | `matching` | 3 |
| `sentence-order` | Xếp các thẻ từ thành câu đúng | Tự động; cho phép nhiều đáp án đúng | `sentence-order` | 3 |
| `fill-text` | Gõ chữ Hán hoặc pinyin | Tự động sau khi chuẩn hoá; nhiều đáp án được chấp nhận | `sentence-practice` | 4 |
| `tone-pick` | Nghe chữ, chọn thanh điệu | Tự động | `tone-pick` | 4 |
| `sort-groups` | Đưa thẻ vào đúng nhóm | Tự động, điểm theo thẻ | `sort-groups` | 4 |
| `writing` | Viết đoạn ngắn hoặc dịch câu; có thể kèm ảnh chụp bài viết | **Giáo viên chấm tay** | `sentence-practice` | 4 |
| `speaking` | Học viên ghi âm câu trả lời | **Giáo viên nghe và chấm** | `speaking` | Sau |

Quy tắc chung:
- Điểm mỗi câu mặc định 1, sửa được; điểm của `matching`, `word-bank`, `sort-groups`
  chia theo từng phần tử. Câu chấm tay hiện "chờ chấm" cho tới khi giáo viên cho điểm.
- Chuẩn hoá cho `fill-text`: bỏ khoảng trắng và dấu câu thừa, đổi chữ hoa/thường;
  với pinyin có tuỳ chọn bắt buộc hay bỏ qua dấu thanh. Mỗi câu có danh sách đáp án
  được chấp nhận.
- `speaking` cần quyền micro, tải âm thanh lên B2 và liên quan quyền riêng tư của
  trẻ em, nên để sau cùng.

### 5.4. Âm thanh (phần quan trọng nhất của đề nghe)

- Đề có nhiều file nghe; mỗi phần hoặc nhóm câu gắn một `trackId`. Thanh trên cùng
  luôn hiện file đang nghe và cho chuyển file.
- Trình phát: phát/dừng, lùi 5 giây, thanh tua, âm lượng, tốc độ 0.75x–1.5x.
- **Số lần nghe tối đa mỗi file** là cài đặt của đề: không giới hạn (luyện tập), 1
  hoặc 2 (kiểm tra). Khi giới hạn thì ẩn thanh tua và nút lùi. Số lần nghe đếm ở
  trình duyệt, vì không chặn được người cố tình, nên chỉ dùng cho kiểm tra có người
  giám sát.
- **Mốc câu** (tuỳ chọn): đánh dấu giây bắt đầu của từng câu trong file nghe để bấm
  vào câu là nghe lại đúng đoạn đó. Thiếu mốc thì vẫn chạy bình thường.
- File phục vụ qua Worker đứng trước B2: Worker đọc từ B2, cache bằng Cache API của
  Cloudflare và trả `Range`, để tua được mà không tải cả file và học viên ở Việt Nam
  nhận từ cache gần thay vì chạy sang Mỹ.
- Nén khi đăng: đổi sang mp3 hoặc AAC mono khoảng 64 kbps (file 5 phút còn khoảng
  2–3 MB). File đặt tên theo hash nên cache vĩnh viễn và không tải lên trùng.
- Safari và Chrome trên điện thoại chỉ cho phát sau thao tác của người dùng; nút
  "Bắt đầu" ở màn nhập tên cũng là lần chạm đầu tiên mở khoá phát âm thanh.
- Lời thoại của đoạn nghe lưu cùng đề nhưng **chỉ gửi cho học viên sau khi nộp**
  (và chỉ khi đề cho xem đáp án).

### 5.5. Trải nghiệm làm bài

- **Bố cục:** thanh điều khiển (âm thanh, đồng hồ, tiến độ) và thanh nộp bài luôn
  hiện trên màn hình; mục lục các phần; trên điện thoại một cột, lựa chọn xếp dọc.
  Kiểu dáng lấy từ theme của đề, không bám theo video.
- **Tiến độ** "đã làm/tổng". Bấm vào tiến độ mở danh sách số câu, bấm một số để
  nhảy tới câu đó; câu chưa làm được tô khác màu. Có nút **đánh dấu câu** để xem lại.
- **Đồng hồ:** hai chế độ theo cài đặt đề: bắt đầu khi bấm "Bắt đầu" (mặc định) hoặc
  khi trả lời câu đầu tiên (như video). Giờ bắt đầu do **Worker ghi** (`POST
  /a/<slug>/start`), nên đổi đồng hồ máy không kéo dài thời gian. Hết giờ thì tự
  nộp phần đã làm; Worker chấp nhận bài nộp trễ thêm khoảng 30 giây vì độ trễ mạng.
- **Tự lưu nháp:** đáp án, câu đánh dấu và thời điểm bắt đầu lưu vào `localStorage`
  sau mỗi thao tác; mở lại link thì hỏi có tiếp tục bài đang dở không.
- **Nộp bài:** nếu còn câu chưa làm thì liệt kê số câu và hỏi xác nhận. Nếu gửi lỗi
  (mất mạng), giữ bài trên máy, hiện nút **Thử gửi lại** và nút **Tải phiếu** (file
  JSON) để gửi giáo viên bằng cách khác.
- **Làm lại:** xoá bài đang làm sau khi xác nhận; với đề "nộp một lần" thì ẩn nút
  này sau khi đã nộp.
- **Xáo trộn:** Worker trả đề đã xáo theo cài đặt, mỗi lượt làm một thứ tự khác.
  - Xáo đáp án: áp dụng cho mọi câu trắc nghiệm.
  - Xáo thứ tự câu: chỉ xáo trong các câu **không** gắn với file nghe hoặc đoạn
    đọc. Câu nghe phải đúng thứ tự file nghe nên không bao giờ bị xáo.
  - Đáp án kiểu "cả A và B" hoặc "đều đúng" nên có cờ `fixedPosition` để không bị xáo.

### 5.6. Màn kết quả

- Điểm tổng, đạt/chưa đạt (nếu đề đặt ngưỡng), điểm theo từng kỹ năng nghe/đọc/viết.
- Từng câu: đáp án của em, đáp án đúng, giải thích, lời thoại của đoạn nghe kèm nút
  nghe lại. Có bộ lọc **chỉ câu sai** và nút **làm lại các câu sai** (luyện tập,
  không tính điểm, không gửi lên máy chủ).
- Cài đặt đề quyết định mức hiển thị: không xem đáp án / xem ngay sau khi nộp / chỉ
  xem sau hạn nộp.
- Mở lại link sau khi nộp thì xem lại được kết quả của chính mình (mã lượt làm lưu
  trong trình duyệt).

### 5.7. Soạn đề trong app desktop

- **Tạo từ đầu** bằng form tự dựng, như các template hiện có.
- **Tạo từ bài học:** lấy từ vựng, ngữ pháp, hội thoại của một bài học để sinh câu
  hỏi mẫu: chữ Hán → nghĩa, nghĩa → chữ Hán, điền chỗ trống từ câu ví dụ, xếp câu từ
  hội thoại. Giáo viên duyệt và sửa trước khi giữ lại.
- **Nhập từ AI:** dán nội dung đề từ giáo trình, AI trả JSON theo schema; validate
  và ánh xạ lỗi như AI import hiện có.
- **Kiểm tra trước khi đăng**, tương tự `lessonCheck`: mọi câu có đáp án đúng; mỗi
  câu trắc nghiệm có ít nhất 2 lựa chọn; file nghe đã gắn đủ; đề có file nghe mà
  chưa gắn thì cảnh báo; câu thiếu giải thích hoặc lời thoại thì nhắc (không chặn).
- **Xem thử như học viên** ngay trong app, dùng chính giao diện của bản web.
- Dùng lại ngân hàng câu hỏi giữa các đề: để sau.

### 5.8. Dữ liệu và API

D1 (tên cột chốt khi làm):

```
assignments(id, slug, title, settings_json, content_json,   -- content_json có đáp án, không bao giờ gửi cho học viên
            published_at, closes_at, closed)
attempts(id, assignment_id, student_name, client_id,         -- client_id: mã ngẫu nhiên của trình duyệt
         started_at, submitted_at, status,                   -- in_progress | submitted | graded
         answers_json, score, max_score, part_scores_json, manual_scores_json)
```

| API | Việc |
| --- | --- |
| `GET /a/<slug>` | Đề đã bỏ đáp án, lời thoại và giải thích; đã xáo theo cài đặt |
| `POST /a/<slug>/start` | Tạo lượt làm, ghi giờ bắt đầu, trả mã lượt làm |
| `POST /a/<slug>/submit` | Chấm tự động, lưu, trả kết quả theo mức cho phép xem |
| `GET /a/<slug>/result/<attempt>` | Xem lại kết quả của chính lượt làm đó |
| `GET /teacher/...` | Danh sách đề, bài nộp, chấm tay, xuất CSV (sau mật khẩu) |

Chấm điểm nằm ở một module TypeScript thuần trong `core/`, dùng chung giữa app
(xem thử) và Worker, có test cho từng dạng câu hỏi, chuẩn hoá và xáo trộn.

### 5.9. Chia giai đoạn lại cho phần bài tập

- **Giai đoạn 2:** schema, `choice`, `true-false`, `choice-blank`, `passage-choice`,
  nhiều file nghe, form soạn, kiểm tra, xem thử.
- **Giai đoạn 3:** Worker, giao diện học viên đầy đủ (mục 5.4–5.6), chấm điểm,
  nộp lại, xáo trộn, tải phiếu dự phòng.
- **Giai đoạn 4:** bảng điểm, chấm tay cho `writing`, thêm `picture-choice`,
  `word-bank`, `matching`, `sentence-order`, `fill-text`, `tone-pick`, `sort-groups`,
  tạo đề từ bài học, nhập từ AI.

## 6. Rủi ro

| Rủi ro | Xử lý |
| --- | --- |
| Ảnh Bing và giọng Google Dịch lộ hơn khi đưa lên web công khai | Bài sau mật khẩu; link đề khó đoán; `noindex`. Người dùng đã chấp nhận rủi ro bản quyền khi dùng nội bộ, nhưng cần xác nhận lại khi đăng công khai |
| Link đề bị chia sẻ rộng | Cho đóng đề, đặt hạn nộp, giới hạn tần suất |
| Học viên nộp nhiều lần, hoặc trùng tên | Lưu mọi lần nộp; mỗi trình duyệt có một mã ngẫu nhiên để phân biệt các em trùng tên; đề chọn cho nộp một lần hay nhiều lần |
| Bài đã đăng không tương thích sau khi đổi schema | Migration theo `schemaVersion` cho cả bài học và đề |
| Hết hạn mức gói free | Theo dõi dung lượng B2 và số lượt gọi Worker; nén ảnh và audio trước khi tải lên (audio mp3/AAC mono khoảng 64 kbps) |
| B2 hết hạn mức hoặc đổi chính sách miễn phí | File lưu sau giao diện `put`/`get` nên chuyển sang R2 hoặc nơi khác chỉ sửa một chỗ |
| Khác biệt Safari/Chrome (audio, fullscreen) | Thử trên cả hai trước khi coi giai đoạn là xong |

## 7. Còn mở

- Đã chốt: dùng tên miền `*.pages.dev` miễn phí.
- Phần giáo viên: đề xuất mật khẩu trong Worker (không tốn gì, không phụ thuộc tên
  miền). Cloudflare Access có gói free (~50 người) nhưng cần kiểm tra có bảo vệ được
  `*.pages.dev` không và có đòi thẻ thanh toán không; cân nhắc khi mua tên miền riêng.
- Đã chốt cách xử lý nộp lại (mục 4, Giai đoạn 3): lưu mọi lần nộp; bảng điểm
  mặc định hiện lần cuối, kèm số lần làm và điểm cao nhất.
