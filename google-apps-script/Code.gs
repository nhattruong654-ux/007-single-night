// ====== CẤU HÌNH ======
// Đặt một chuỗi bí mật tuỳ ý, PHẢI khớp với SHEET_SHARED_SECRET trên Vercel.
// Mục đích: chặn người lạ gửi request thẳng vào Web App này để spam vào Sheet của bạn.
var SHARED_SECRET = 'tram1402';

// ID của Google Sheet (lấy từ URL, đoạn giữa /d/ và /edit).
// Dùng openById() thay vì SpreadsheetApp.getActiveSpreadsheet() vì Web App khi
// chạy độc lập (không mở trực tiếp trong giao diện Sheet) không có "spreadsheet
// đang active" — getActiveSpreadsheet() sẽ trả về null và gây lỗi.
var SPREADSHEET_ID = '1MF7ELWeZHrmad0jo3VqjsdScQEHyEorg8UqF7miDU9Y';

// Tab duy nhất — chứa mọi lượt đăng ký (không còn phân biệt đã/chưa thanh toán).
var SHEET_NAME = 'Đăng ký';

// Mỗi người tham dự = 1 dòng. Vé đôi ghi 2 dòng liên tiếp nhau (cùng Mã đăng ký),
// vé cá nhân ghi 1 dòng. Cột "Vai trò" phân biệt "Người đăng ký" / "Người đi cùng".
var COLUMNS = [
  'STT', 'Thời gian đăng ký', 'Mã đăng ký', 'Vai trò',
  'Họ tên', 'SĐT', 'Email', 'Zalo', 'Ngày sinh', 'Giới tính', 'Nơi ở hiện tại',
  'Hướng nội/ngoại', 'Sở thích du lịch', 'Ngày nghỉ thường làm gì',
  'Thời gian hẹn hò lý tưởng', 'Ấn tượng đầu tiên',
  'Coi trọng hơn trong tình yêu', 'Khi có mâu thuẫn', 'Thích người yêu',
  'Khi cả hai bận', 'Cần nhất trong tình yêu', 'Khi bắt đầu mối quan hệ',
  'Kỳ vọng', 'MXH', 'Loại vé'
];

// Ánh xạ tên cột -> tên field gửi lên từ website (api/register.js),
// dùng cho từng phần tử trong payload.participants.
var FIELD_MAP = {
  'Họ tên': 'fullName', 'SĐT': 'phone', 'Email': 'email', 'Zalo': 'zalo',
  'Ngày sinh': 'dob', 'Giới tính': 'gender', 'Nơi ở hiện tại': 'city',
  'Hướng nội/ngoại': 'personality', 'Sở thích du lịch': 'travelPreference',
  'Ngày nghỉ thường làm gì': 'dayOffActivity',
  'Thời gian hẹn hò lý tưởng': 'idealDatingTime', 'Ấn tượng đầu tiên': 'firstImpression',
  'Coi trọng hơn trong tình yêu': 'loveValue', 'Khi có mâu thuẫn': 'conflictStyle',
  'Thích người yêu': 'partnerPreference', 'Khi cả hai bận': 'busyPriority',
  'Cần nhất trong tình yêu': 'loveNeed', 'Khi bắt đầu mối quan hệ': 'relationshipStart',
  'Kỳ vọng': 'expectation', 'MXH': 'social'
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
var TEXT_FORCED_COLUMNS = ['SĐT', 'Zalo'];

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

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
