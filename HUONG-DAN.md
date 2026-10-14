# Hướng dẫn sử dụng Chinese Lesson Studio

Ứng dụng giúp thầy cô soạn và trình chiếu bài giảng tiếng Trung cho trẻ em. Bài học
lưu trên máy, không cần mạng (trừ khi tìm ảnh và tạo giọng đọc).

## 1. Cài đặt (Windows)

1. Chạy file `Chinese Lesson Studio_x.y.z_x64-setup.exe`.
2. Nếu Windows hiện "Windows đã bảo vệ PC của bạn": bấm **Thông tin thêm** →
   **Vẫn chạy**. Cảnh báo này xuất hiện vì bộ cài chưa được ký số, không phải do
   phần mềm có hại.
3. Mở ứng dụng từ menu Start.

Bài học nằm trong thư mục **Tài liệu → Chinese Lesson Studio**, mỗi bài một thư mục.

## 2. Tạo và soạn bài

- **Tạo bài bằng AI…**: cách nhanh nhất, xem mục 6.
- **+ Bài mới**: đặt tên, chọn "Bài mẫu: Hoa quả" để xem ví dụ hoặc "Bài trống",
  và chọn theme (lần sau ứng dụng nhớ theme đã chọn).
- Cột trái là danh sách slide: **+ Thêm slide** mở bảng các loại slide, mỗi loại
  có một dòng mô tả; kéo thả để đổi thứ tự, các nút bên dưới để lên/xuống, nhân
  bản, xoá.
- Cột phải là nội dung slide đang chọn. Gõ đến đâu, slide ở giữa đổi đến đó.
  Danh sách dài (các từ, các thẻ…) thu gọn mỗi mục còn một dòng; bấm vào để sửa,
  hoặc **Mở tất cả**. Mục có lỗi luôn tự mở.
- **Ctrl+Z / Ctrl+Y**: hoàn tác / làm lại. **Ctrl+S** hoặc nút **Lưu** để lưu.
  Ứng dụng cũng tự lưu sau 30 giây không sửa và khi đóng. Nếu máy tắt đột ngột,
  lần sau mở bài ứng dụng sẽ hỏi có khôi phục phần chưa lưu không.
- Tab **Bài học** ở cột phải: đổi theme (bên cạnh tên có ghi lứa tuổi phù hợp),
  kiểu chữ Hán (thường hoặc chữ Khải), bật/tắt âm thanh và hiệu ứng, và bật/tắt
  **Hiện pinyin** cho lớp đã đọc được chữ Hán (slide luyện thanh điệu vẫn giữ
  pinyin vì đó là đáp án).
- Ô **Ghi chú cho giáo viên** dưới slide: chỉ thầy cô thấy, không hiện khi chiếu.

### Pinyin

Gõ chữ Hán là ô pinyin tự điền, có dấu thanh. Đã sửa tay pinyin thì ứng dụng giữ
nguyên; nút **Tự điền** cạnh ô Pinyin chỉ hiện khi pinyin đang ghi không khớp chữ
Hán. Pinyin tự điền nên được xem lại với từ đọc nhẹ hoặc chữ nhiều cách đọc.

### Ảnh và âm thanh

- **Tìm ảnh…**: tìm trên mạng (từ khoá điền sẵn theo nghĩa của từ), bấm vào ảnh
  để chèn. Đánh dấu **Chỉ hình vẽ** để có hình đơn giản cho trẻ nhỏ. Tìm bằng
  tiếng Anh thường ra ảnh đúng hơn (ví dụ "orange fruit" thay vì "quả cam").
- **Tìm ảnh ô trống** (thanh trên cùng): ứng dụng tự tìm ảnh cho mọi ô ảnh còn
  trống ở các slide từ vựng, thẻ hình, thẻ lật, đoán hình, "Cái gì biến mất?",
  và ở Ghép cặp / Lật cặp khi chọn **Cột phải: Hình** / **Thẻ thứ hai: Hình**.
  Bài vừa tạo bằng AI được tự tìm ảnh ngay. Ảnh tự chọn có **chấm cam** ở danh
  sách slide; bấm **Duyệt ảnh** để xem tất cả, **Đổi** ảnh chưa đúng hoặc **Giữ**.
  Nếu Bing tạm chặn vì tìm nhiều, chờ vài phút rồi bấm **Thử lại**.
- Hoặc copy ảnh trên trình duyệt rồi bấm vào ô Ảnh và **Ctrl+V**, hoặc kéo ảnh thả
  vào ô Ảnh, hoặc **Chọn file…** từ máy.
- **🔊 Tạo giọng đọc**: tạo file đọc chữ Hán bằng giọng Google Dịch.
- Ảnh lớn được tự thu nhỏ; ảnh và âm thanh lưu trong thư mục của bài, nên khi
  trình chiếu không cần mạng.

## 3. Các loại slide

| Nhóm | Loại |
| --- | --- |
| Dạy | Trang bìa, Từ vựng, Thẻ hình, Thẻ lật, Hội thoại, Ngữ pháp, Tổng kết |
| Hỏi đáp | Trắc nghiệm (cả Đúng/Sai), Ghép cặp, Điền chỗ trống, Sắp xếp câu, Chọn thanh điệu, Phân nhóm |
| Trò chơi | Cái gì biến mất?, Đoán hình, Hộp bí mật, Vòng quay may mắn, Lật cặp |

Một vài cách nhập đặc biệt:
- **Điền chỗ trống**: đặt từ cần điền trong ngoặc vuông: `我[是]学生。`
- **Ngữ pháp**, **Sắp xếp câu**: ngăn các thành phần bằng dấu `/`: `我 / 是 / 学生`
- **Chọn thanh điệu**: gõ pinyin có dấu (`mǎ`), thanh điệu được lấy tự động.

## 4. Trình chiếu

**▶ Trình chiếu** (hoặc **Shift+F5**) chiếu từ slide đang chọn; **F5** chiếu từ đầu.
Mọi slide đều chạy được chỉ bằng nút Tiếp/Lùi của bút trình chiếu.

| Phím | Tác dụng |
| --- | --- |
| → , Space, Enter, PageDown | Tiếp (hiện bước tiếp theo, hết bước thì sang slide sau) |
| ← , Backspace, PageUp | Lùi |
| A | Hiện hết đáp án của slide |
| R | Làm lại slide từ đầu |
| 1 – 4 | Cộng điểm cho đội 1–4 (Shift + số: trừ điểm) |
| S | Hiện / ẩn bảng điểm |
| T | Đồng hồ đếm ngược: chạy / dừng (Shift+T: tắt). Bấm vào đồng hồ để đổi thời gian |
| N | Gọi một số thứ tự học sinh ngẫu nhiên (Shift+N: tắt) |
| H | Bảng phím tắt |
| Esc | Thoát trình chiếu |

**Trò chơi chọn ô** (Hộp bí mật, Lật cặp, Đoán hình kiểu mở ô): gõ số ô (hoặc bấm
chuột vào ô). Trên các slide này phím số dùng để chọn ô, nên cộng điểm bằng cách
bấm vào bảng điểm. Hộp bí mật và Lật cặp tự cộng điểm cho đội đang có lượt.

**Thẻ lật**: Tiếp lật lần lượt; muốn lật thẻ nào trước thì bấm vào thẻ đó hoặc gõ
số của thẻ (bấm lại để úp xuống). Chọn **Mặt trước: Chữ Hán** để trẻ đọc chữ rồi
lật ra hình.

## 5. Chiếu trên máy khác (máy lớp học)

1. Trong bài, bấm **Xuất file** và chọn nơi lưu (ví dụ USB).
2. Mở file `.html` đó trên máy lớp học bằng Chrome, Edge hoặc Safari: bài tự vào
   chế độ trình chiếu, có đủ ảnh, âm thanh, trò chơi và công cụ lớp học. Máy lớp
   học không cần cài ứng dụng, không cần mạng. Bấm **F** để toàn màn hình.

## 6. Tạo bài bằng AI

1. **Tạo bài bằng AI…** ở thư viện, hoặc **Thêm slide bằng AI…** trong một bài.
2. Chọn nội dung bài: chủ đề, lứa tuổi học sinh, thời lượng, dạng bài (Từ vựng,
   Hội thoại, Mẫu câu, Ôn tập, Tổng hợp), và nếu muốn thì ghi các từ cần dạy.
   - **Dàn ý**: bấm − / + để đổi số slide của từng phần; về 0 là bỏ phần đó (ví
     dụ bỏ trò chơi khi tiết học ngắn). **Về dàn ý gợi ý** để làm lại.
   - **Tuỳ chỉnh nâng cao**: mẫu câu, từ lớp đã học (AI dùng lại mà không dạy
     lại), nội dung không đưa vào bài, hoạt động muốn có, yêu cầu thêm.
   - **Lưu thành mẫu**: lưu cách dạy (lứa tuổi, dạng bài, thời lượng, dàn ý…) để
     lần sau chọn lại một lần là xong; chủ đề và từ vựng không lưu vào mẫu.
   Lần sau ứng dụng nhớ lựa chọn gần nhất.
3. Bấm **Sao chép lời nhắn cho AI**, dán vào ChatGPT, Gemini, Claude… Không cần
   sửa gì trong lời nhắn.
4. Copy toàn bộ câu trả lời của AI, dán vào ô bên dưới.
   - Ô đỏ là **lỗi**: chưa nhập được, ứng dụng chỉ rõ slide nào, ô nào.
   - Ô vàng là **nên xem lại**: thiếu từ đã yêu cầu, pinyin không khớp số chữ,
     dạng bài khó với lứa tuổi… Vẫn nhập được.
   - Bấm nút sao chép trong ô đó rồi dán vào cùng cuộc trò chuyện để AI sửa.
5. Bấm **Tạo bài mới** / **Thêm vào cuối bài**, rồi xem lại và thêm ảnh. Bài mới
   tự chọn theme hợp lứa tuổi; đổi lại được ở tab **Bài học**.

## 7. Mở bài từ nơi khác

**Mở file…** ở thư viện: chọn file `lesson.html` (kèm thư mục `assets` bên cạnh)
hoặc file đã xuất. Bài được chép vào thư viện thành một bài mới.

## 8. Thư viện

Mỗi bài có **Đổi tên**, **Nhân bản**, **Xoá**. Bài bị xoá nằm trong Thùng rác của
Windows, khôi phục được từ đó. Mỗi lần lưu, bản cũ được sao lưu tự động (10 bản
gần nhất và một bản mỗi ngày trong 7 ngày) trong
`%APPDATA%\ChineseLessonStudio\backups`.
