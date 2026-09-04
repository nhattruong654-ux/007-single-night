// ====== CẤU HÌNH ======
// Đặt một chuỗi bí mật tuỳ ý, PHẢI khớp với SHEET_SHARED_SECRET trên Vercel.
// Mục đích: chặn người lạ gửi request thẳng vào Web App này để spam vào Sheet của bạn.
var SHARED_SECRET = 'tram1402';

// ID của Google Sheet (lấy từ URL, đoạn giữa /d/ và /edit).
// Dùng openById() thay vì SpreadsheetApp.getActiveSpreadsheet() vì Web App khi
// chạy độc lập (không mở trực tiếp trong giao diện Sheet) không có "spreadsheet
// đang active" — getActiveSpreadsheet() sẽ trả về null và gây lỗi.
var SPREADSHEET_ID = '1MF7ELWeZHrmad0jo3VqjsdScQEHyEorg8UqF7miDU9Y';

// Thư mục Google Drive để lưu ảnh khách tải lên (xem action "uploadPhoto").
var DRIVE_FOLDER_ID = '1NUZs4gGNgjyRsu83VtaQ617hgT0LHyXU';

// Tab duy nhất — chứa mọi lượt đăng ký (không còn phân biệt đã/chưa thanh toán).
var SHEET_NAME = 'Đăng ký';

// Mỗi người tham dự = 1 dòng. Vé đôi ghi 2 dòng liên tiếp nhau (cùng Mã đăng ký),
// vé cá nhân ghi 1 dòng. Cột "Vai trò" phân biệt "Người đăng ký" / "Người đi cùng".
var COLUMNS = [
  'STT', 'Thời gian đăng ký', 'Mã đăng ký', 'Vai trò',
  'Họ tên', 'SĐT', 'Email', 'Ngày sinh', 'Giới tính', 'Nơi ở hiện tại',
  'Chi trả cho một buổi date',
  'Gặp người lạ đúng gu', 'Khi tranh cãi', 'Thói quen rep tin nhắn',
  'Khi được yêu cầu share bill', 'Người mới quen rủ đi chơi tối',
  'Khi được rủ đi nhậu', 'Khi nhận tin nhắn Em ăn cơm chưa',
  'Khi biết có người để ý mình', 'Người dễ khiến rung động',
  'Đang date mà gặp người yêu cũ',
  'Kỳ vọng', 'MXH', 'Ảnh', 'Loại vé'
];

// Ánh xạ tên cột -> tên field gửi lên từ website (api/register.js),
// dùng cho từng phần tử trong payload.participants.
var FIELD_MAP = {
  'Họ tên': 'fullName', 'SĐT': 'phone', 'Email': 'email',
  'Ngày sinh': 'dob', 'Giới tính': 'gender', 'Nơi ở hiện tại': 'city',
  'Chi trả cho một buổi date': 'q0',
  'Gặp người lạ đúng gu': 'q1', 'Khi tranh cãi': 'q2',
  'Thói quen rep tin nhắn': 'q3', 'Khi được yêu cầu share bill': 'q4',
  'Người mới quen rủ đi chơi tối': 'q5', 'Khi được rủ đi nhậu': 'q6',
  'Khi nhận tin nhắn Em ăn cơm chưa': 'q7', 'Khi biết có người để ý mình': 'q8',
  'Người dễ khiến rung động': 'q9', 'Đang date mà gặp người yêu cũ': 'q10',
  'Kỳ vọng': 'expectation', 'MXH': 'social', 'Ảnh': 'photoUrl'
};

// ====== TIỆN ÍCH SHEET ======

function ensureSheet_(name, columns, sttColIndex) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(columns);
    sheet.getRange(1, 1, 1, columns.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    if (sttColIndex) sheet.setColumnWidth(sttColIndex, 50);
  } else {
    // Sheet đã tồn tại từ trước (vd. tạo bởi phiên bản code cũ) — luôn ghi đè
    // lại dòng tiêu đề theo đúng COLUMNS hiện tại của code đang chạy, để
    // header không bị "kẹt" ở tên cột cũ mỗi khi đổi câu hỏi/cột sau này.
    var existingHeaderRow = sheet.getRange(1, 1, 1, columns.length);
    existingHeaderRow.setValues([columns]).setFontWeight('bold');
  }
  return sheet;
}

function getSheet_() {
  return ensureSheet_(SHEET_NAME, COLUMNS, 1);
}

// ====== XỬ LÝ REQUEST ======

function doPost(e) {
  var result = { ok: false };
  try {
    var payload = JSON.parse(e.postData.contents);

    if (payload.secret !== SHARED_SECRET) {
      return jsonResponse_({ ok: false, error: 'Unauthorized' });
    }

    if (payload.action === 'append') {
      result = handleAppend_(payload);
    } else if (payload.action === 'uploadPhoto') {
      result = handleUploadPhoto_(payload);
    } else {
      result.error = 'Unknown action';
    }

  } catch (err) {
    result.error = err.toString();
  }

  return jsonResponse_(result);
}

// Các cột dạng số điện thoại — phải ép định dạng ô thành "Văn bản thuần" (@)
// trước khi ghi, nếu không Sheet sẽ tự nhận diện thành số rồi làm rụng mất số 0
// ở đầu (vd. 0912345678 -> 912345678).
var TEXT_FORCED_COLUMNS = ['SĐT'];

// Ghi 1 (vé cá nhân) hoặc 2 (vé đôi) dòng đăng ký vào Sheet.
// Ghi liên tiếp theo đúng thứ tự mảng participants để 2 dòng của vé đôi luôn nằm cạnh nhau.
function handleAppend_(payload) {
  var sheet = getSheet_();
  var participants = payload.participants || [];
  var createdAt = new Date();

  participants.forEach(function (participant) {
    var row = COLUMNS.map(function (colName) {
      if (colName === 'STT') return ''; // điền công thức tự động bên dưới
      if (colName === 'Thời gian đăng ký') return createdAt;
      if (colName === 'Mã đăng ký') return payload.regRef || '';
      if (colName === 'Vai trò') return participant.role || '';
      if (colName === 'Loại vé') return payload.ticketType || '';
      var field = FIELD_MAP[colName];
      return field ? (participant[field] || '') : '';
    });

    sheet.appendRow(row);
    var newRow = sheet.getLastRow();
    sheet.getRange(newRow, 1).setFormula('=ROW()-1'); // STT tự động

    // Ép lại định dạng + giá trị cho các cột số điện thoại — phải làm SAU khi
    // appendRow (setNumberFormat trên ô trống rồi mới set giá trị) để Sheet
    // không tự động suy luận lại thành số.
    TEXT_FORCED_COLUMNS.forEach(function (colName) {
      var colIndex = COLUMNS.indexOf(colName) + 1;
      if (colIndex < 1) return;
      var field = FIELD_MAP[colName];
      var value = field ? (participant[field] || '') : '';
      if (!value) return;
      sheet.getRange(newRow, colIndex).setNumberFormat('@').setValue(value);
    });
  });

  return { ok: true };
}

// Nhận ảnh (base64) từ trình duyệt khách, lưu vào Drive, trả về link xem
// công khai. Gọi TRỰC TIẾP từ script.js (không qua /api/register trên
// Vercel) vì Vercel giới hạn request body 4.5MB — Apps Script không bị
// giới hạn này nên cho phép đúng dung lượng ảnh khách được chọn (4.5MB).
function handleUploadPhoto_(payload) {
  try {
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    var bytes = Utilities.base64Decode(payload.data || '');
    var blob = Utilities.newBlob(bytes, payload.contentType || 'image/jpeg', payload.fileName || 'anh-khach.jpg');
    var file = folder.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      // Một số Drive dùng chính sách của tổ chức (Shared Drive) chặn chia sẻ
      // công khai "Anyone with link" — bỏ qua lỗi này, file vẫn tạo thành
      // công, chỉ là chỉ người trong tổ chức (đã có quyền vào Shared Drive)
      // mới xem được link, không phải bất kỳ ai.
    }
    return { ok: true, url: 'https://drive.google.com/uc?export=view&id=' + file.getId() };
  } catch (err) {
    return { ok: false, error: err.toString() };
  }
}

// Chạy thủ công hàm này 1 lần trong trình soạn thảo Apps Script (chọn hàm
// "authorizeDriveAccess_" ở dropdown trên cùng → bấm ▶️ Run) để Google hiện
// màn hình xin cấp quyền truy cập Drive — bấm "Advanced" → "Go to ... (unsafe)"
// → "Allow". Chỉ cần làm 1 lần, không có tác dụng phụ gì (chỉ đọc thư mục).
function authorizeDriveAccess_() {
  var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  Logger.log('OK, truy cập được thư mục: ' + folder.getName());
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
