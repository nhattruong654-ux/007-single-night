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
2. Thông tin cơ bản
3. Thông tin cá nhân
4. Sở thích & kỳ vọng
5. Xác nhận thông tin — hiện đầy đủ thông tin trước khi bấm "Hoàn tất đăng ký"

## Tuỳ chỉnh

- **Đổi câu hỏi trong form**: sửa trong `index.html`, khối `<section class="step" data-step="4">`. Sau khi đổi, cập nhật tương ứng trong `script.js` (hàm `renderReview`) + `api/register.js` (mảng `PREFERENCE_FIELDS`/`BASIC_FIELDS`) + `Code.gs` (object `FIELD_MAP` và mảng `COLUMNS`).
- **Đáp án "Khác"**: một số câu hỏi có lựa chọn "Khác" đi kèm ô nhập tự do (input `name="qNOther"`, class `other-input`, ẩn theo mặc định). `script.js` tự hiện/ẩn + bắt buộc ô này khi khách chọn "Khác" (xem khối `.radio-question` forEach), và gộp lại thành một giá trị duy nhất dạng `"Khác: <nội dung>"` ngay trong `getFormData()` trước khi gửi đi — nên `api/register.js`/`Code.gs` không cần biết gì về field `*Other`, chỉ nhận đúng 1 giá trị cho mỗi câu hỏi.
- **Cột Google Sheet**: nếu thêm/bớt cột, nhớ cập nhật lại `FIELD_MAP` và `COLUMNS` trong `Code.gs` cho khớp nhau.
- **Ảnh & giao diện trang mở đầu**: ảnh banner nằm ở `assets/single-night-banner.png`, style riêng cho bước 1 nằm trong khối `/* STEP 1: TRANG MỞ ĐẦU */` của `style.css`.
- **Giao diện chung**: sửa `style.css`, đổi màu chủ đạo ở biến `#c61e1e` (đỏ) và nền `body` (gradient đen-đỏ).

## Ảnh khách tải lên (profile photo)

Khác với các field còn lại, ảnh khách chọn (input `name="photo"`) **không** đi qua `/api/register` trên Vercel — vì Vercel giới hạn cứng request body 4.5MB, mà base64 hoá ảnh làm dung lượng phình thêm ~33%, nên nếu đi qua Vercel thì ảnh gốc chỉ an toàn tới khoảng 3MB.

Thay vào đó, ngay khi khách chọn ảnh, `script.js` (hàm `setupPhotoUpload`) gửi ảnh (base64) **thẳng tới Apps Script** (action `uploadPhoto`, dùng cùng `SHEET_WEBAPP_URL`/`SHARED_SECRET` — 2 giá trị này vì vậy nằm ngay trong `script.js`, khách xem được qua "View source", không phải bí mật tuyệt đối, chỉ nhằm chặn spam). `Code.gs` (`handleUploadPhoto_`) lưu ảnh vào thư mục Google Drive (`DRIVE_FOLDER_ID`), đặt quyền xem "Anyone with the link", rồi trả về link ảnh. Link đó (chỉ là 1 dòng text ngắn) được lưu vào ô ẩn `photoUrl`, và mới thật sự được gửi lên `/api/register` cùng các field khác khi khách bấm "Hoàn tất đăng ký".

Giới hạn kích thước ảnh phía trình duyệt: `PHOTO_MAX_BYTES` trong `script.js` (đang để 4.5MB). Đổi `DRIVE_FOLDER_ID` trong `Code.gs` nếu muốn lưu ảnh vào thư mục Drive khác.

## Nếu sau này cần thêm lại thanh toán

Phần thanh toán VNPay đã được gỡ bỏ theo yêu cầu — form hiện chỉ thu thập đăng ký, không thu tiền. Khi cần thêm lại, cân nhắc tạo một API mới (`api/create-payment.js`) dựng trên cùng khung `api/register.js` hiện tại, cộng thêm bước gọi cổng thanh toán trước khi ghi Sheet, tương tự cách VNPay từng được tích hợp.
