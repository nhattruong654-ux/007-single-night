# Website đăng ký vé sự kiện + Ghi Google Sheet

## Kiến trúc

```
Người dùng điền form (index.html)
        │
        ▼
/api/register  →  ghi (các) dòng đăng ký vào Google Sheet (qua Apps Script)
        │
        ▼
Hiện thông báo "Đăng ký thành công" ngay trên trang
```

Google Sheet được dùng luôn làm "cơ sở dữ liệu" — không cần server DB riêng.
Không có bước thanh toán — form chỉ thu thập thông tin đăng ký.

---

## Bước 1: Tạo Google Sheet + Apps Script

1. Tạo một Google Sheet mới.
2. Vào **Extensions → Apps Script**.
3. Xoá code mặc định, dán toàn bộ nội dung file `google-apps-script/Code.gs` vào.
4. Đổi dòng `SHARED_SECRET = '...'` thành một chuỗi bí mật bạn tự nghĩ ra (nhớ chuỗi này, sẽ dùng lại ở Bước 3).
5. Bấm **Triển khai (Deploy) → New deployment**:
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copy URL Web App (dạng `https://script.google.com/macros/s/xxxx/exec`) — đây là `SHEET_WEBAPP_URL`.

---

## Bước 2: Deploy website lên Vercel (miễn phí, có backend serverless sẵn)

1. Tạo tài khoản tại https://vercel.com (đăng nhập bằng GitHub là dễ nhất).
2. Đưa toàn bộ code này lên một repo GitHub.
3. Trên Vercel: **Add New → Project** → chọn repo vừa tạo → Deploy.
4. Vào **Project → Settings → Environment Variables**, thêm các biến (xem file `.env.example`):
   - `SHEET_WEBAPP_URL` → URL lấy ở Bước 1
   - `SHEET_SHARED_SECRET` → phải khớp chính xác với `SHARED_SECRET` trong Code.gs
5. Redeploy lại (Vercel → Deployments → nút "Redeploy") để các biến môi trường có hiệu lực.
6. (Tuỳ chọn) Gắn domain riêng của bạn ở **Settings → Domains**.

---

## Bước 3: Test thử

1. Mở website, điền form, bấm "Hoàn tất đăng ký".
2. Kiểm tra Google Sheet: dòng đăng ký phải xuất hiện ngay trong tab "Đăng ký".

---

## Luồng các bước (form)

1. Trang mở đầu
2. Thông tin cơ bản (người đăng ký)
3. Thông tin cá nhân (người đăng ký)
4. Sở thích & kỳ vọng (người đăng ký)
5. Chọn loại vé
6. Thông tin người đi cùng — **chỉ hiện khi chọn Vé đôi**, và người đi cùng phải trả lời đầy đủ các câu hỏi giống người đăng ký (cơ bản, cá nhân, sở thích & kỳ vọng)
7. Xác nhận thông tin — hiện đầy đủ thông tin của người đăng ký (và người đi cùng nếu là vé đôi) trước khi bấm "Hoàn tất đăng ký"

## Cách ghi vé đôi vào Google Sheet

Với vé đôi, mỗi người tham dự là **một dòng riêng** trong Sheet, nhưng dùng chung một **Mã đăng ký** và có cột **Vai trò** ("Người đăng ký" / "Người đi cùng"). `api/register.js` gửi lên Apps Script một mảng `participants` (1 người với vé cá nhân, 2 người với vé đôi) theo đúng thứ tự; `Code.gs` ghi các dòng này liên tiếp nhau trong tab "Đăng ký", nên **STT của 2 người trong cùng một vé đôi luôn sát nhau**.

## Tuỳ chỉnh

- **Đổi câu hỏi trong form**: sửa trong `index.html` — với câu hỏi của người đăng ký, sửa trong `<section class="step" data-step="4">`; với câu hỏi tương ứng của người đi cùng, sửa song song trong `<section class="step" data-step="6">` (tên field có tiền tố `companion`, ví dụ `q1` ↔ `companionQ1`). Sau khi đổi, cập nhật tương ứng trong `script.js` (mảng field trong hàm `renderPersonBlock`) + `api/register.js` (mảng `PREFERENCE_FIELDS`/`BASIC_FIELDS`) + `Code.gs` (object `FIELD_MAP` và mảng `COLUMNS`).
- **Đáp án "Khác"**: một số câu hỏi có lựa chọn "Khác" đi kèm ô nhập tự do (input `name="qNOther"`, class `other-input`, ẩn theo mặc định). `script.js` tự hiện/ẩn + bắt buộc ô này khi khách chọn "Khác" (xem khối `.radio-question` forEach), và gộp lại thành một giá trị duy nhất dạng `"Khác: <nội dung>"` ngay trong `getFormData()` trước khi gửi đi — nên `api/register.js`/`Code.gs` không cần biết gì về field `*Other`, chỉ nhận đúng 1 giá trị cho mỗi câu hỏi.
- **Đổi loại vé**: sửa object `TICKET_TYPES` ở đầu file `script.js` **và** ở đầu file `api/register.js` (nhãn phải khớp `value` của radio `ticketType` trong `index.html`).
- **Cột Google Sheet**: cột "Loại vé" ghi nhãn loại vé đã chọn (vd. "Vé cá nhân"), cột "Vai trò" phân biệt người đăng ký / người đi cùng trong vé đôi. Nếu thêm/bớt cột, nhớ cập nhật lại `FIELD_MAP` và `COLUMNS` trong `Code.gs` cho khớp nhau.
- **Ảnh & giao diện trang mở đầu**: ảnh banner nằm ở `assets/single-night-banner.png`, style riêng cho bước 1 nằm trong khối `/* STEP 1: TRANG MỞ ĐẦU */` của `style.css`.
- **Giao diện chung**: sửa `style.css`, đổi màu chủ đạo ở biến `#c61e1e` (đỏ) và nền `body` (gradient đen-đỏ).

## Nếu sau này cần thêm lại thanh toán

Phần thanh toán VNPay đã được gỡ bỏ theo yêu cầu — form hiện chỉ thu thập đăng ký, không thu tiền. Khi cần thêm lại, cân nhắc tạo một API mới (`api/create-payment.js`) dựng trên cùng khung `api/register.js` hiện tại, cộng thêm bước gọi cổng thanh toán trước khi ghi Sheet, tương tự cách VNPay từng được tích hợp.
