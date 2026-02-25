let users = [];
let currentUser = null;
let currentProgram = null;
let isProcessing = false;

// ---------- LOAD USERS ----------
fetch('/api/users')
  .then(r => r.json())
  .then(data => users = data)
  .catch(err => console.error('Error loading users:', err));

// ---------- LOGIN ----------
function login() {
  if (isProcessing) return;
  const p = password.value;
  const loginStatus = document.getElementById('loginStatus') || createStatusElement(loginBox);

  const user = users.find(x => x.password === p);
  if (!user) {
    showStatus(loginStatus, 'Access Denied', 'error');
    password.value = '';
    password.focus();
    return;
  }

  isProcessing = true;
  currentUser = user;
  loginBox.classList.add('hidden');
  appBox.classList.remove('hidden');
  userInfo.innerHTML = `<span>User: <strong>${user.username}</strong></span> <span>Role: <strong>${user.role}</strong></span>`;

  isProcessing = false;
  // Focus program scan after login
  setTimeout(() => programScan.focus(), 100);
}

function createStatusElement(parent) {
  const s = document.createElement('span');
  s.className = 'status-msg';
  s.id = parent.id === 'loginBox' ? 'loginStatus' : 'programStatus';
  parent.appendChild(s);
  return s;
}

function showStatus(el, msg, type) {
  el.innerText = msg;
  el.className = `status-msg ${type} visible`;
  setTimeout(() => {
    el.classList.remove('visible');
  }, 3000);
}

// Add Enter listener for login
password.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') login();
});

// ---------- LOGOUT ----------
function logout() {
  location.reload();
}

// ---------- PROGRAM DETECTION ----------
function getProgram(barcode) {
  // Must be 22 characters, 11th character (index 10) must be 'P'
  if (barcode[10] !== 'P') return null;
  // Extract 12th, 13th, 14th characters (indices 11, 12, 13)
  return barcode.substring(11, 14);
}

// ---------- RESET PROGRAM ----------
function resetProgram() {
  currentProgram = null;
  pouchSection.innerHTML = '';
  scanBox.classList.remove('hidden');
  programScan.value = '';
  isProcessing = false;
  setTimeout(() => programScan.focus(), 100);
}

// ---------- LOAD MBCheck FILE ----------
async function loadMBCheck(program) {
  const res = await fetch(`mbcheck/MBCheck_${program}.txt`);
  const txt = await res.text();
  return txt.split('\n').map(l => l.trim());
}

// ---------- MASK ----------
function applyMask(barcode, mask) {
  let out = '';
  for (let i = 0; i < mask.length && i < barcode.length; i++) {
    if (mask[i] === '1') out += barcode[i];
  }
  return out;
}

// ---------- TRACEABILITY ----------
function logAction(data) {
  const logs = JSON.parse(localStorage.getItem('traceLogs') || '[]');
  logs.push(data);
  localStorage.setItem('traceLogs', JSON.stringify(logs));
}

// ---------- PROGRAM SCAN ----------
programScan.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  if (isProcessing) return;

  pouchSection.innerHTML = '';
  const programBarcode = programScan.value;
  const program = getProgram(programBarcode);
  const programStatus = document.getElementById('programStatus') || createStatusElement(scanBox);

  if (!program) {
    showStatus(programStatus, 'Program Not Found', 'error');
    programScan.value = '';
    programScan.focus();
    return;
  }

  isProcessing = true;
  currentProgram = program;
  scanBox.classList.add('hidden');

  try {
    const lines = await loadMBCheck(program);
    const pouchCount = parseInt(lines[0]);
    const mask = lines[1];
    const refs = lines.slice(10).map(r => r.replace('|', ''));

    pouchSection.innerHTML = `
      <div class="section-header">
        <h3>P${program} – Scan ${pouchCount} pockets</h3>
        <button class="small-btn" onclick="resetProgram()">Scan New Program</button>
      </div>
    `;

    const allInputs = [];

    for (let i = 0; i < pouchCount; i++) {
      const box = document.createElement('div');
      box.className = 'pouch-card';

      const label = document.createElement('h4');
      label.innerText = `POCKET ${i + 1}`;

      const input = document.createElement('input');
      input.placeholder = 'Scan barcode...';
      allInputs.push(input);

      const submitBtn = document.createElement('button');
      submitBtn.className = 'submit-btn';
      submitBtn.innerText = 'Submit Change';

      const statusMsg = document.createElement('span');
      statusMsg.className = 'status-msg';

      let previousBarcode = '';

      const performSubmit = async () => {
        if (isProcessing) return;

        const isOperator = currentUser.role === 'operator';
        if (isOperator && previousBarcode !== '') {
          showStatus(statusMsg, 'No Permission', 'error');
          input.value = previousBarcode;
          return;
        }

        let scanned = input.value;
        if (!scanned) {
          showStatus(statusMsg, 'Enter barcode', 'error');
          input.focus();
          return;
        }

        if (scanned.length < 10) {
          showStatus(statusMsg, 'Invalid Barcode', 'error');
          input.value = '';
          input.focus();
          return;
        }

        isProcessing = true;
        // Strict 10-character truncation
        scanned = scanned.substring(0, 10);
        input.value = scanned;

        try {
          const response = await fetch('/api/update-barcode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              program: currentProgram,
              pouchIndex: i,
              newBarcode: scanned,
              oldBarcode: previousBarcode,
              user: currentUser.username,
              role: currentUser.role
            })
          });

          const result = await response.json();
          if (result.success) {
            // Trust backend success for OK status
            input.className = 'ok';
            showStatus(statusMsg, 'OK', 'ok');
            previousBarcode = scanned;

            // Lock the pocket
            input.disabled = true;
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.5';

            if (allInputs[i + 1]) {
              requestAnimationFrame(() => allInputs[i + 1].focus());
            }
          } else {
            showStatus(statusMsg, 'Save Error', 'error');
            input.value = '';
            input.focus();
          }
        } catch (err) {
          console.error(err);
          showStatus(statusMsg, 'Comm Error', 'error');
          input.value = '';
          input.focus();
        } finally {
          isProcessing = false;
        }
      };

      input.addEventListener('focus', () => input.select());
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') performSubmit(); });
      submitBtn.addEventListener('click', performSubmit);

      box.append(label, input, submitBtn, statusMsg);
      pouchSection.appendChild(box);
    }

    if (allInputs[0]) {
      setTimeout(() => allInputs[0].focus(), 100);
    }
  } catch (err) {
    console.error(err);
    showStatus(programStatus, 'File Error', 'error');
    programScan.value = '';
    programScan.focus();
  } finally {
    isProcessing = false;
  }
});

// Initial focus for login
window.onload = () => {
  if (!password.classList.contains('hidden')) {
    password.focus();
  }
};
