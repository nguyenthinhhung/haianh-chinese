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

> Lịch sử các lần sửa ở mục 12 (bản hiện tại: Rev 20).

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
  label: string;                   // "Ghép cặp"
  description: string;             // một dòng cho menu "Thêm slide"
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

**Đóng cửa sổ** (`src-tauri/src/closing.rs`): Rust chặn lệnh đóng, gửi sự kiện
`app-close-requested` cho trang. Trang trả lời `close_ack` ngay, lưu bài, rồi gọi
`close_window`; lưu thất bại thì cửa sổ ở lại để báo lỗi, đóng lần nữa thì thoát và
để draft lại cho lần sau. Trang không trả lời trong 3 giây (bị tải lại thành trang
trắng hoặc trang lỗi, bị treo) thì Rust tự đóng. Không dùng `onCloseRequested` của
Tauri: sau khi trang tải lại, listener cũ vẫn được Tauri giữ và chặn đóng mãi mãi.

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
| `settings` | `{ sound: boolean, animations: boolean, hanziFont: "sans" \| "kai", pinyin: boolean }`. `pinyin: false` ẩn pinyin khi soạn và chiếu, trừ slide `tone-pick` (pinyin là đáp án). |
| `slides[]` | `{ id, type, content, layout?, notes? }` — `content` validate theo schema của `type`. `notes` là ghi chú riêng của giáo viên (gợi ý câu hỏi, cách dẫn dắt), không hiện khi trình chiếu. |
| `assets[]` | `{ id, file, kind: "image" \| "audio", mime, alt?, source?, needsReview?, query? }` — `source` là trang web nơi lấy ảnh, để giáo viên tìm lại. `needsReview: true` đánh dấu ảnh ứng dụng tự chọn mà giáo viên chưa duyệt; `query` là từ khoá đã tìm ra ảnh, để nút Đổi bắt đầu từ đó. |
| `metadata` | `createdAt`, `updatedAt`, `appVersion`. |

Schema định nghĩa một lần bằng Zod. Prompt cho AI mô tả từng loại slide bằng
`aiSchemaHint` kèm một ví dụ hợp lệ; kết quả AI đi qua đúng các schema Zod đó.
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
| `book-page` | Một ảnh lớn chiếm cả slide, thường là ảnh chụp trang giáo trình (dán Ctrl+V), kèm chú thích và file nghe của trang. Để bài bám đúng sườn giáo trình mà không phải gõ lại. |
| `vocabulary` | 1–8 từ: chữ Hán, pinyin, nghĩa, từ loại (tuỳ chọn), ảnh, audio; bật/tắt ẩn nghĩa. |
| `picture-card` | Một từ chiếm cả slide: ảnh lớn, chữ Hán lớn, pinyin, bấm để nghe. Tuỳ chọn cho học sinh lớn: từ loại, cách dùng (cách kết hợp) và tối đa 2 câu ví dụ, hiện trong khung bên cạnh, sau chữ một bước khi đoán hình trước. |
| `flashcard` | Thẻ lật: mặt trước ảnh (lật ra chữ Hán) hoặc chữ Hán (lật ra ảnh), mặt sau kèm pinyin và nghĩa. Tiếp lật thẻ kế tiếp còn úp; giáo viên cũng bấm chuột hoặc gõ số để lật thẻ bất kỳ, bấm lại thì úp xuống; Lùi úp lại theo thứ tự đã lật. |
| `dialogue` | Các lượt thoại theo vai, có ảnh nhân vật. Tuỳ chọn nơi diễn ra (在饭馆, như giáo trình ghi từng cảnh) và một file nghe cho cả bài (bài nghe của giáo trình). |
| `grammar` | Cấu trúc, giải thích, câu ví dụ có tô màu thành phần. |
| `passage` | Bài khoá dài (HSK 3–4): đoạn văn hoặc hội thoại nhiều lượt, đến 400 chữ, kèm hộp 生词 và file nghe. Tiếp lần lượt thay chữ Hán bằng pinyin rồi bản dịch, vì ba bản cùng lúc không vừa slide. |
| `word-study` | Từ mới như slide 生词 của giáo viên: 1–2 thẻ từ, một chữ viết theo thứ tự nét trong ô 田字格 (Tiếp viết lần lượt từng nét), câu ví dụ, ảnh. Nét viết (SVG path của Make Me a Hanzi qua hanzi-writer-data) do Rust tải (`hanzi_strokes`) khi giáo viên gõ chữ và lưu trong slide (`strokes`, `strokesFor`; `managedKeys` của template), nên trình chiếu và file export không cần mạng. |
| `word-family` | 旧字新词 (ghép hai từ cũ thành từ mới) hoặc 扩展 同字词 (các từ có chung một chữ, chữ chung được tô màu); Tiếp hiện từng từ. |
| `table` | Bảng: ô ngăn bằng `|`, ô trống để lớp điền; tuỳ chọn hiện từng hàng. Dùng cho bảng ngữ pháp kiểu sách, bảng 运用, bảng số / giờ. |
| `culture` | Văn hoá / 俗语: ảnh, câu tục ngữ kèm pinyin, đoạn đọc; Tiếp hiện bản dịch. |
| `compare` | 比一比: hai từ dễ nhầm, điểm giống, 1–3 điểm khác (hiện từng ý), bảng chọn từ ✓/✗ cho tối đa 5 câu. |
| `summary` | Điểm cần nhớ, từ vựng chính. |

**Nhóm 2 — Hỏi đáp trên lớp (MVP)**

Giáo viên đặt câu hỏi, học sinh trả lời bằng lời, giáo viên bấm Tiếp để hiện đáp
án. Không slide nào đòi hỏi học sinh tự bấm.

| Template | Giáo viên dùng thế nào | Các bước khi bấm Tiếp |
| --- | --- | --- |
| `qa-list` | Hỏi đáp về bài khoá/hội thoại: 1–6 câu hỏi (chữ Hán hoặc tiếng Việt), đáp án ẩn bên cạnh. | Mỗi lần Tiếp hiện đáp án một câu. |
| `sentence-practice` | 练一练: hoàn thành câu/đối thoại với từ cho sẵn (hiện trong ngoặc như sách), hoặc dịch câu; 1–5 câu. | Mỗi lần Tiếp hiện đáp án mẫu một câu. |
| `speaking` | 对话练习 / 双人活动 / 小组活动 / 复述: hình gợi ý kèm từ để thay, cặp hỏi–đáp mẫu trong bong bóng, cấu trúc phải dùng ("dùng ít nhất N"). | Không có bước; giáo viên điều khiển bằng lời. |
| `picture-talk` | Mô tả tranh (练习 3 của HSK 2–3): 1–4 tranh, mỗi tranh một câu có chỗ trống. | Mỗi lần Tiếp hiện đáp án một tranh. |
| `pronunciation` | 语音: quy tắc và các dòng đọc theo, chấm đỏ dưới âm tiết có trọng âm, mũi tên ngữ điệu, nút nghe. | Không có bước. |
| `listening` | Bài nghe: file của giáo trình (hoặc giọng đọc tạo từ lời), 0–4 câu hỏi, lời bài nghe có pinyin và nghĩa. | Mỗi lần Tiếp hiện đáp án một câu, cuối cùng hiện lời bài nghe. |
| `quiz` | Hỏi cả lớp; đề là chữ, ảnh hoặc audio ("nghe và chọn hình"); 2–4 lựa chọn đánh số/chữ cái để trẻ gọi tên; có biến thể Đúng/Sai. | Hiện câu hỏi → hiện đáp án đúng (sáng lên + âm thanh). |
| `matching` | Hai cột chữ Hán ↔ nghĩa, hoặc ↔ hình khi `rightAs: "image"` (ảnh tự tìm theo nghĩa); trẻ nói cặp nào đi với nhau. | Mỗi lần Tiếp nối thêm một cặp. |
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
| `memory` | Memory / Pairs | Thẻ úp đánh số; trẻ gọi hai số, giáo viên bấm lật. Trùng cặp thì giữ mở. `secondAs: "image"`: thẻ thứ hai của mỗi cặp là hình (tìm cặp chữ ↔ hình). |

Các trò cần chọn vị trí (`guess-picture` mở từng ô, `box-pick`, `memory`) cho
phép giáo viên bấm chuột hoặc gõ số trên bàn phím (số có hai chữ số được gom lại,
gửi sau một nhịp ngắn hoặc khi bấm Enter); các trò còn lại chạy chỉ bằng Tiếp/Lùi.
`guess-picture` mở từng ô vẫn chạy được bằng bút trình chiếu: Tiếp mở một ô ngẫu
nhiên, hết ô thì hiện đáp án. `lucky-wheel` mỗi lần Tiếp quay đến một ô chưa trúng;
quay hết thì Tiếp sang slide sau. `box-pick` và `memory` chơi theo lượt đội: điểm
cộng thẳng vào bảng điểm cho đội đang có lượt.

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
- Bảng điểm 2–4 đội: `1`–`4` cộng điểm, `Shift`+số trừ điểm, `S` hiện/ẩn; bấm
  vào bảng để cộng/trừ, thêm đội, về 0 hoặc chọn đội có lượt. Trên slide trò chơi
  chọn ô bằng số, phím số dùng để chọn ô; khi đó cộng điểm bằng cách bấm vào bảng.
- Đồng hồ đếm ngược: `T` chạy/dừng, `Shift+T` tắt; bấm vào đồng hồ khi đang dừng
  để đổi 15/30/60/90/120 giây; hết giờ có tiếng báo và nhấp nháy.
- Chọn ngẫu nhiên số thứ tự học sinh: `N` (sĩ số lưu trên máy), `Shift+N` tắt.
- `H`: bảng phím tắt cho giáo viên.
- Các công cụ nằm trong runtime (`runtime/tools.js`), nên chạy cả trong Present
  của app lẫn khi mở `lesson.html` bằng trình duyệt.

Quy ước chung cho slide hoạt động:
- Phản hồi rõ ràng cho cả lớp: âm thanh + hiệu ứng khi hiện đáp án đúng, pháo giấy
  khi hoàn thành; tắt được qua `settings`.
- Chữ và hình đủ lớn để nhìn rõ từ cuối lớp; mỗi template đặt cỡ chữ tối thiểu.
- Phím tắt cho giáo viên: `A` hiện ngay toàn bộ đáp án, `R` làm lại slide.
- Rời slide rồi quay lại thì slide bắt đầu lại từ đầu.

### 4.4. Theme

Có 15 theme, mỗi theme gồm bảng màu (kể cả 6 màu phân loại `--ls-c1`…`--ls-c6`
dùng cho cặp ghép, thành phần ngữ pháp, thanh điệu, nhóm), hình trang trí SVG và
kiểu khung slide:

| Theme | Phong cách | Lứa tuổi |
| --- | --- | --- |
| `garden` | Vườn hoa, màu pastel ấm. | 3–8 |
| `panda` | Gấu trúc, tre, đỏ–xanh lá (gợi văn hoá Trung Hoa). | 3–8 |
| `ocean` | Đại dương, xanh mát. | 6–11 |
| `space` | Vũ trụ, nền tối, ngôi sao. | 6–11 |
| `classic` | Gọn gàng. | 9+ |
| `notebook` | Vở ô ly: giấy kẻ ô, lề đỏ, ô 田字格. | 9+ |
| `ink` | Thuỷ mặc: giấy dó, núi mực, con dấu đỏ; màu trầm. | 9+ |
| `spring` | Mùa xuân (Tết): hồng đào, đèn lồng đỏ. | 3–11 |
| `summer` | Mùa hè: trời xanh, mặt trời, dưa hấu. | 3–11 |
| `autumn` | Mùa thu (Trung thu): trăng rằm, lá phong. | 3–11 |
| `winter` | Mùa đông: bông tuyết, người tuyết. | 3–11 |
| `greatwall` | Vạn Lý Trường Thành: tường thành trên đồi, mây cát tường. | 6+ |
| `porcelain` | Sứ Thanh Hoa: trắng sứ, xanh cobalt, viền slide như đĩa men. | 9+ |
| `papercut` | Tranh cắt giấy: hai bông song hoa đỏ. | 3–11 |
| `tea` | Trà: xanh lá trà, ấm gốm. | 9+ |

Trang trí của các theme mới đặt hai bên dòng tiêu đề: các slide nhiều thẻ (từ
vựng, thẻ lật) chiếm gần hết chiều cao nên góc dưới bị che.

Mỗi theme khai báo `ages`. Đây chỉ là gợi ý: ô chọn theme xếp theo tuổi và ghi
khoảng tuổi bên cạnh tên, không khoá lựa chọn. Bài tạo bằng AI nhận theme gợi ý
của lứa tuổi đã chọn (mục 5.B).

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

Giáo viên không viết prompt. Họ chọn nội dung bài; ứng dụng quyết định trình tự
và loại slide; AI chỉ viết phần ngôn ngữ (chữ Hán, pinyin, nghĩa, ví dụ, câu hỏi).

1. Giáo viên điền `LessonRequest`. Ngoài: chủ đề, lứa tuổi, dạng bài, thời lượng,
   từ cần dạy, dàn ý. Trong "Tuỳ chỉnh nâng cao": mẫu câu, từ lớp đã học (AI dùng
   lại trong câu và trò chơi, không dạy lại), nội dung không đưa vào (chữ Hán bị
   loại mà vẫn xuất hiện thì cảnh báo), hoạt động muốn có, yêu cầu thêm. Lựa chọn
   được nhớ cho lần sau (`localStorage`). **Mẫu** (preset) lưu cách dạy (lứa tuổi,
   dạng bài, thời lượng, dàn ý, hoạt động, yêu cầu thêm) theo tên, không lưu chủ
   đề và từ. `LessonRequest` và mẫu chỉ dùng để tạo prompt, không ghi vào
   `lesson.html`; `normalizeRequest` đọc được cả cấu hình lưu từ bản cũ.
2. **Lứa tuổi** (`core/ages.ts`): Mầm non 3–5, Tiểu học lớp 1–3 (6–8), lớp 4–5
   (9–11), THCS 12+. Mỗi mốc có lời dặn cho AI, số từ mới gợi ý, các loại slide
   quá sức (mầm non chưa biết đọc nên bỏ `grammar`, `fill-blank`, `sentence-order`)
   và theme gợi ý.
3. **Blueprint** (`core/lessonPlan.ts`): mỗi dạng bài (Từ vựng, Hội thoại, Mẫu câu,
   Ôn tập, Tổng hợp) là một chuỗi bước, mỗi bước gồm vai trò, các loại slide được
   dùng và số slide cho bài ngắn/vừa/dài (khoảng 20/35/45 phút). Bỏ loại quá sức
   với lứa tuổi; dạng bài mất bước chính thì không hiện (mầm non không có "Mẫu
   câu"). Hoạt động giáo viên chọn thu hẹp các bước luyện tập/trò chơi; bước
   không còn loại nào chuyển số slide sang bước hoạt động kế tiếp, nên độ dài bài
   giữ nguyên. **Dàn ý** (`planOutline`) hiện mọi bước kể cả bước tuỳ chọn đang
   là 0; giáo viên đổi số slide từng bước bằng −/+ (`outline`, theo tên bước).
   Bước bài học dựa vào (mở đầu, dạy từ, tổng kết…) giữ tối thiểu 1; bước hoạt
   động và bước tuỳ chọn bỏ được. Đổi dạng bài, lứa tuổi, thời lượng hay hoạt
   động thì dàn ý về lại gợi ý. Dàn ý chỉ dùng các bước của blueprint, không có
   bước tự đặt tên, để app vẫn quyết định loại slide của từng bước.
4. **Sao chép lời nhắn cho AI**: prompt gồm yêu cầu của giáo viên, trình tự slide
   bắt buộc, `aiSchemaHint` của **chỉ những loại slide trình tự dùng**, quy tắc và
   một ví dụ định dạng (có test bảo đảm ví dụ hợp lệ). AI luôn ghi đủ pinyin và
   nghĩa; ẩn hay hiện là việc của `settings.pinyin`, nên một bài dùng được cho
   nhiều lớp. Ở các trường ảnh tự điền (mục 5.E), AI ghi một từ khoá tiếng Anh
   ngắn; ứng dụng giữ từ khoá để tìm ảnh rồi bỏ khỏi nội dung. Link, tên file và
   âm thanh AI tự thêm bị bỏ.
5. Người dùng dán kết quả vào hộp thoại nhập; ứng dụng tự bỏ khung ```` ```json ````
   và đoạn văn thừa.
6. Validate theo schema Zod; lỗi hiển thị theo vị trí ("Slide 3, từ 2: thiếu
   pinyin") và chặn nhập. Trước đó, mục danh sách AI viết thành chuỗi trần
   (`"segments": ["猫"]`) được đặt vào trường chữ đầu tiên của mục
   (`{"text": "猫"}`): ChatGPT hay viết vậy, và ý định thì không mơ hồ. Prompt
   ghi kèm giới hạn ký tự của từng trường (`lengthLimits`): lấy giá trị nhỏ hơn
   giữa mức vừa slide (`limits` của template) và giới hạn cứng (đọc từ JSON Schema
   mà Zod sinh ra); chỉ ghi các giới hạn ≤ 50. AI không tự đoán được, ví dụ ô vòng
   quay nhập được 16 ký tự nhưng chỉ khoảng 8 ký tự là đọc rõ trên múi quay.
7. Kiểm tra mềm, chỉ **cảnh báo**, không chặn: thiếu từ bắt buộc (chỉ xét từ viết
   bằng chữ Hán), loại slide quá sức với lứa tuổi, số slide lệch dự kiến quá 2,
   pinyin không khớp số chữ (mỗi chữ một âm tiết cách nhau bằng dấu cách; bỏ qua
   chuỗi có chữ Latin/số; 儿 hoá được chấp nhận), âm tiết không phải cách đọc nào
   của chữ đó (`misreadCharacters`, kèm cách đọc gợi ý). Một cách đọc có thật
   nhưng sai ngữ cảnh (还 đọc hái trong 还书) không bắt được. Lỗi và cảnh báo đều
   có nút sao chép thành lời nhắn để AI sửa. Pinyin AI bỏ trống được tự điền.
8. Xem trước → **Tạo bài mới** (theme theo lứa tuổi) hoặc **Thêm vào cuối bài
   hiện tại** (giữ theme của bài).
9. ID do ứng dụng gán; slide cần ảnh nhận ô placeholder cho tới khi ảnh được tự
   tìm xong (mục 5.E).
10. Một lần nhập = một bước undo.

Không gọi AI API trong MVP.

### C. Preview, Present và Export
- Editor hiển thị slide bằng chính hàm render, thêm lớp chỉnh sửa.
- Present: toàn màn hình; ←/→, PageUp/PageDown, Space, Esc; hỗ trợ bút trình chiếu.
- Chế độ người trình chiếu (như PowerPoint): khi có màn hình thứ hai, app mở một
  cửa sổ `audience-<id>` toàn màn hình trên màn hình đó, chạy runtime thật (âm
  thanh, trò chơi, chọn ngẫu nhiên chỉ xảy ra một lần, ở màn chiếu). Cửa sổ chính
  thành màn hình người trình chiếu: gửi phím và cú bấm sang, nhận lại trạng thái
  (`onState`: slide, bước, màn đen) và bản sao HTML của slide hiện tại để hiển thị
  tĩnh. Mỗi lần chiếu có cửa sổ và cặp tên sự kiện riêng, nên cửa sổ cũ đang đóng
  không chen vào lần chiếu mới. Một màn hình: chiếu như cũ kèm thanh điều khiển
  nổi; Alt+F5 bật chế độ người trình chiếu ngay trên màn hình đó (runtime chạy
  trong khung slide). `B`/`W` (màn đen/trắng) nằm trong runtime nên file export
  cũng có.
- Export: render + runtime của các template được dùng + asset nhúng → một file
  `.html`. Asset không còn dùng bị bỏ trước. Mỗi file ảnh/âm thanh chỉ nhúng
  **một lần**, trong khối JSON `#lesson-assets` (đường dẫn `assets/…` → `data:` URL);
  slide vẫn trỏ `assets/…` và runtime thay bằng dữ liệu nhúng khi mở trang (chỉ
  nhận `data:image/…` và `data:audio/…`). Nhờ vậy file không chứa hai bản của mỗi
  ảnh, và mở lại file export vẫn lấy được ảnh mà chỉ cần đọc JSON. Báo kích thước
  sau khi xuất, cảnh báo khi vượt ~50 MB.
- Slide tương tác chạy giống hệt trong Present và file export.
- File export phải chạy đúng trên Chrome, Edge và **Safari**.

### D. Mở HTML từ bên ngoài
`Chọn file → kiểm tra meta + #lesson-data → parse JSON → migrate → validate →
sao chép vào Library → mở Editor`. Không có chuyển đổi HTML tuỳ ý.
- Bài chép vào luôn nhận **ID mới**, để không bao giờ dùng chung draft, backup hay
  lock với một bài đã có trong Library.
- Ảnh/âm thanh lấy từ `#lesson-assets` (file export) hoặc thư mục `assets/` cạnh
  file được chọn (`lesson.html` chép từ máy khác). Rust nhớ file vừa chọn qua hộp
  thoại và chỉ cho chép từ thư mục cạnh file đó; mỗi file được kiểm tra tên và nội
  dung (chỉ ảnh, âm thanh). Thiếu file nào thì báo cho giáo viên.

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
- **Bộ lọc hình vẽ** (`qft=+filterui:photo-clipart`): bật sẵn cho bài của trẻ
  dưới 9 tuổi (theo lứa tuổi khi tạo bằng AI, theo `ages` của theme khi tìm tay).
  Từ khoá tiếng Việt cho kết quả kém hơn hẳn: ngay cả khi bật SafeSearch nghiêm
  ngặt, ảnh đầu tiên khi tìm "con mèo" là "con mèo cầm súng", còn tìm "quả cam"
  thì ra ảnh minh hoạ bài báo dinh dưỡng.

**Tự điền ảnh.** Template đánh dấu `autoImage` ở các ô ảnh mà thiếu thì slide hỏng
hoặc kém hẳn: `vocabulary`, `picture-card`, `flashcard`, `guess-picture`,
`whats-missing`, cùng `matching` và `memory` khi slide chọn hiện hình
(`rightAs` / `secondAs`; `autoImage` nhận một hàm đọc nội dung slide). Ảnh thay
cho chữ mà slide không chọn (lựa chọn của `quiz`, `sort-groups`, `box-pick`) và
ảnh không bắt buộc (`cover`, nhân vật `dialogue`) không tự điền, vì điền vào sẽ
đổi cách chơi của slide.

1. Sau khi nhập bài từ AI, hoặc khi bấm **Tìm ảnh ô trống**, `imageJobs` gom các
   ô trống. Từ khoá là từ khoá AI ghi, nếu không có thì dùng chữ của ô.
2. Hàng đợi (`useImageFill`) chạy nền, mỗi lần một việc. Cùng một từ khoá chỉ tìm
   và tải một lần. Với mỗi từ khoá: **1 request tới Bing** (`search_image_candidates`,
   không tải ảnh xem trước), rồi tải ảnh gốc của kết quả đầu tiên. Nếu không tải
   được thì thử kết quả kế tiếp, tối đa 3. Không có hình vẽ thì tìm lại không lọc.
3. Rust cho các lần gọi trang tìm của Bing cách nhau ít nhất 0,7 s cộng thêm tối
   đa 0,3 s ngẫu nhiên, và chỉ chạy một lần tìm tại một thời điểm. Ảnh xem trước
   (CDN của Bing) và ảnh gốc (trang khác) không bị giãn cách. Mã lỗi 403/429/503
   hoặc trang captcha trả về `rate-limited`; hàng đợi dừng và hiện **Thử lại**.
4. Kết quả tìm được cache theo từ khoá + trang + bộ lọc trong
   `image-search-cache.json` ở thư mục dữ liệu ứng dụng (7 ngày, tối đa 150 từ
   khoá), nên **Đổi** mở ngay và bài sau dùng lại từ cũ không gọi Bing. Ảnh xem
   trước xin cỡ 240 px (khoảng 8–10 KB thay vì khoảng 31 KB).
5. Ảnh tìm xong được ghi bằng `applyInBackground`: thay đổi được áp lên mọi
   snapshot của lịch sử thay vì thêm một bước, nên Ctrl+Z không xoá ảnh và không
   phải lùi qua từng ảnh. `fillImageSlot` bỏ qua ô đã có ảnh, slide đã xoá, hoặc
   ô nay chứa từ khác (danh sách bị sửa trong lúc tìm).
6. Ảnh tự chọn mang `needsReview`: chấm cam ở danh sách slide, dòng "chưa duyệt"
   ở ô ảnh, và màn hình **Duyệt ảnh** gom mọi ảnh như vậy (Đổi / Giữ / Giữ tất
   cả). Ảnh giáo viên tự chọn không bao giờ mang dấu này.
7. Đo ngày 2026-10-14: 20 lượt tìm liên tiếp không nghỉ đều trả 200. Bài thử có
   10 ô ảnh nhưng chỉ 5 từ khoá, tìm xong trong vài giây.
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
| `AiImportService` | core | Trích JSON, validate, ánh xạ lỗi, gán ID; dựng prompt từ `LessonRequest`. |
| `LessonPlan` | core | Hồ sơ lứa tuổi, blueprint theo dạng bài, trình tự slide, cảnh báo sau khi nhập; kiểm tra pinyin (`pinyinCheck.ts`). |
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
| 4. Hỏi đáp + theme | 🟢 Xong (Windows) | Đủ 6 loại slide nhóm 2 (`quiz` có biến thể Đúng/Sai và đề bằng ảnh/âm thanh, `matching`, `fill-blank`, `sentence-order`, `tone-pick` tự lấy thanh từ dấu pinyin, `sort-groups`); thứ tự xáo trộn cố định theo ID slide nên Editor, Present và file giống nhau; hoàn thành có pháo giấy. 5 theme (`classic`, `garden`, `ocean`, `space` nền tối, `panda`); tuỳ chọn chữ Khải. Trường form hiện theo điều kiện. Chữ Hán lẫn trong câu tiếng Việt được gắn `lang="zh-CN"` riêng. Đã kiểm tra trong app thật: chạy các bước của cả 6 loại và xem 5 theme. | Thử trên lớp thật. |
| 5. Trò chơi + công cụ lớp học | 🟢 Xong (Windows) | Đủ 5 trò nhóm 3 (`whats-missing`, `guess-picture` với 4 cách chơi, `box-pick`, `lucky-wheel`, `memory`), mỗi trò có `interaction.js` riêng qua các hook mới của runtime (Tiếp/Lùi tự xử lý, chọn ô bằng số, vào/rời slide). Công cụ lớp học: bảng điểm đội, đồng hồ đếm ngược, gọi số ngẫu nhiên, bảng phím tắt. Runtime có test chạy thật trong DOM giả lập (happy-dom) cho từng trò. Đã kiểm tra trong app thật. | Dạy thử một buổi với lớp thật. |
| Ảnh và giọng đọc từ web (thêm ở Rev 6) | 🟢 Xong (Windows) | Tìm ảnh Bing, dán/kéo ảnh, giọng đọc Google Dịch, ghi nguồn ảnh. Đã kiểm tra trong app thật: tìm "quả táo" ra 30 ảnh trong ~2,5 giây, chèn ảnh, tạo giọng đọc 苹果, dán ảnh, kéo địa chỉ ảnh vào. | Kéo ảnh thật từ Chrome/Edge sang chưa thử bằng chuột thật. |
| 6. Import/Export + phát hành | 🟡 Còn macOS + ký số | Xuất một file HTML độc lập (asset nhúng một lần trong `#lesson-assets`); nhập bài từ AI (tạo bài mới hoặc thêm vào cuối bài, một bước undo); mở file bài học từ ngoài (file export hoặc `lesson.html` kèm `assets/`). Bộ cài Windows NSIS build được (`Chinese Lesson Studio_0.1.0_x64-setup.exe`, 5,3 MB), bản release đã chạy thử. Hướng dẫn ngắn: `HUONG-DAN.md`. Đã kiểm tra: file export chạy trên Chrome không cần app (ảnh, audio, trò chơi, công cụ lớp học). | Ký số Windows; build, ký và notarize bản macOS (cần máy Mac hoặc CI macOS); thử file export trên Edge, Safari; thử hộp thoại chọn/lưu file bằng tay. |

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
- [x] Undo/redo cho mọi thao tác sửa document, kể cả nhập AI.
- [x] Cảnh báo khi nội dung vượt giới hạn của template.
- [x] Nút Lưu, Ctrl+S / ⌘S và trạng thái lưu hiển thị đúng.

**Loại slide và theme**
- [x] Đủ các loại slide nhóm 1 và 2 (nhóm 3 nếu không bị cắt). *(Đủ cả nhóm 3.)*
- [ ] Mọi slide nhóm 1 và 2 chạy hết các bước chỉ bằng Tiếp/Lùi (bút trình chiếu). *(Nhóm 1 và 2 đạt với bàn phím; chưa thử bút thật.)*
- [x] Mỗi slide hoạt động có phản hồi âm thanh/hiệu ứng và phím `A`/`R`.
- [x] Bảng điểm đội, đồng hồ đếm ngược dùng được trong Present và file export.
- [x] Mỗi slide có ô ghi chú cho giáo viên, không hiện khi trình chiếu.
- [x] 15 theme (gợi ý theo lứa tuổi; theo mùa và văn hoá Trung Hoa); âm thanh, hiệu ứng và pinyin tắt được.
- [x] Thêm một loại slide mới chỉ cần thêm một thư mục trong `templates/`.

**Contract và import**
- [x] Schema v1 có kiểm thử; round-trip `doc → html → doc` bằng nhau cho mọi loại slide. *(Test tự chạy cho mọi template đã đăng ký.)*
- [x] HTML không đúng contract bị từ chối với thông báo dễ hiểu.
- [x] JSON từ AI được validate, lỗi chỉ rõ vị trí; AI tạo được mọi loại slide.
- [x] File có `schemaVersion` cao hơn hoặc `type` lạ bị từ chối, không bị sửa.

**Autosave và recovery**
- [x] Draft ghi trong vòng ~1 giây sau thay đổi.
- [x] Backup hợp lệ tồn tại trước mỗi lần thay file chính.
- [ ] Kill tiến trình → mở lại → được đề nghị phục hồi, phục hồi đúng. *(Đã kiểm tra trên Windows; chưa thử macOS.)*
- [ ] File bị sửa từ bên ngoài (OneDrive/iCloud) trong lúc mở → không bị ghi đè âm thầm. *(Đã kiểm tra trên Windows với thư mục OneDrive; chưa thử iCloud.)*

**Present và Export**
- [x] Editor, Present và Export hiển thị giống nhau. *(Cùng hàm render, cùng runtime.)*
- [ ] Điều hướng bằng bàn phím và bút trình chiếu. *(Chạy đúng trong `lesson.html` trên Chrome và trong Present của app; chưa thử bút thật.)*
- [ ] File export mở offline trên máy không cài ứng dụng, chạy đúng trên Chrome,
      Edge và Safari; ảnh, audio, âm thanh phản hồi và tương tác hoạt động. *(Đã
      kiểm tra trên Chrome: ảnh, audio, các bước, vòng quay, hộp bí mật, đồng hồ;
      chưa thử Edge, Safari.)*

**Bảo mật và chất lượng**
- [x] Không có `<script>` nào từ file ngoài hoặc AI được thực thi. *(Chỉ đọc JSON; codec có test cho file bị chèn `<script>`.)*
- [x] Unit test cho schema, codec, migration, AI import, commands/undo và từng template. *(Thêm cả runtime trình chiếu chạy trong DOM giả lập.)*
- [ ] Test luồng tạo → sửa → lưu → mở lại → export (Vitest cho core; kiểm tra file
      export bằng Playwright trên Chromium và WebKit).
- [ ] Bộ cài Windows và macOS (đã ký, notarize) cùng hướng dẫn sử dụng ngắn. *(Bộ cài Windows chưa ký và hướng dẫn đã có; còn ký số và toàn bộ phần macOS.)*

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
slide kế tiếp, máy chiếu chỉ hiện slide), ghi âm giọng giáo viên trong ứng dụng.

**Pinyin tự sinh** (`core/pinyin.ts`, thư viện `pinyin-pro`, MIT, chạy offline,
chỉ dùng trong editor nên không vào file bài học): ô pinyin luôn đứng ngay sau
ô chữ Hán của nó trong `editor` của template (`pinyinPairs`), nên không phải
khai báo cặp. Pinyin theo chữ Hán khi còn trống hoặc vẫn là bản tự điền;
giáo viên đã sửa tay thì giữ, chỉ hiện nút "Tự điền" khi pinyin không thể đúng
(`pinyinFits`). Viết theo sách giáo khoa: chữ đa âm theo cả từ, biến điệu 一/不,
儿 nhập vào âm trước, 子 đuôi đọc nhẹ, thêm một từ điển nhỏ các từ thanh nhẹ hay
gặp. Đo trên 30 từ khó trước khi bổ sung: 25 đúng; các chỗ sai còn lại là thanh
nhẹ và chữ đa âm hiếm.

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

### Rev 20

| Thay đổi | Lý do |
| --- | --- |
| Bút viết lên slide khi trình chiếu (`P`, chọn màu, `E` xoá; nét theo slide) nằm trong runtime | Video bài dạy HSK1 cô tham khảo: thầy viết bút đỏ lên slide gần như liên tục (ghi pinyin, gạch chân, đánh dấu). |
| Slide `word-study` (chữ viết theo thứ tự nét), `table`, `speaking`, `picture-talk`, `word-family`, `culture`, `pronunciation`; Hội thoại kiểu "như sách"; Thẻ lật úp chỉ có số | Đủ các dạng trang trong giáo trình HSK 1–4 và trong bài dạy mẫu: 生词 kèm cách viết, 课文 như sách rồi dịch nghĩa, 对话练习, 运用, 描述图片, 旧字新词 / 扩展, 文化 / 俗语, 语音, ôn từ bằng thẻ úp. |
| Lệnh Rust `hanzi_strokes`: tải nét viết một chữ từ jsDelivr (hanzi-writer-data), chỉ nhận đúng một chữ Hán và chỉ nhận path gồm lệnh M/L/Q/C/Z và số | Nét viết cần dữ liệu ~9.000 chữ; tải theo chữ khi cần thay vì gói cả bộ vào ứng dụng. Dữ liệu Make Me a Hanzi theo giấy phép Arphic Public License / LGPL, được phép dùng lại. |

### Rev 19

| Thay đổi | Lý do |
| --- | --- |
| Dạng bài "Theo giáo trình" tách thành HSK 1, 2, 3, 4, mỗi cấp đúng thứ tự phần của quyển đó (đối chiếu sách HSK chuẩn 1–4) | Cấu trúc bài đổi theo cấp: HSK 2 có 4 cảnh hội thoại; HSK 3 thêm đoạn văn, 练一练, bỏ 语音; HSK 4 có 5 bài khoá dài, 比一比, 扩展. |
| Slide `passage`, `sentence-practice`, `compare`; Hội thoại đến 8 lượt × 60 chữ, Điền chỗ trống đến 6 câu | Bài khoá HSK 3–4 dài (6–8 lượt, đoạn văn ~200 chữ); bài tập chọn từ điền có 5 câu một ngân hàng từ. |

### Rev 18

| Thay đổi | Lý do |
| --- | --- |
| Khung bài của giáo viên (`core/lessonForm.ts`): lưu thứ tự, loại slide, tiêu đề và ghi chú của một bài làm khung; AI soạn bài mới đúng theo khung (dạng bài `form`, dàn ý vẫn chỉnh được). Lưu trên máy (localStorage) như các mẫu cách dạy | Giáo viên muốn mọi bài cùng một khung theo giáo trình, rồi tự chèn phần riêng; mỗi lớp một bản bằng Nhân bản bài. |
| Dạng bài `textbook` (Theo giáo trình) theo thứ tự phần của HSK chuẩn; người học "Người lớn / sinh viên" (không gợi ý trò chơi trẻ con, mặc định không có trò chơi); thời lượng 2 tiết (90 phút) | Lớp người lớn học theo giáo trình, chủ yếu lý thuyết và luyện tập, buổi 90 phút (~30 slide như bài PowerPoint của giáo viên). |
| Dạy online một màn hình: slide chuyển sang cửa sổ riêng (có viền, không toàn màn hình) để chia sẻ trong Zoom/Meet, màn hình chính thành chế độ người trình chiếu | Giáo viên dạy online qua chia sẻ màn hình, như PowerPoint. |

### Rev 17

| Thay đổi | Lý do |
| --- | --- |
| Chế độ người trình chiếu: màn chiếu riêng trên màn hình thứ hai; slide tiếp theo, ghi chú, đồng hồ, xem tất cả slide; thanh điều khiển khi chỉ có một màn hình | Giáo viên quen Presenter View của PowerPoint: xem ghi chú và slide sau mà lớp không thấy. |
| Màn đen/trắng (`B`/`W`) trong runtime | Cho cả lớp rời mắt khỏi màn chiếu để nghe cô; chạy cả trong file export. |
| Menu chuột phải trên danh sách slide (nhân bản, lên/xuống, xoá) và Ctrl+D; bỏ nút ✕ và nút Xoá | Giống Google Slides; bớt nút dễ bấm nhầm. |
| Có màn hình thứ hai thì cửa sổ người trình chiếu chỉ phóng to, không toàn màn hình | Như PowerPoint: vẫn thấy taskbar, thu nhỏ để mở ứng dụng khác mà máy chiếu vẫn giữ slide. |
| "Thêm slide bằng AI" chèn sau slide đang chọn, không có bìa/tổng kết; dạng bài mới "Dạy kỹ từ" (giải thích từng từ → ngữ pháp → luyện tập → chủ đề nói) | Giáo viên dựng sườn theo giáo trình rồi lồng phần dạy từ của mình vào giữa. |
| Slide `listening` (Nghe) và `book-page` (Trang sách); `dialogue` có nơi diễn ra và file nghe cả bài | Lồng file nghe của giáo trình và đưa nguyên trang sách lên slide. |

### Rev 16

| Thay đổi | Lý do |
| --- | --- |
| 8 theme mới: 4 theo mùa (xuân/Tết, hè, thu/Trung thu, đông) và 4 văn hoá Trung Hoa (Trường Thành, sứ Thanh Hoa, cắt giấy, trà) | Giáo viên đổi không khí bài theo dịp trong năm và theo chủ đề văn hoá. Hình trang trí tự vẽ bằng SVG, không dùng ảnh có bản quyền. |

### Rev 15

| Thay đổi | Lý do |
| --- | --- |
| `LessonRequest.source`: soạn theo giáo trình; giáo viên đính kèm PDF trong cuộc trò chuyện với AI | Các AI đã đọc được PDF (kể cả bản scan) tốt hơn mọi thứ app tự làm được; app chỉ cần dặn AI bám đúng bài. |
| "Lấy từ các bài đã dạy" (`lessonWords`): gom các ô chữ Hán ngắn (≤ 6 chữ, không dấu câu) của bài cũ vào "từ lớp đã học" | Bài sau nối tiếp bài trước mà không phải gõ lại từ. |
| "Kiểm tra bài" (`lessonIssues`): lỗi schema, chữ quá dài, pinyin, ảnh trống, ảnh chưa duyệt cho mọi bài | Các kiểm tra trước đây chỉ chạy lúc nhập bài AI; bài soạn tay hay đã sửa không được kiểm lại. |
| Tự tạo giọng đọc cho ô `autoAudio` (từ vựng, thẻ hình, thẻ lật, hội thoại, chọn thanh điệu), chung nút với tự tìm ảnh | Phát âm chuẩn là cốt lõi của bài tiếng Trung; bấm từng từ thì chậm. Trắc nghiệm không tự thêm vì âm thanh làm đổi dạng câu hỏi. |

### Rev 14

| Thay đổi | Lý do |
| --- | --- |
| Đóng cửa sổ do Rust điều phối, trang xác nhận rồi tự đóng, không xác nhận trong 3 giây thì Rust đóng | Đã tái hiện: mở bài rồi trang tải lại (Ctrl+R, hoặc dev server tắt) thì nút đóng bị kẹt vĩnh viễn. Draft ghi mỗi giây nên đóng không chờ lưu cũng không mất bài. |
| Bỏ quyền `core:window:allow-destroy` của trang | Trang không còn tự huỷ cửa sổ. |

### Rev 13

| Thay đổi | Lý do |
| --- | --- |
| Thêm `qa-list` (Hỏi đáp), có trong bước luyện tập của blueprint | Câu hỏi đọc hiểu sau bài khoá/hội thoại là dạng bài phổ biến mà chưa loại slide nào làm được. |
| Từ loại (tuỳ chọn) cho `vocabulary`, `flashcard`, `picture-card`; cách dùng và câu ví dụ cho `picture-card` | Bài theo giáo trình cho học sinh lớn trình bày từ mới kèm từ loại, cách kết hợp và ví dụ. Mở rộng `picture-card` thay vì thêm loại slide mới. Trường có mặc định nên `schemaVersion` giữ nguyên 1. |
| Không sinh pinyin cho chữ không có chữ Hán | Câu hỏi tiếng Việt trong `qa-list` không được chép sang ô pinyin. |

### Rev 12

| Thay đổi | Lý do |
| --- | --- |
| Danh sách trong bảng thuộc tính thu gọn mỗi mục còn một dòng tóm tắt (danh sách > 2 mục); mục có lỗi luôn mở | Slide 8 từ là 8 khung đầy đủ, phải cuộn rất nhiều; soạn tay là việc giáo viên làm nhiều nhất sau khi nhập AI. |
| Template có `description`; menu "Thêm slide" ba cột kèm mô tả | Tên như "Phân nhóm", "Hộp bí mật" không nói slide dùng để làm gì. |
| Thư viện: "Tạo bài bằng AI…" là nút chính; màn hình trống có hai lựa chọn; form "Bài mới" chọn được theme (nhớ lần trước) | Tạo bằng AI đã là luồng chính; theme lúc tạo đã có trong thiết kế (mục 5.A) nhưng chưa làm. |

### Rev 11

| Thay đổi | Lý do |
| --- | --- |
| Tự sinh pinyin khi soạn và khi nhập bài AI; kiểm tra pinyin AI sai âm | Gõ dấu thanh bằng tay chậm và dễ sai; bộ kiểm tra cũ chỉ bắt sai số âm tiết. |
| So pinyin với mọi cách đọc của từng chữ thay vì so nguyên văn với bản tự sinh | Bản tự sinh có thể khác sách (thanh nhẹ) mà vẫn đúng; so nguyên văn sẽ báo nhầm. |

### Rev 10

| Thay đổi | Lý do |
| --- | --- |
| Dàn ý chỉnh được (−/+ số slide mỗi bước, bỏ bước hoạt động/tuỳ chọn) thay cho dòng xem trước | Giáo viên quyết định nhịp bài mà không phải ráp từng slide; trình tự và loại slide vẫn do blueprint quyết định. |
| `LessonRequest` thêm "từ lớp đã học" và "không đưa vào"; gom các ô phụ vào "Tuỳ chỉnh nâng cao" | Bài hội thoại/mẫu câu cần dùng lại từ cũ mà không dạy lại; form chính chỉ còn những gì bài nào cũng cần. |
| Mẫu (preset) cách dạy, đặt tên được | Giáo viên dạy nhiều lớp cùng lứa tuổi lặp lại cùng một cấu hình. |
| Không làm "từ gợi ý" và "mức độ tiếng Việt" | Trùng với "từ bắt buộc + AI tự chọn thêm" và với hồ sơ lứa tuổi. |

### Rev 9

| Thay đổi | Lý do |
| --- | --- |
| Tự điền ảnh cho các ô `autoImage` sau khi nhập bài từ AI hoặc khi bấm "Tìm ảnh ô trống"; chọn kết quả đầu, đánh dấu chưa duyệt | Sau khi nhập bài từ AI, điền ảnh từng ô là việc tốn thời gian nhất. Đánh dấu để giáo viên không chiếu nhầm ảnh sai trước lớp. |
| Tìm nền chỉ lấy danh sách kết quả; ảnh xem trước chỉ tải khi bấm Đổi, ở cỡ 240 px | Cách cũ tải thêm 30 ảnh xem trước cho mỗi lần tìm; với 20 từ là hơn 600 request. |
| Giãn cách, chạy tuần tự và cache các lần tìm ở Rust; nhận biết khi bị Bing chặn | Tránh bị coi là spam; Đổi ảnh và dùng lại từ cũ không phải gọi lại Bing. |
| AI ghi từ khoá tiếng Anh cho ô ảnh; bật bộ lọc hình vẽ cho trẻ nhỏ | Từ khoá tiếng Việt cho ảnh sai hoặc không hợp trẻ em (xem 5.E). |
| `assets[].needsReview`, `assets[].query` | Lưu dấu chưa duyệt và từ khoá qua các lần mở bài. Trường tuỳ chọn nên `schemaVersion` giữ nguyên 1. |
| Ảnh tự điền không tạo bước undo (áp lên cả lịch sử) | 20 bước "thêm ảnh" xen giữa các thao tác của giáo viên sẽ làm Ctrl+Z khó dùng. |

### Rev 8

| Thay đổi | Lý do |
| --- | --- |
| Prompt AI sinh từ cấu hình giáo viên chọn (chủ đề, lứa tuổi, dạng bài, thời lượng, từ, mẫu câu, hoạt động) theo blueprint của ứng dụng | Một prompt chung chỉ thay chủ đề thì AI tự quyết cấu trúc bài và giáo viên không kiểm soát được phạm vi kiến thức. Blueprint để ứng dụng giữ trình tự sư phạm; prompt chỉ mô tả loại slide được dùng nên ngắn hơn, AI ít sai hơn. |
| Bốn mốc tuổi (3–5, 6–8, 9–11, 12+); không có "người lớn" | Ứng dụng dành cho lớp trẻ em. Lứa tuổi quyết định loại slide nên tránh (trẻ mầm non chưa biết đọc) và theme gợi ý. |
| Cảnh báo sau khi nhập (thiếu từ, quá sức, lệch độ dài, pinyin lệch số âm tiết) không chặn nhập | JSON hợp lệ chưa chắc nội dung đúng; phần kiểm được bằng code thì kiểm bằng code. Chỉ cảnh báo vì giáo viên có thể chủ ý chấp nhận. |
| `settings.pinyin`, mặc định bật | Lớp đã đọc được chữ Hán cần ẩn pinyin; để ở cài đặt trình chiếu thay vì trong prompt, nên cùng một bài dùng được cho nhiều lớp. Trường có mặc định nên `schemaVersion` giữ nguyên 1. |
| Theme khai báo `ages`; thêm `notebook` và `ink` cho học sinh từ 9 tuổi | 4/5 theme cũ hợp với trẻ nhỏ; học sinh lớn chỉ có `classic`. |
| Không thêm nghĩa tiếng Anh | Người dùng không cần; sẽ phải đổi schema. |

### Rev 7

| Thay đổi | Lý do |
| --- | --- |
| File export nhúng mỗi ảnh/âm thanh một lần trong JSON `#lesson-assets`; runtime thay vào khi mở | Nhúng thẳng vào `src` thì mở lại file export phải đọc DOM mới lấy được ảnh; nhúng cả hai nơi thì file nặng gấp đôi. |
| Prompt AI dùng `aiSchemaHint` + ví dụ thay vì JSON Schema đầy đủ | Ngắn và dễ hiểu với công cụ AI hơn; mọi kết quả vẫn qua đúng schema Zod, lỗi chỉ rõ vị trí. |
| Bài mở từ file ngoài luôn nhận ID mới | Hai bài cùng ID sẽ dùng chung draft, backup và lock. |
| Runtime có hook cho trò chơi (Tiếp/Lùi tự xử lý, chọn ô bằng số, vào/rời slide) và công cụ lớp học trong `runtime/tools.js` | Trò chơi không phải chuỗi bước tuyến tính; công cụ lớp học cần chạy cả trong file export. |
| Công cụ lớp học: thêm phím `N` gọi số ngẫu nhiên, `H` bảng phím tắt; trên slide chọn ô, phím số dùng để chọn ô | Phím `1`–`4` của bảng điểm trùng với gõ số ô. |

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
