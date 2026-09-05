// ====== UPLOAD ẢNH ======
// Gửi ảnh THẲNG tới Google Apps Script (không qua /api/register trên Vercel)
// để tránh giới hạn 4.5MB cho request body của Vercel — base64 hoá ảnh làm
// dung lượng phình thêm ~33%, nên nếu đi qua Vercel thì ảnh gốc chỉ an toàn
// tới khoảng 3MB. Apps Script không bị giới hạn này, nên cho phép đúng 4.5MB
// khách chọn. Link ảnh trả về (rất ngắn) mới là thứ được gửi kèm trong phần
// đăng ký chính qua /api/register như các field text khác.
const PHOTO_UPLOAD_URL = 'https://script.google.com/macros/s/AKfycbzIgE0xAs4FTr00FJqb8FIqBJTi0Kw41isTdjnvK9Pslps2hJ69gBNN36CyKcWSCodA/exec';
const PHOTO_UPLOAD_SECRET = 'tram1402';
const PHOTO_MAX_BYTES = 4.5 * 1024 * 1024;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('Không đọc được file ảnh.'));
    reader.readAsDataURL(file);
  });
}

function setupPhotoUpload(fileInput) {
  const hiddenInput = form.querySelector('input[type="hidden"][name="' + fileInput.dataset.target + '"]');
  const statusEl = form.querySelector('.photo-status[data-for="' + fileInput.dataset.target + '"]');

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    hiddenInput.value = '';
    if (!file) { statusEl.textContent = ''; return; }

    if (file.size > PHOTO_MAX_BYTES) {
      statusEl.textContent = 'Ảnh quá lớn (tối đa 4.5MB) — vui lòng chọn ảnh khác.';
      fileInput.value = '';
      return;
    }

    statusEl.textContent = 'Đang tải ảnh lên...';
    fileInput.disabled = true;
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch(PHOTO_UPLOAD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          secret: PHOTO_UPLOAD_SECRET,
          action: 'uploadPhoto',
          fileName: file.name,
          contentType: file.type || 'image/jpeg',
          data: base64,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok || !json.url) {
        throw new Error(json.error || 'Không tải được ảnh lên, vui lòng thử lại.');
      }
      hiddenInput.value = json.url;
      statusEl.textContent = 'Đã tải ảnh lên thành công ✓';
    } catch (err) {
      statusEl.textContent = 'Lỗi: ' + (err.message || 'Không tải được ảnh lên.') + ' Vui lòng thử lại.';
      fileInput.value = '';
    } finally {
      fileInput.disabled = false;
    }
  });
}

// ====== QUY ĐỊNH ĐỘ TUỔI (tính đến ngày diễn ra sự kiện) ======
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

function ageErrorMessage(gender, dobStr) {
  const rule = AGE_RULES[gender];
  if (!rule) return ''; // Không có quy định riêng -> không chặn
  const age = calcAgeAtEvent(dobStr);
  if (age === null) return '';
  if (age < rule.min || age > rule.max) {
    return 'Không đúng độ tuổi quy định của BTC.';
  }
  return '';
}

function bindAgeValidation(dobInput, getGenderValue) {
  if (!dobInput) return;
  const revalidate = () => {
    dobInput.setCustomValidity(ageErrorMessage(getGenderValue(), dobInput.value));
  };
  dobInput.addEventListener('input', revalidate);
  dobInput.addEventListener('change', revalidate);
  return revalidate;
}

// ====== STATE ======
const form = document.getElementById('regForm');
form.querySelectorAll('.photo-input').forEach(setupPhotoUpload);
const steps = Array.from(document.querySelectorAll('.step'));
const totalSteps = steps.length;
let currentStep = 1;

const card = document.getElementById('card');
const progressBar = document.getElementById('progressBar');
const stepLabel = document.getElementById('stepLabel');
const btnBack = document.getElementById('btnBack');
const btnNext = document.getElementById('btnNext');
const btnPay = document.getElementById('btnPay');
const errorMsg = document.getElementById('errorMsg');
const successBox = document.getElementById('successBox');

const dobInput = form.querySelector('input[name="dob"]');
const genderSelect = form.querySelector('select[name="gender"]');
const revalidateRegistrantAge = bindAgeValidation(dobInput, () => genderSelect ? genderSelect.value : '');
if (genderSelect) genderSelect.addEventListener('change', () => revalidateRegistrantAge && revalidateRegistrantAge());

// "Khác" ở các câu hỏi trắc nghiệm (q1..q10): hiện ô nhập tự do ngay khi
// khách chọn "Khác", bắt buộc điền, và ẩn + xoá nội dung nếu khách đổi sang
// chọn đáp án khác.
document.querySelectorAll('.radio-question').forEach(q => {
  const otherInput = q.querySelector('.other-input');
  if (!otherInput) return;
  const radios = q.querySelectorAll('input[type="radio"]');
  const syncOther = () => {
    const checked = q.querySelector('input[type="radio"]:checked');
    const isOther = !!checked && checked.value === 'Khác';
    otherInput.classList.toggle('hidden', !isOther);
    otherInput.required = isOther;
    if (!isOther) otherInput.value = '';
  };
  radios.forEach(r => r.addEventListener('change', syncOther));
});

function showStep(n) {
  currentStep = n;
  steps.forEach(s => s.classList.toggle('active', Number(s.dataset.step) === n));

  progressBar.style.width = (n / totalSteps * 100) + '%';
  stepLabel.textContent = `Bước ${n} / ${totalSteps}`;
  btnBack.classList.toggle('hidden', n === 1);
  btnNext.classList.toggle('hidden', n === totalSteps);
  btnPay.classList.toggle('hidden', n !== totalSteps);
  btnNext.textContent = n === 1 ? 'Bắt đầu đăng ký' : 'Tiếp tục';
  errorMsg.classList.add('hidden');
  if (n === totalSteps) renderReview();
}

function currentStepEl() {
  return steps.find(s => Number(s.dataset.step) === currentStep);
}

function validateCurrentStep() {
  const el = currentStepEl();
  // Ảnh: input file dùng "required" tự lo trường hợp chưa chọn ảnh nào; ở
  // đây chỉ cần chặn thêm trường hợp ĐÃ chọn ảnh nhưng chưa tải lên xong
  // (đang tải hoặc tải lỗi) — nếu không khách có thể bấm Tiếp tục ngay khi
  // vừa chọn ảnh, trước khi có link trả về, làm mất dữ liệu ảnh.
  el.querySelectorAll('.photo-input').forEach(input => {
    const hidden = form.querySelector('input[type="hidden"][name="' + input.dataset.target + '"]');
    const hasFile = input.files && input.files.length > 0;
    const uploaded = hidden && hidden.value;
    input.setCustomValidity(input.required && hasFile && !uploaded
      ? 'Ảnh đang tải lên hoặc chưa tải lên thành công — vui lòng đợi hoặc chọn lại ảnh.'
      : '');
  });
  const inputs = el.querySelectorAll('input, select, textarea');
  for (const input of inputs) {
    if (!input.checkValidity()) {
      input.reportValidity();
      return false;
    }
  }
  return true;
}

btnNext.addEventListener('click', () => {
  if (!validateCurrentStep()) return;
  if (currentStep < totalSteps) {
    showStep(currentStep + 1);
  }
});

btnBack.addEventListener('click', () => {
  if (currentStep > 1) {
    showStep(currentStep - 1);
  }
});

// Gộp đáp án "Khác" của các câu trắc nghiệm với nội dung khách tự nhập
// (vd. q1 = "Khác" + q1Other = "Đi vòng vòng cho nó tình cờ" -> q1 = "Khác: Đi
// vòng vòng cho nó tình cờ"), rồi bỏ các field "*Other" đi vì đã gộp xong —
// nhờ vậy Sheet chỉ cần đúng 1 cột cho mỗi câu hỏi, không cần thêm cột riêng.
function getFormData() {
  const data = {};
  new FormData(form).forEach((v, k) => {
    if (v instanceof File) return; // input file (photo) — chỉ cần link ở field photoUrl, không gửi kèm chính file
    data[k] = v;
  });
  Object.keys(data).forEach(key => {
    if (!key.endsWith('Other') && data[key] === 'Khác') {
      const otherVal = (data[key + 'Other'] || '').trim();
      if (otherVal) data[key] = 'Khác: ' + otherVal;
    }
  });
  Object.keys(data).forEach(key => {
    if (key.endsWith('Other')) delete data[key];
  });
  return data;
}

function renderReview() {
  const d = getFormData();
  const box = document.getElementById('reviewBox');
  const get = (field) => escapeHtml(d[field] ?? '');

  box.innerHTML = `
    <div class="review-person">
      <div><b>Họ tên:</b> ${get('fullName')}</div>
      <div><b>SĐT:</b> ${get('phone')}</div>
      <div><b>Email:</b> ${get('email')}</div>
      <div><b>Ngày sinh:</b> ${get('dob')}</div>
      <div><b>Giới tính:</b> ${get('gender')}</div>
      <div><b>Nơi ở hiện tại:</b> ${get('city')}</div>
      <div><b>MXH:</b> ${get('social') || '—'}</div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[s]));
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateCurrentStep()) return;

  btnPay.disabled = true;
  btnPay.textContent = 'Đang gửi...';
  errorMsg.classList.add('hidden');

  const data = getFormData();

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error || 'Không gửi được đăng ký.');
    }

    // Đăng ký thành công — ẩn form + thanh tiến trình, hiện thông báo cảm ơn.
    form.classList.add('hidden');
    document.querySelector('.progress').classList.add('hidden');
    stepLabel.classList.add('hidden');
    successBox.classList.remove('hidden');

  } catch (err) {
    errorMsg.textContent = err.message || 'Có lỗi xảy ra, vui lòng thử lại.';
    errorMsg.classList.remove('hidden');
    btnPay.disabled = false;
    btnPay.textContent = 'Hoàn tất đăng ký';
  }
});

showStep(currentStep);
