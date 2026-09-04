// Ghi thẳng đăng ký vào Google Sheet — không có bước thanh toán.
const SHEET_WEBAPP_URL = (process.env.SHEET_WEBAPP_URL || '').trim();
const SHEET_SHARED_SECRET = (process.env.SHEET_SHARED_SECRET || '').trim();

const TICKET_TYPES = {
  single: { label: 'Vé cá nhân' },
  couple: { label: 'Vé đôi (2 nam hoặc 2 nữ)' },
};

// Các câu hỏi (Phụ lục 1 — câu hỏi chia nhóm riêng) dùng chung cho người đăng
// ký và người đi cùng. q2, q5, q10 không có lựa chọn "Khác" trong form; các
// câu còn lại nếu khách chọn "Khác" thì giá trị đã được gộp thành
// "Khác: <nội dung>" ngay từ script.js (client) trước khi gửi lên đây.
const PREFERENCE_FIELDS = [
  'q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10',
  'expectation', 'social',
];
const BASIC_FIELDS = ['fullName', 'phone', 'email', 'dob', 'gender', 'city', 'photoUrl'];
const PARTICIPANT_FIELDS = [...BASIC_FIELDS, ...PREFERENCE_FIELDS];

// ====== QUY ĐỊNH ĐỘ TUỔI (tính đến ngày diễn ra sự kiện) — kiểm tra lại ở server
// để tránh trường hợp khách sửa/qua mặt validate ở trình duyệt.
const EVENT_DATE = new Date('2026-09-19T00:00:00');
const AGE_RULES = {
  'Nam': { min: 18, max: 30 },
  'Nữ': { min: 18, max: 28 },
  'Khác': { min: 18, max: 30 },
};

function calcAgeAtEvent(dobStr) {
  if (!dobStr) return null;
  const dob = new Date(dobStr + 'T00:00:00');
  if (isNaN(dob.getTime())) return null;
  // Tính tuổi theo năm sinh (lấy năm diễn ra sự kiện trừ năm sinh),
  // không trừ thêm theo ngày/tháng sinh cụ thể — vd. sinh 29/09/1998, sự kiện năm 2026 -> 28 tuổi.
  return EVENT_DATE.getFullYear() - dob.getFullYear();
}

// Chỉ áp dụng quy định cho Nam/Nữ theo thông báo đầu trang; "Khác" không có quy định riêng nên bỏ qua.
function isAgeAllowed(gender, dobStr) {
  const rule = AGE_RULES[gender];
  if (!rule) return true;
  const age = calcAgeAtEvent(dobStr);
  if (age === null) return false;
  return age >= rule.min && age <= rule.max;
}

// Lấy thông tin 1 người từ payload theo prefix ('' cho người đăng ký, 'companion' cho người đi cùng).
function extractParticipant(data, prefix, role) {
  const p = {};
  PARTICIPANT_FIELDS.forEach((field) => {
    const key = prefix ? prefix + field.charAt(0).toUpperCase() + field.slice(1) : field;
    p[field] = data[key] || '';
  });
  p.role = role;
  return p;
}

function isParticipantComplete(p) {
  return p.fullName && p.phone && p.email && p.dob && p.gender && p.city && p.expectation && p.social && p.photoUrl
    && p.q0 && p.q1 && p.q2 && p.q3 && p.q4 && p.q5 && p.q6 && p.q7 && p.q8 && p.q9 && p.q10;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const data = req.body || {};
    const { ticketType } = data;

    const ticket = TICKET_TYPES[ticketType];
    if (!ticket) {
      res.status(400).json({ error: 'Vui lòng chọn loại vé hợp lệ.' });
      return;
    }

    const registrant = extractParticipant(data, '', 'Người đăng ký');
    if (!isParticipantComplete(registrant)) {
      res.status(400).json({ error: 'Thiếu thông tin bắt buộc.' });
      return;
    }
    if (!isAgeAllowed(registrant.gender, registrant.dob)) {
      res.status(400).json({ error: 'Bạn chưa đủ điều kiện độ tuổi tham dự theo quy định của BTC.' });
      return;
    }

    const participants = [registrant];

    // Vé đôi: bắt buộc phải có đủ thông tin (kể cả sở thích & kỳ vọng) của người đi cùng.
    if (ticketType === 'couple') {
      const companion = extractParticipant(data, 'companion', 'Người đi cùng');
      if (!isParticipantComplete(companion)) {
        res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin người đi cùng.' });
        return;
      }
      if (!isAgeAllowed(companion.gender, companion.dob)) {
        res.status(400).json({ error: 'Người đi cùng chưa đủ điều kiện độ tuổi tham dự theo quy định của BTC.' });
        return;
      }
      participants.push(companion);
    }

    if (!SHEET_WEBAPP_URL) {
      res.status(500).json({ error: 'Chưa cấu hình Google Sheet (SHEET_WEBAPP_URL).' });
      return;
    }

    // Mã đăng ký duy nhất — dùng chung cho cả 2 người trong vé đôi để ghi 2 dòng
    // liên tiếp nhau trong Google Sheet.
    const regRef = Date.now().toString() + Math.floor(Math.random() * 1000);

    const sheetRes = await fetch(SHEET_WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: SHEET_SHARED_SECRET,
        action: 'append',
        regRef,
        ticketType: ticket.label,
        participants,
      }),
    });
    const sheetJson = await sheetRes.json().catch(() => ({}));
    if (!sheetRes.ok || sheetJson.ok === false) {
      throw new Error(sheetJson.error || 'Không ghi được vào Google Sheet.');
    }

    res.status(200).json({ ok: true, regRef });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi máy chủ, vui lòng thử lại sau: ' + err.message });
  }
};
