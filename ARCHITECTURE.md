# Chinese Lesson Studio — Quyết định kiến trúc

Ứng dụng desktop offline-first (Windows và macOS) để giáo viên soạn và **trình
chiếu** bài giảng tiếng Trung cho lớp trẻ em, bằng trình chỉnh sửa slide theo
template. `lesson.html` là tài liệu chuẩn trên đĩa và mở thẳng được bằng trình
duyệt; bài học xuất ra được thành một file HTML độc lập để trình chiếu trên máy
khác (ví dụ máy tính của lớp học).

Người dùng thao tác bằng giao diện giống công cụ soạn bài giảng và không bao giờ
phải chạm vào HTML.

**Người dùng duy nhất của ứng dụng là giáo viên.** Học sinh chỉ xem màn hình chiếu
và trả lời bằng lời; giáo viên là người điều khiển mọi thứ trên màn hình.

> Lịch sử các lần sửa ở mục 12 (bản hiện tại: Rev 6).

---

## 1. Quyết định kiến trúc

| Hạng mục | Quyết định |
| --- | --- |
| Nền tảng | Tauri 2 + React + TypeScript + Vite. **Windows (WebView2) và macOS (WKWebView)** ngay từ MVP. |
| Đối tượng | Giáo viên soạn bài và **tự điều khiển** khi trình chiếu cho lớp trẻ em (máy chiếu/TV). Học sinh không thao tác trên máy. |
| Hoạt động trên lớp | Mọi slide hoạt động/trò chơi do giáo viên điều khiển, và **chạy được chỉ bằng Tiếp/Lùi** (phím mũi tên hoặc bút trình chiếu). |
| Editor | Visual Editor theo template. Không có canvas tự do trong MVP. |
| Định dạng chuẩn | `lesson.html` **nhúng dữ liệu bài học dạng JSON** trong `<script type="application/json">`. DOM hiển thị được sinh ra từ JSON, không bao giờ được parse ngược. |
| Mô hình chỉnh sửa | `LessonDocument` trong bộ nhớ; không sửa chuỗi HTML trực tiếp. |
| Phiên bản | Một số duy nhất `schemaVersion`. |
| Library | Mỗi bài học là một thư mục: `lesson.html` + `assets/`. |
| Lưu | Nút **Lưu** + Ctrl+S / ⌘S, kèm autosave. Draft JSON ghi liên tục vào vùng dữ liệu ứng dụng; `lesson.html` được ghi khi bấm Lưu, khi rảnh và khi đóng. |
| Template | **Kiến trúc plugin**: mỗi loại slide là một module tự chứa (schema, render, form chỉnh sửa, hành vi tương tác). Thêm loại mới không phải sửa lõi. |
| Theme | Nhiều theme dành cho trẻ em; mỗi theme là một module (CSS variables + hình trang trí SVG + âm thanh phản hồi). |
| Render | Một bộ hàm render dùng chung cho Editor, Present và Export, trên sân khấu 16:9 cố định được co giãn vừa màn hình. |
| AI import | JSON theo schema; validate trước khi áp dụng; ứng dụng tự gán ID. |
| Nội dung không đáng tin cậy | Không bao giờ thực thi HTML/JS lấy từ file bên ngoài hay từ AI. |
| Ảnh và giọng đọc từ web | Tìm ảnh bằng Bing Images ngay trong Editor (SafeSearch nghiêm ngặt), dán (Ctrl+V) hoặc kéo ảnh từ trình duyệt; giọng đọc tiếng Trung bằng Google Dịch. File tải về được lưu vào `assets/`, nên trình chiếu và file export vẫn chạy offline. Chỉ Rust gọi mạng; webview không có quyền mạng. |
| Export | Một file HTML độc lập: CSS, runtime JS, âm thanh phản hồi và asset được nhúng. Chỉ nhúng runtime của những loại slide bài học thực sự dùng. |
| Font | Chữ Hán dùng font hệ thống. Chữ Latin/tiếng Việt dùng một font tròn, dễ đọc cho trẻ (giấy phép OFL, subset Latin + tiếng Việt, ~100 KB) được nhúng. |

---

## 2. Kiến trúc tổng thể

```
┌──────────────────────────────────────────────────────────────┐
│ UI (React)                                                   │
│  LibraryScreen · LessonEditor · SlideNavigator · Properties  │
│  SaveStatus · PresentMode · RecoveryDialog · AiImportDialog  │
└───────────────┬──────────────────────────────────────────────┘
                │ commands (addSlide, updateField, …)
┌───────────────▼──────────────────────────────────────────────┐
│ Core (TypeScript thuần, không phụ thuộc React/Tauri)         │
│  LessonDocument + Zod schema · HistoryManager (undo/redo)    │
│  TemplateRegistry · ThemeRegistry · MigrationService         │
│  AiImportService · LessonCodec · ExportService               │
└───────┬───────────────────────┬──────────────────┬───────────┘
        │                       │                  │
┌───────▼─────────────┐ ┌───────▼────────────┐ ┌───▼─────────────────────┐
│ templates/*       │ │ Renderer           │ │ Persistence (Rust)      │
│  mỗi loại slide một │ │  sân khấu 16:9     │ │  atomic write · backup  │
│  thư mục: schema,   │ │  runtime lõi:      │ │  draft · lock · assets  │
│  render, editor,    │ │  điều hướng, âm    │ │  đường dẫn theo OS      │
│  interaction        │ │  thanh, hiệu ứng   │ │  fs giới hạn Library    │
│ themes/*          │ │                    │ │                         │
└─────────────────────┘ └────────────────────┘ └─────────────────────────┘
```

`core/`, `renderer/`, `templates/` và `themes/` là TypeScript thuần, test được bằng
Vitest mà không cần Tauri. Editor, Present và Export gọi cùng một hàm render nên
không lệch nhau.

### 2.1. Vì sao nhúng JSON thay vì parse DOM?

1. Mở `lesson.html` → lấy nội dung `<script id="lesson-data" type="application/json">`.
2. `JSON.parse` → migrate nếu cần → validate bằng Zod → `LessonDocument`.
3. Người dùng sửa qua Visual Editor; mọi thao tác đi qua command để có undo/redo.
4. Khi lưu: serialize JSON + render lại toàn bộ DOM slide + runtime → ghi file.

DOM vẫn đầy đủ ngữ nghĩa (mở bằng trình duyệt là xem được) nhưng chỉ là **đầu
ra**. Round-trip là `JSON → JSON`, kiểm thử đơn giản và chắc chắn. Thay đổi markup
của template không bao giờ làm hỏng khả năng mở bài cũ.

### 2.2. Hợp đồng plugin template

Mỗi loại slide nằm trong `templates/<type>/` và export một đối tượng:

```ts
interface SlideTemplate<C> {
  type: string;                    // "matching"
  category: "teach" | "qa" | "game";
  schema: ZodType<C>;              // validate content
  aiSchemaHint: string;            // mô tả ngắn đưa vào prompt AI
  defaults(): C;                   // nội dung khi tạo slide mới
  limits: ContentLimits;           // số phần tử / ký tự tối đa để không tràn 16:9
  render(content: C, ctx: RenderContext): string;  // HTML tĩnh, đã escape
  editor: EditorFieldSpec<C>;      // mô tả form trong Properties panel
  interaction?: InteractionModule; // mã runtime cho slide có tương tác
}
```

- `render` trả HTML tĩnh; tương tác (lật thẻ, hiện đáp án, ghép cặp) do
  `interaction` gắn vào lúc chạy, nên cùng một module chạy trong Present lẫn file
  export.
- `interaction` khai báo danh sách **bước** của slide (ví dụ: hiện câu hỏi → hiện
  đáp án đúng). Runtime xử lý phím Tiếp: còn bước thì chạy bước kế tiếp, hết bước
  thì sang slide sau; phím Lùi đi ngược lại. Giống hiệu ứng xuất hiện từng phần
  trong PowerPoint, nên giáo viên chỉ cần bút trình chiếu.
- Phần lớn slide không cần `interaction` riêng: runtime lõi tự lấy các phần tử
  đánh dấu `data-ls-reveal` làm bước, hiện lần lượt theo thứ tự (cùng giá trị thì
  hiện cùng lúc), kèm âm thanh nhẹ (`data-ls-sound`, ví dụ `flip` cho thẻ lật).
  Chỉ hoạt động cần logic riêng (trò chơi) mới viết `interaction`.
- `editor` là mô tả dữ liệu (trường text, danh sách, ảnh, audio, lựa chọn đúng/sai…),
  không phải component React riêng — Properties panel tự dựng form. Thêm template
  mới không cần viết UI mới, trừ khi có trường đặc biệt.
- Export gom `interaction` của những `type` có mặt trong bài, nên bài chỉ có
  từ vựng không mang theo mã của trò chơi.

Theme theo hợp đồng tương tự trong `themes/<id>/`: CSS variables, hình trang trí
SVG, font Latin. Âm thanh phản hồi (hiện ra / lật thẻ / đúng / sai / hoàn thành)
được runtime tổng hợp bằng WebAudio nên bài không mang file âm thanh nào và không
vướng bản quyền; pháo giấy khi hoàn thành là hiệu ứng CSS. Cả hai tắt được qua
`settings.sound` / `settings.animations`.

---

## 3. Lưu trữ, lưu và phục hồi

### 3.1. Bố cục trên đĩa

```
Library (người dùng đổi được)
  Windows: %USERPROFILE%\Documents\Chinese Lesson Studio\
  macOS:   ~/Documents/Chinese Lesson Studio/
    Hoa-qua/
      lesson.html                         ← source of truth
      assets/
        img-3f9a2c.webp                   ← tên theo hash nội dung
        audio-81bd04.mp3

Dữ liệu nội bộ (lấy qua API đường dẫn của Tauri, không hardcode)
  Windows: %APPDATA%\ChineseLessonStudio\
  macOS:   ~/Library/Application Support/ChineseLessonStudio/
    drafts/<lessonId>.json
    backups/<lessonId>/<timestamp>.html   ← 10 bản gần nhất + 1 bản/ngày trong 7 ngày
    library-index.json                    ← cache, dựng lại được
```

- Draft và backup định danh theo `lessonId`, không theo đường dẫn.
- Tên thư mục sinh từ tiêu đề lúc tạo, chuyển thành **ASCII**: bỏ dấu tiếng Việt
  (`đ` → `d`), mọi ký tự khác chữ/số thành `-` ("Hoa quả" → `Hoa-qua`); trùng tên
  thì thêm số (`Hoa-qua-2`); tên dành riêng của Windows được nối thêm hậu tố; tiêu
  đề không còn ký tự Latin nào (ví dụ "水果") dùng `Bai-hoc`. Tên ASCII hợp lệ trên
  cả hai hệ điều hành và tránh hẳn lệch NFC/NFD của macOS. Thư mục do người dùng
  tự tạo vẫn được chuẩn hoá NFC khi liệt kê. Đổi tên bài chỉ đổi tiêu đề; thư mục
  giữ tên lúc tạo. Library hiển thị tiêu đề, đọc từ `<title>` ở đầu `lesson.html`.
- Asset đặt tên theo hash nội dung → tự loại trùng, thay ảnh không ghi đè file cũ.

### 3.2. Nút Lưu và autosave

Thanh công cụ có nút **Lưu** kèm trạng thái:

| Trạng thái | Hiển thị |
| --- | --- |
| Không có thay đổi | "Đã lưu" (nút mờ) |
| Có thay đổi chưa ghi vào `lesson.html` | "Chưa lưu" (nút nổi bật); tiêu đề cửa sổ có dấu `•` |
| Đang ghi | "Đang lưu…" |
| Lỗi ghi | "Không lưu được" + lý do, nút "Thử lại" |

| Sự kiện | Hành động |
| --- | --- |
| Mỗi thay đổi | Debounce 1 giây → ghi draft JSON (người dùng không thấy). |
| Bấm Lưu, Ctrl+S (Windows) / ⌘S (macOS) | Ghi `lesson.html` ngay. |
| Rảnh 30 giây, chuyển bài, đóng cửa sổ, thoát ứng dụng | Tự ghi `lesson.html`. |
| Ghi `lesson.html` thành công | Xoá draft. |
| Mở bài học có draft mới hơn file | Hỏi phục hồi hay bỏ. |

Nút Lưu cho giáo viên cảm giác kiểm soát quen thuộc; autosave bảo đảm quên bấm
Lưu cũng không mất bài.

### 3.3. Ghi file an toàn

1. Validate `LessonDocument`. Không hợp lệ → không ghi, báo lỗi.
2. Nếu `lesson.html` đã thay đổi trên đĩa kể từ lúc mở (so sánh hash) → dừng và
   hỏi người dùng. Áp dụng cho cả OneDrive (Windows) và iCloud Drive (macOS
   thường đồng bộ thư mục Documents).
3. Sao `lesson.html` hiện tại vào `backups/`.
4. Ghi `lesson.html.tmp` cùng thư mục, `fsync`, rồi `rename` đè lên file chính.
   Thử lại vài lần nếu file đang bị khoá.
5. Cập nhật hash đã biết.

### 3.4. Quy tắc bắt buộc

- Không bao giờ ghi đè file chính bằng dữ liệu chưa validate.
- Luôn có ít nhất một backup hợp lệ trước khi thay file chính.
- Draft đủ để phục hồi toàn bộ nội dung chưa ghi vào `lesson.html`.
- Draft mới hơn file → hỏi người dùng; không âm thầm ghi đè.
- File không hợp lệ hoặc `schemaVersion` mới hơn ứng dụng hỗ trợ → báo lỗi, không
  sửa file gốc, không hạ cấp phiên bản.
- Một bài học chỉ mở ở một cửa sổ (lock file trong vùng dữ liệu nội bộ).
- Xoá ảnh khỏi slide không xoá asset ngay; asset không còn tham chiếu được dọn khi
  đóng bài.

---

## 4. HTML Lesson Studio Contract

### 4.1. Khung HTML

```html
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="generator" content="Chinese Lesson Studio">
  <meta name="lesson-studio-schema" content="1">
  <title>Hoa quả</title>
  <style>/* theme + CSS của các template được dùng */</style>
</head>
<body>
  <main class="ls-deck" data-theme="garden">
    <section class="ls-slide" data-slide-id="s_8f2k" data-slide-type="cover">
      <h1 lang="zh-CN">水果</h1>
      <p lang="vi">Hoa quả</p>
    </section>
    <!-- … các slide được render từ JSON bên dưới … -->
  </main>

  <script type="application/json" id="lesson-data">
  {"schemaVersion":1,"id":"l_5d1c…","title":"Hoa quả","slides":[…]}
  </script>
  <script>/* runtime lõi + interaction của các template được dùng */</script>
</body>
</html>
```

- `lesson.html` trong Library cũng nhúng CSS và runtime nên mở bằng trình duyệt là
  trình chiếu được. Khác biệt duy nhất với file export: asset tham chiếu tương đối
  thay vì nhúng.
- JSON trong `<script>`: escape `<` thành `<`.
- Văn bản tiếng Trung mang `lang="zh-CN"`, tiếng Việt mang `lang="vi"`.

### 4.2. LessonDocument

| Trường | Ý nghĩa |
| --- | --- |
| `schemaVersion` | Phiên bản schema (số nguyên). |
| `id` | ID ổn định của bài học. |
| `title` | Tên bài học. |
| `script` | `"simplified"` \| `"traditional"`. |
| `theme` | `{ id, overrides? }`. |
| `settings` | `{ sound: boolean, animations: boolean, hanziFont: "sans" \| "kai" }`. |
| `slides[]` | `{ id, type, content, layout?, notes? }` — `content` validate theo schema của `type`. `notes` là ghi chú riêng của giáo viên (gợi ý câu hỏi, cách dẫn dắt), không hiện khi trình chiếu. |
| `assets[]` | `{ id, file, kind: "image" \| "audio", mime, alt?, source? }` — `source` là trang web nơi lấy ảnh, để giáo viên tìm lại. |
| `metadata` | `createdAt`, `updatedAt`, `appVersion`. |

Schema định nghĩa một lần bằng Zod; JSON Schema cho AI import được sinh từ đó.
Pinyin lưu dạng có dấu thanh (`píng guǒ`), hiển thị bằng `<ruby>` khi cần.

`hanziFont: "kai"` chọn kiểu chữ Khải (楷体 — KaiTi trên Windows, Kaiti SC trên
macOS), gần với chữ viết tay trẻ học ở trường; `"sans"` dùng Microsoft YaHei /
PingFang SC.

### 4.3. Loại slide

Chia ba nhóm. Nhờ kiến trúc plugin (2.2), mỗi loại là một module độc lập, nên có
thể bổ sung dần mà không ảnh hưởng các loại đã có.

**Nhóm 1 — Dạy (MVP)**

| Template | Nội dung |
| --- | --- |
| `cover` | Tiêu đề, phụ đề, ảnh/hình trang trí. Dùng cả làm trang mở đầu phần. |
| `vocabulary` | 1–8 từ: chữ Hán, pinyin, nghĩa, ảnh, audio; bật/tắt ẩn nghĩa. |
| `picture-card` | Một từ chiếm cả slide: ảnh lớn, chữ Hán lớn, pinyin, bấm để nghe. |
| `flashcard` | Thẻ lật: mặt trước ảnh hoặc chữ Hán, mặt sau nghĩa và pinyin. |
| `dialogue` | Các lượt thoại theo vai, có ảnh nhân vật. |
| `grammar` | Cấu trúc, giải thích, câu ví dụ có tô màu thành phần. |
| `summary` | Điểm cần nhớ, từ vựng chính. |

**Nhóm 2 — Hỏi đáp trên lớp (MVP)**

Giáo viên đặt câu hỏi, học sinh trả lời bằng lời, giáo viên bấm Tiếp để hiện đáp
án. Không slide nào đòi hỏi học sinh tự bấm.

| Template | Giáo viên dùng thế nào | Các bước khi bấm Tiếp |
| --- | --- | --- |
| `quiz` | Hỏi cả lớp; đề là chữ, ảnh hoặc audio ("nghe và chọn hình"); 2–4 lựa chọn đánh số/chữ cái để trẻ gọi tên; có biến thể Đúng/Sai. | Hiện câu hỏi → hiện đáp án đúng (sáng lên + âm thanh). |
| `matching` | Hai cột chữ Hán ↔ ảnh/nghĩa; trẻ nói cặp nào đi với nhau. | Mỗi lần Tiếp nối thêm một cặp. |
| `fill-blank` | Câu có chỗ trống, kèm ô gợi ý từ. | Mỗi lần Tiếp điền một chỗ trống. |
| `sentence-order` | Các thẻ từ bị xáo trộn; trẻ đọc lại câu đúng. | Mỗi lần Tiếp đưa một thẻ về đúng vị trí, hoặc hiện cả câu một lần (tuỳ chọn khi soạn). |
| `tone-pick` | Đặc thù tiếng Trung: phát audio hoặc hiện chữ, trẻ giơ 1–4 ngón tay chọn thanh điệu. | Phát âm → hiện thanh đúng (dấu thanh + đường nét cao độ). |
| `sort-groups` | 2–3 nhóm (ví dụ: hoa quả / con vật); trẻ nói mỗi thẻ thuộc nhóm nào. | Mỗi lần Tiếp đưa một thẻ vào đúng nhóm. |

**Nhóm 3 — Trò chơi cả lớp (MVP, có thể cắt nếu trễ)**

Chọn theo những trò thường gặp nhất trong PPT dạy ngoại ngữ cho trẻ (nguồn tham
khảo ở cuối mục). Giáo viên điều khiển; trẻ tham gia bằng cách gọi số, đoán, hoặc
chơi theo đội.

| Template | Tên quen thuộc | Giáo viên dùng thế nào |
| --- | --- | --- |
| `whats-missing` | What's missing? / 少了什么? | Hiện 4–8 hình từ vựng → Tiếp: một hình biến mất → trẻ đoán → Tiếp: hình hiện lại. Có thể lặp nhiều vòng trên cùng slide. |
| `guess-picture` | Quick peek, Slow reveal, Hidden picture | Đoán từ qua hình bị che. Chế độ khi soạn: **chớp nhanh**, **phóng to dần ra**, **mờ dần rõ**, **mở từng ô** (ô đánh số, trẻ gọi số, giáo viên bấm). |
| `box-pick` | Bomb game / Hộp bí mật | Lưới 6–16 ô đánh số. Trẻ (theo đội) gọi số; ô mở ra một từ/câu hỏi cần trả lời, rồi một phần thưởng: +điểm, bom (mất điểm), đổi điểm giữa hai đội… Cộng thẳng vào bảng điểm. |
| `lucky-wheel` | Spin the wheel | Space để quay; dừng ở từ/câu hỏi để gọi một em hoặc một đội trả lời. |
| `memory` | Memory / Pairs | Thẻ úp đánh số; trẻ gọi hai số, giáo viên bấm lật. Trùng cặp thì giữ mở. |

Các trò cần chọn vị trí (`guess-picture` mở từng ô, `box-pick`, `memory`) cho
phép giáo viên bấm chuột hoặc gõ số trên bàn phím; các trò còn lại chạy chỉ bằng
Tiếp/Lùi.

**Đã cân nhắc nhưng không đưa vào:**
- *Đập chuột (whack-a-mole), bấm nhanh trên bảng tương tác*: cần học sinh tự bấm.
- *Treo cổ / Protect the cheese*: dựa trên đánh vần chữ cái, không hợp với chữ Hán.
- *Bảng Jeopardy (chủ đề × điểm)*: hay nhưng nặng về soạn nội dung; để sau MVP.

Tham khảo: [What's missing trong bài tiếng Trung](https://tes.com/teaching-resource/beginner-s-chinese-food-drink-13161117),
[Bomb game](https://www.tes.com/teaching-resource/bomb-disposal-esl-powerpoint-game-13296767),
[Hidden picture](https://games4esl.com/powerpointgames/hidden-picture-ppt-games/),
[Quick peek, Slow motion, Vanishing flashcards](https://www.eslkidstuff.com/blog/flashcards/top-10-flashcard-games-activities),
[Các mẫu của Wordwall](https://teachersfirst.org/blog/2025/11/tech-tool-of-the-month-wordwall-part-2/).

**Công cụ lớp học trong chế độ trình chiếu** (lớp phủ, không phải slide; không
lưu vào bài):
- Bảng điểm 2–4 đội: `1`–`4` cộng điểm, `Shift`+số trừ điểm.
- Đồng hồ đếm ngược (`T`).
- Chọn ngẫu nhiên số thứ tự học sinh.

Quy ước chung cho slide hoạt động:
- Phản hồi rõ ràng cho cả lớp: âm thanh + hiệu ứng khi hiện đáp án đúng, pháo giấy
  khi hoàn thành; tắt được qua `settings`.
- Chữ và hình đủ lớn để nhìn rõ từ cuối lớp; mỗi template đặt cỡ chữ tối thiểu.
- Phím tắt cho giáo viên: `A` hiện ngay toàn bộ đáp án, `R` làm lại slide.
- Rời slide rồi quay lại thì slide bắt đầu lại từ đầu.

### 4.4. Theme

MVP có 5 theme, mỗi theme gồm bảng màu, hình trang trí SVG, kiểu khung slide và
bộ âm thanh phản hồi:

| Theme | Phong cách |
| --- | --- |
| `garden` | Vườn hoa, màu pastel ấm. |
| `ocean` | Đại dương, xanh mát. |
| `space` | Vũ trụ, nền tối, ngôi sao. |
| `panda` | Gấu trúc, tre, đỏ–xanh lá (gợi văn hoá Trung Hoa). |
| `classic` | Gọn gàng, cho học viên lớn hơn. |

Đổi theme không làm thay đổi nội dung. Hình trang trí phải tự vẽ hoặc dùng nguồn
có giấy phép rõ ràng (CC0/OFL), không lấy ảnh trên mạng.

### 4.5. Quy tắc tương thích

- Mở file: tìm `meta[name=lesson-studio-schema]` và `#lesson-data`; thiếu → từ chối
  kèm giải thích.
- Bỏ qua hoàn toàn DOM và `<script>` của file được mở; chỉ đọc JSON.
- `type` lạ (từ phiên bản mới hơn) → từ chối mở, không bỏ rơi slide.
- ID slide không đổi khi sửa nội dung hoặc đổi thứ tự.
- Đường dẫn asset luôn tương đối với thư mục bài học; từ chối URL tuyệt đối,
  `file:`, `javascript:` hoặc đường dẫn chứa `..`.
- Trường thiếu nhưng có mặc định an toàn → bổ sung; cấu trúc sai → từ chối.
- Migration: backup trước, chạy chuỗi `v1→v2→…`, validate sau cùng.

---

## 5. Luồng dữ liệu chính

### A. Tạo bài học
Library → "Bài mới" → chọn bài mẫu và theme → tạo thư mục + `LessonDocument` →
mở Editor.

### B. Nhập nội dung từ AI
1. Nút **"Sao chép prompt cho AI"** đưa vào clipboard prompt kèm JSON Schema, mô tả
   từng loại slide (`aiSchemaHint`) và ví dụ.
2. Người dùng dán kết quả vào hộp thoại nhập; ứng dụng tự bỏ khung ```` ```json ````
   và đoạn văn thừa.
3. Validate; lỗi hiển thị theo vị trí ("Slide 3, từ 2: thiếu pinyin").
4. Xem trước → **Tạo bài mới** hoặc **Thêm vào cuối bài hiện tại**.
5. ID do ứng dụng gán; slide cần ảnh nhận ô placeholder.
6. Một lần nhập = một bước undo.

Không gọi AI API trong MVP.

### C. Preview, Present và Export
- Editor hiển thị slide bằng chính hàm render, thêm lớp chỉnh sửa.
- Present: toàn màn hình; ←/→, PageUp/PageDown, Space, Esc; hỗ trợ bút trình chiếu.
- Export: render + nhúng asset base64 + runtime của các template được dùng → một
  file `.html`. Cảnh báo khi vượt ~50 MB.
- Slide tương tác chạy giống hệt trong Present và file export.
- File export phải chạy đúng trên Chrome, Edge và **Safari**.

### D. Mở HTML từ bên ngoài
`Chọn file → kiểm tra meta + #lesson-data → parse JSON → migrate → validate →
sao chép vào Library → mở Editor`. Không có chuyển đổi HTML tuỳ ý.

### E. Ảnh và giọng đọc từ web
- **Tìm ảnh…** mở hộp thoại tìm, từ khoá điền sẵn từ nghĩa hoặc chữ Hán của từ
  (`searchFrom` trong `editor` spec). Rust gọi Bing Images, tải ảnh xem trước và
  trả về dạng `data:` URL. Bấm ảnh thì Rust tải bản gốc; nếu trang gốc chặn thì
  dùng bản sao của Bing.
- **Dán / kéo ảnh**: ảnh copy từ trình duyệt (Ctrl+V) hoặc kéo vào ô Ảnh. Dữ
  liệu ảnh gửi sang Rust dạng nhị phân; nếu chỉ có địa chỉ ảnh thì Rust tải về.
- **🔊 Tạo giọng đọc**: Rust gọi giọng Google Dịch (zh-CN) cho chữ Hán của từ
  (`speakFrom`), lưu MP3 vào `assets/`.
- Mọi ảnh đều qua cùng một bước: nhận diện định dạng theo nội dung file (chỉ
  PNG/JPEG/WebP/GIF, không SVG), thu nhỏ ≤ 1920 px, đặt tên theo hash.
- Bing và Google Dịch là địa chỉ không chính thức, có thể đổi bất cứ lúc nào;
  mỗi nguồn nằm gọn trong một hàm của `web.rs` để sửa ở một chỗ. Google Images
  không dùng được vì chỉ trả trang đòi JavaScript cho ứng dụng.

---

## 6. Module

| Module | Lớp | Trách nhiệm |
| --- | --- | --- |
| `schema` | core | Zod schema gốc, kiểu TypeScript, sinh JSON Schema. |
| `LessonDocument` + commands | core | Thao tác bất biến trên document. |
| `HistoryManager` | core | Undo/redo bằng ảnh chụp document bất biến (Immer chia sẻ phần không đổi nên mỗi bước chỉ tốn phần đã sửa); gộp các lần gõ liên tiếp trong cùng một ô. |
| `TemplateRegistry` | core | Nạp và tra cứu các plugin trong `templates/`. |
| `ThemeRegistry` | core | Nạp và tra cứu các theme trong `themes/`. |
| `LessonCodec` | core | `parse(html) → doc`, `serialize(doc) → html`. |
| `MigrationService` | core | Chuỗi migration theo `schemaVersion`. |
| `AiImportService` | core | Trích JSON, validate, ánh xạ lỗi, gán ID. |
| `ExportService` | core | Đóng gói HTML độc lập, chỉ kèm runtime cần thiết. |
| `templates/*` | plugin | Mỗi loại slide một thư mục theo hợp đồng 2.2. |
| `themes/*` | plugin | Mỗi theme một thư mục. |
| `renderer` | renderer | Sân khấu 16:9, runtime lõi (điều hướng, âm thanh, hiệu ứng, làm lại). |
| `persistence` | Rust | Ghi an toàn, backup, draft, lock, đường dẫn theo OS, sao chép asset, Thùng rác. |
| `AssetManager` | UI + Rust | Nhập ảnh/audio từ file, web hoặc clipboard; nhận diện định dạng, hash, thu nhỏ ảnh lớn (cạnh dài ≤ 1920 px); dọn asset không dùng. |
| `web` | Rust | Tìm ảnh (Bing), tải ảnh, giọng đọc (Google Dịch). |
| `PropertiesPanel` | UI | Dựng form tự động từ `editor` spec của template. |
| `LibraryScreen`, `LessonEditor`, `SlideNavigator`, `SaveStatus`, `PresentMode` | UI | Giao diện. |

### Ranh giới bảo mật

- Capabilities Tauri: chỉ `fs` trong Library + vùng dữ liệu ứng dụng, cộng file
  người dùng chọn qua hộp thoại. Không `shell`, không plugin `http`.
- Mạng chỉ đi qua các lệnh Rust trong `web.rs`: tìm ảnh, tải ảnh, giọng đọc.
  Webview không gọi mạng (CSP không mở `connect-src`/`img-src` ra ngoài; ảnh xem
  trước đến dưới dạng `data:`). Mọi địa chỉ, kể cả sau chuyển hướng, phải là
  địa chỉ web công khai: chặn `localhost`, IP nội bộ và mạng LAN.
- CSP chặt (`script-src 'self'`, không `unsafe-eval`).
- File bên ngoài được đọc như text; không nạp vào webview, không chạy `<script>`.
  JSON đi qua Zod trước khi tới renderer.
- Renderer chỉ chèn chuỗi người dùng dưới dạng text đã escape.
- Nếu Present dùng iframe, iframe có `sandbox="allow-scripts"` (không
  `allow-same-origin`).
- File export không chứa bí mật; minify không phải là bảo vệ.

---

## 7. Đóng gói và phát hành

| | Windows | macOS |
| --- | --- | --- |
| Bộ cài | NSIS `.exe` | `.dmg`, bản Universal (Apple Silicon + Intel) |
| Webview | WebView2 (bootstrapper đi kèm bộ cài) | WKWebView có sẵn |
| Ký số | Không bắt buộc; chưa ký sẽ bị SmartScreen cảnh báo | **Gần như bắt buộc**: chưa ký + notarize thì Gatekeeper chặn, người dùng phải vào System Settings để mở |
| Chi phí | Chứng chỉ ký số (tuỳ chọn) | Apple Developer Program, 99 USD/năm |
| Build | Máy Windows hoặc CI | Cần máy Mac hoặc CI macOS (ví dụ GitHub Actions) |

Hai webview có khác biệt nhỏ về CSS, âm thanh và fullscreen, nên mọi template phải
được thử trên cả hai trước khi coi là xong.

---

## 8. Roadmap

Ước lượng cho **một người làm ngoài giờ (~10–12 giờ/tuần): 15–17 tuần**, do có
macOS, 18 loại slide, 5 theme, các công cụ lớp học và cơ chế phản hồi âm
thanh/hiệu ứng.

| Giai đoạn | Tuần | Mục tiêu | Đầu ra kiểm chứng được |
| --- | --- | --- | --- |
| 1. Lát cắt dọc | 1–3 | Tauri + React + Vite; schema v1; `LessonCodec`; hợp đồng plugin; `cover` + `vocabulary`; theme `classic`; ghi file an toàn + backup; **chạy được trên Windows và macOS**. | Mở bài mẫu → sửa → Lưu → mở lại bằng app **và** trình duyệt, trên cả hai hệ điều hành. |
| 2. Editor | 4–6 | Library; SlideNavigator; PropertiesPanel tự dựng form; nút Lưu + trạng thái; undo/redo; draft + recovery. | Kill tiến trình giữa chừng → mở lại → phục hồi được. |
| 3. Dạy + Present | 7–8 | Đủ nhóm 1; Present toàn màn hình; runtime lõi: các bước theo Tiếp/Lùi, âm thanh, hiệu ứng; ghi chú giáo viên. | Trình chiếu bài 15 slide trọn vẹn chỉ bằng bút trình chiếu. |
| 4. Hỏi đáp + theme | 9–11 | Đủ nhóm 2; 5 theme; tuỳ chọn kiểu chữ Khải. | Mỗi slide hỏi đáp chạy hết các bước bằng Tiếp, trong Present và file export. |
| 5. Trò chơi + công cụ lớp học | 12–14 | Nhóm 3; bảng điểm đội, đồng hồ đếm ngược, chọn ngẫu nhiên. **Giai đoạn đầu tiên bị cắt nếu trễ.** | Dạy thử một buổi với lớp thật. |
| 6. Import/Export + phát hành | 15–17 | Export độc lập; AI import; mở HTML ngoài; bộ cài Windows + macOS đã ký; hướng dẫn ngắn. | Giáo viên cài và soạn xong một bài trên mỗi hệ điều hành mà không cần hỗ trợ. |

Nếu cần cắt, theo thứ tự: bớt trò chơi (giữ `whats-missing`, `guess-picture`,
`box-pick` vì đó là các trò phổ biến nhất) → bớt theme → bớt loại hỏi đáp. Không
cắt validation, ghi file an toàn, backup, recovery, hay hỗ trợ macOS.

### 8.1. Trạng thái (cập nhật 13/10/2026)

| Giai đoạn | Trạng thái | Đã xong | Còn lại |
| --- | --- | --- | --- |
| 1. Lát cắt dọc | 🟡 Còn macOS | Phần TypeScript: schema v1 (Zod), `LessonCodec`, migration, hợp đồng plugin tự phát hiện theo thư mục, `cover` + `vocabulary`, theme `classic`, font Nunito nhúng. Phần Rust đã viết: ghi nguyên tử, kiểm tra hash, backup xoay vòng, draft, lock, nhập asset. 57 unit test đạt. Đã kiểm tra trong trình duyệt (bản giả lập lưu trữ): tạo → sửa → Lưu → mở lại; `lesson.html` mở bằng Chrome trình chiếu đúng. | Chưa thử trên macOS. *(Windows: Rust đã biên dịch, clippy sạch, 7 test Rust đạt; đã chạy app thật và kiểm tra lưu, backup, draft, xung đột khi file bị sửa bên ngoài, lock giữa hai tiến trình, phục hồi sau khi kill, lưu khi đóng cửa sổ.)* |
| 2. Editor | 🟢 Xong (Windows) | Library (tạo, mở, đổi tên, nhân bản, xoá vào Thùng rác; hiện tiêu đề bài); SlideNavigator (thêm, xoá, nhân bản, lên/xuống, kéo thả); PropertiesPanel tự dựng form từ `editor` spec, báo lỗi và cảnh báo giới hạn theo từng trường; nút Lưu + Ctrl+S/⌘S + trạng thái + xử lý xung đột; undo/redo (nút + Ctrl+Z/Ctrl+Y, ⌘Z/⇧⌘Z, gộp lần gõ); draft sau 1 giây + hỏi phục hồi khi mở bài; tự lưu sau 30 giây rảnh và khi đóng cửa sổ; thu nhỏ ảnh ≤ 1920 px khi nhập (giữ đúng chiều xoay EXIF); dọn asset không dùng khi đóng bài. Đã kiểm tra trong app thật trên Windows. | Chọn ảnh/audio qua hộp thoại chưa thử trong app thật. |
| 3. Dạy + Present | 🟢 Xong (Windows) | Đủ 7 loại slide nhóm 1 (`cover`, `vocabulary`, `picture-card`, `flashcard`, `dialogue`, `grammar`, `summary`). Present trong app dùng chung runtime với `lesson.html`: F5 từ đầu, Shift+F5 / nút "Trình chiếu" từ slide đang chọn, toàn màn hình, Esc thoát về đúng slide. Runtime: bước Tiếp/Lùi, `A`/`R`, Home/End, hiện từng phần chung cho mọi slide (`data-ls-reveal`), âm thanh phản hồi tổng hợp (WebAudio), pháo giấy. Đã kiểm tra trong app thật: chạy các bước của thẻ lật, hội thoại, ngữ pháp. | Thử bút trình chiếu thật; trình chiếu trọn một bài 15 slide. |
| 4. Hỏi đáp + theme | ⚪ Chưa bắt đầu | Tuỳ chọn chữ Khải đã có. | Nhóm 2; 4 theme còn lại. |
| 5. Trò chơi + công cụ lớp học | ⚪ Chưa bắt đầu | | |
| Ảnh và giọng đọc từ web (thêm ở Rev 6) | 🟢 Xong (Windows) | Tìm ảnh Bing, dán/kéo ảnh, giọng đọc Google Dịch, ghi nguồn ảnh. Đã kiểm tra trong app thật: tìm "quả táo" ra 30 ảnh trong ~2,5 giây, chèn ảnh, tạo giọng đọc 苹果, dán ảnh, kéo địa chỉ ảnh vào. | Kéo ảnh thật từ Chrome/Edge sang chưa thử bằng chuột thật. |
| 6. Import/Export + phát hành | ⚪ Chưa bắt đầu | Icon ứng dụng; cấu hình đóng gói NSIS / `.dmg`. | Export độc lập, AI import, mở HTML ngoài, ký số + notarize, hướng dẫn. |

---

## 9. Definition of Done

**Library và lưu trữ**
- [x] Tạo, mở, đổi tên, nhân bản, xoá (vào Thùng rác) bài học.
- [x] Mỗi bài có `lesson.html` + `assets/`; `lesson.html` mở được bằng trình duyệt.
- [ ] Đóng/mở lại ứng dụng không mất dữ liệu. *(Đã kiểm tra trên Windows; chưa thử macOS.)*
- [ ] Tên bài tiếng Việt có dấu hoạt động đúng trên cả Windows và macOS. *(Tên thư mục ASCII hoá, có test; chạy đúng trên Windows, chưa thử macOS.)*

**Visual Editor**
- [x] Sửa nội dung slide mà không cần biết HTML.
- [x] Thêm, xoá, nhân bản, kéo thả sắp xếp slide.
- [ ] Thay ảnh/audio, chỉnh thuộc tính template, đổi theme không mất nội dung. *(Đã có trong UI; chọn file ảnh/audio qua hộp thoại chưa thử trong app thật.)*
- [ ] Undo/redo cho mọi thao tác sửa document, kể cả nhập AI. *(Có cho mọi lệnh hiện tại; nhập AI chưa có.)*
- [x] Cảnh báo khi nội dung vượt giới hạn của template.
- [x] Nút Lưu, Ctrl+S / ⌘S và trạng thái lưu hiển thị đúng.

**Loại slide và theme**
- [ ] Đủ các loại slide nhóm 1 và 2 (nhóm 3 nếu không bị cắt). *(Nhóm 1 đủ.)*
- [ ] Mọi slide nhóm 1 và 2 chạy hết các bước chỉ bằng Tiếp/Lùi (bút trình chiếu). *(Nhóm 1 đạt với bàn phím; chưa thử bút thật.)*
- [ ] Mỗi slide hoạt động có phản hồi âm thanh/hiệu ứng và phím `A`/`R`.
- [ ] Bảng điểm đội, đồng hồ đếm ngược dùng được trong Present và file export.
- [x] Mỗi slide có ô ghi chú cho giáo viên, không hiện khi trình chiếu.
- [ ] 5 theme; âm thanh và hiệu ứng tắt được.
- [x] Thêm một loại slide mới chỉ cần thêm một thư mục trong `templates/`.

**Contract và import**
- [x] Schema v1 có kiểm thử; round-trip `doc → html → doc` bằng nhau cho mọi loại slide. *(Test tự chạy cho mọi template đã đăng ký.)*
- [x] HTML không đúng contract bị từ chối với thông báo dễ hiểu.
- [ ] JSON từ AI được validate, lỗi chỉ rõ vị trí; AI tạo được mọi loại slide.
- [x] File có `schemaVersion` cao hơn hoặc `type` lạ bị từ chối, không bị sửa.

**Autosave và recovery**
- [x] Draft ghi trong vòng ~1 giây sau thay đổi.
- [x] Backup hợp lệ tồn tại trước mỗi lần thay file chính.
- [ ] Kill tiến trình → mở lại → được đề nghị phục hồi, phục hồi đúng. *(Đã kiểm tra trên Windows; chưa thử macOS.)*
- [ ] File bị sửa từ bên ngoài (OneDrive/iCloud) trong lúc mở → không bị ghi đè âm thầm. *(Đã kiểm tra trên Windows với thư mục OneDrive; chưa thử iCloud.)*

**Present và Export**
- [ ] Editor, Present và Export hiển thị giống nhau. *(Editor và Present dùng chung hàm render và runtime; Export chưa có.)*
- [ ] Điều hướng bằng bàn phím và bút trình chiếu. *(Chạy đúng trong `lesson.html` trên Chrome và trong Present của app; chưa thử bút thật.)*
- [ ] File export mở offline trên máy không cài ứng dụng, chạy đúng trên Chrome,
      Edge và Safari; ảnh, audio, âm thanh phản hồi và tương tác hoạt động.

**Bảo mật và chất lượng**
- [ ] Không có `<script>` nào từ file ngoài hoặc AI được thực thi.
- [ ] Unit test cho schema, codec, migration, AI import, commands/undo và từng template. *(Đã có cho schema, codec, migration, commands, undo/redo, phát hiện draft, từng template; còn AI import.)*
- [ ] Test luồng tạo → sửa → lưu → mở lại → export (Vitest cho core; kiểm tra file
      export bằng Playwright trên Chromium và WebKit).
- [ ] Bộ cài Windows và macOS (đã ký, notarize) cùng hướng dẫn sử dụng ngắn.

---

## 10. Rủi ro

| Rủi ro | Cách xử lý |
| --- | --- |
| Round-trip lệch sau nhiều lần lưu | JSON nhúng là nguồn duy nhất; DOM luôn sinh lại; test round-trip. |
| Mất dữ liệu khi crash | Draft 1 giây, ghi tạm + rename, backup xoay vòng, recovery. |
| OneDrive / iCloud khoá hoặc đồng bộ đè file | Thử lại khi rename; kiểm tra hash trước khi ghi. |
| Khác biệt WebView2 và WKWebView | Thử mọi template trên cả hai; Playwright chạy Chromium + WebKit. |
| macOS chặn ứng dụng chưa ký | Đăng ký Apple Developer, ký + notarize trong CI từ sớm. |
| Không có máy Mac để build/test | CI macOS cho build; vẫn cần một máy Mac thật để thử trình chiếu. |
| Số loại slide lớn làm trễ tiến độ | Kiến trúc plugin + form tự dựng; trò chơi nằm ở giai đoạn có thể cắt. |
| Preview khác export | Một hàm render, một runtime, sân khấu 16:9 cố định. |
| Chữ tràn khung template | Giới hạn ký tự/phần tử; cảnh báo trong Editor. |
| Chữ Hán hiển thị sai glyph | `lang="zh-CN"` trên mọi đoạn tiếng Trung; font stack hệ thống. |
| File export quá lớn | Nén ảnh khi nhập; chỉ nhúng runtime cần thiết; cảnh báo kích thước. |
| Hình trang trí/âm thanh vướng bản quyền | Chỉ dùng tài nguyên tự làm hoặc CC0/OFL; ghi nguồn trong repo. |
| HTML ngoài chứa mã độc | Chỉ đọc JSON; không nạp DOM/script; CSP; capabilities tối thiểu. |
| Bing hoặc Google Dịch đổi giao diện/địa chỉ, tìm ảnh hoặc giọng đọc ngừng chạy | Mỗi nguồn nằm trong một hàm của `web.rs`; dán/kéo ảnh và chọn file vẫn dùng được khi nguồn hỏng. |
| Ảnh tải từ web độc hại hoặc quá lớn | Nhận diện theo nội dung (không SVG), giới hạn 20 MB, giải mã lại khi thu nhỏ; không tải từ địa chỉ nội bộ. |
| Thay đổi schema làm hỏng bài cũ | `schemaVersion`, migration tuần tự có backup và test. |

---

## 11. Ngoài phạm vi MVP

Ưu tiên sau MVP: thứ tự nét chữ (dữ liệu nét chỉ nhúng cho các chữ dùng trong
bài), bảng Jeopardy, chế độ người trình bày (màn hình giáo viên xem ghi chú và
slide kế tiếp, máy chiếu chỉ hiện slide), tự sinh pinyin từ chữ Hán (thư viện
offline), ghi âm giọng giáo viên trong ứng dụng.

Chưa làm:
- Hoạt động do học sinh tự thao tác (bảng tương tác, máy tính bảng, bài tập về nhà).
- Canvas tự do kiểu PowerPoint/Canva.
- Chuyển đổi HTML tuỳ ý sang Lesson Studio.
- Gọi AI API trực tiếp.
- Đồng bộ cloud, tài khoản, cộng tác; lưu kết quả học của từng học sinh.
- Kho template trực tuyến; plugin template do người dùng tự viết.
- Linux, auto-update.
- Nhúng font chữ Hán.
- Ngăn người nhận sao chép file export.

---

## 12. Lịch sử thay đổi

### Rev 6

| Thay đổi | Lý do |
| --- | --- |
| Tìm ảnh bằng Bing Images trong Editor; dán/kéo ảnh từ trình duyệt | Yêu cầu của người dùng: lấy ảnh nhanh như các add-on Anki. Google Images đã thử nhưng chỉ trả trang đòi JavaScript. Người dùng chấp nhận rủi ro bản quyền vì bài chỉ để dạy, không bán. |
| Giọng đọc tiếng Trung bằng Google Dịch (bỏ khỏi "Ngoài phạm vi MVP") | Yêu cầu của người dùng. Giọng hệ thống không dùng được: máy Windows tiếng Việt/Anh thường không có giọng tiếng Trung. |
| Mạng chỉ đi qua Rust; webview vẫn không có quyền mạng | Giữ CSP chặt và ranh giới bảo mật cũ; Rust chặn địa chỉ nội bộ. |
| `assets[].source` | Ghi nơi lấy ảnh để giáo viên tìm lại. Trường tuỳ chọn nên `schemaVersion` giữ nguyên 1. |
| Library hiển thị tiêu đề bài; đổi tên không đổi thư mục; xoá vào Thùng rác | Tên thư mục ASCII khó đọc; đổi thư mục khi đang đồng bộ OneDrive/iCloud dễ gây xung đột. |

### Rev 5

| Thay đổi | Lý do |
| --- | --- |
| Tên thư mục bài học là ASCII (`Hoa-qua`), không giữ dấu tiếng Việt | Hợp lệ trên mọi hệ thống file và dịch vụ đồng bộ, tránh lệch NFC/NFD của macOS. |
| Chữ Hán luôn mang `lang="zh-CN"`, kể cả bài dùng chữ phồn thể | Một quy ước duy nhất; font giản thể hệ thống vẫn hiển thị được chữ phồn thể. |
| Thêm mục 8.1 theo dõi trạng thái từng giai đoạn | Ghi lại tiến độ triển khai. |

### Rev 4

| Thay đổi | Lý do |
| --- | --- |
| Giáo viên là người dùng duy nhất; mọi hoạt động do giáo viên điều khiển | Rev 3 thiết kế bài luyện tập và trò chơi như thể trẻ tự bấm, trong khi thực tế giáo viên trình chiếu và cả lớp trả lời bằng lời. |
| Mỗi slide hoạt động là chuỗi bước chạy bằng Tiếp/Lùi | Giáo viên thường đứng giữa lớp với bút trình chiếu, chỉ có hai nút. |
| Đổi nhóm "Luyện tập" thành "Hỏi đáp trên lớp"; thêm `tone-pick`, `sort-groups` | Hiện đáp án theo từng bước thay vì chấm đáp án trẻ chọn; luyện thanh điệu là hoạt động đặc thù của tiếng Trung. |
| Nhóm trò chơi chọn theo các trò PPT phổ biến: `whats-missing`, `guess-picture`, `box-pick`, `lucky-wheel`, `memory` | Đây là những trò giáo viên ngoại ngữ cho trẻ đã quen dùng (xem nguồn ở 4.3). Bỏ `mystery-picture`, `flash-reveal` vì đã gộp vào `guess-picture`. |
| Thêm bảng điểm đội, đồng hồ đếm ngược, chọn ngẫu nhiên vào MVP | Hầu hết trò chơi trên lớp chơi theo đội; `box-pick` cần bảng điểm. |
| Ghi chú giáo viên cho mỗi slide | Chi phí thấp, hữu ích khi soạn và dạy. |
| Bỏ yêu cầu vùng bấm lớn cho trẻ, thay bằng cỡ chữ tối thiểu nhìn rõ từ cuối lớp | Trẻ không bấm; trẻ nhìn từ xa. |
| Roadmap 15–17 tuần | Thêm công cụ lớp học và loại slide. |

### Rev 3

| Thay đổi | Lý do |
| --- | --- |
| Hỗ trợ cả Windows và macOS từ MVP | Yêu cầu của người dùng. Kéo theo: đường dẫn theo OS, chuẩn hoá NFC, iCloud, ký + notarize, thử trên WKWebView và Safari. |
| Nút Lưu + Ctrl+S/⌘S, giữ autosave | Yêu cầu của người dùng. Autosave chuyển sang 30 giây khi rảnh để nút Lưu vẫn có ý nghĩa, draft 1 giây vẫn chống mất dữ liệu. |
| 14 loại slide chia 3 nhóm, 5 theme | Bài cho trẻ em cần nhiều dạng hoạt động và hình ảnh để giữ hứng thú. |
| Kiến trúc plugin cho template và theme | Với 14 loại slide, mỗi loại phải tự chứa và form chỉnh sửa phải tự dựng, nếu không chi phí thêm loại mới tăng tuyến tính theo UI. |
| Phản hồi âm thanh/hiệu ứng, nút Làm lại, vùng bấm lớn | Phục vụ trẻ em và bảng tương tác. |
| Ghép cặp bằng bấm thay vì kéo thả | Kéo thả khó dùng trên máy chiếu và bảng tương tác. |
| Font Latin tròn nhúng, tuỳ chọn chữ Khải | Dễ đọc cho trẻ; chữ Khải gần chữ viết tay được dạy ở trường. |
| Roadmap 14–16 tuần, trò chơi là phần cắt đầu tiên | Phạm vi tăng đáng kể. |

### Rev 2

| Thay đổi | Lý do |
| --- | --- |
| JSON nhúng thay vì parse DOM | Parse ngược DOM dễ hỏng khi markup thay đổi; JSON round-trip chắc chắn và vẫn mở được bằng trình duyệt. |
| Gộp contract version và schema version | Hai số phiên bản cho một định dạng chỉ thêm tổ hợp phải migrate. |
| CSS/runtime nhúng vào `lesson.html` | Ví dụ cũ tham chiếu `./lesson.css` không có trong cấu trúc thư mục. |
| Chính sách autosave cụ thể | Bản đầu để ngỏ "theo chính sách đã định nghĩa". |
| Kiểm tra hash, lock, retry khi rename | Thư mục Documents thường được đồng bộ cloud. |
| Không nhúng font chữ Hán | Font đầy đủ nặng 10–20 MB mỗi kiểu. |
| `lang` theo từng đoạn | Thiếu `lang="zh-CN"`, chữ Hán có thể hiển thị bằng glyph Nhật. |
| Độ bền dữ liệu làm từ giai đoạn đầu | Bản đầu gọi là nền móng nhưng xếp vào tuần cuối. |
| Bỏ ảnh hotlink và sơ đồ SVG nhúng | Có thể hỏng hoặc vướng bản quyền; sơ đồ text dễ review hơn. |
