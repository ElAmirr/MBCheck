let users = [];
let currentUser = null;
let currentProgram = null;

// Electron IPC Communication
const ipc = typeof window !== 'undefined' && window.require ? window.require('electron').ipcRenderer : null;

function shrinkToWidget() {
  if (ipc) {
    mainView.classList.add('hidden');
    titleBar.classList.add('hidden');
    widgetView.classList.remove('hidden');
    ipc.send('minimize-to-widget');
  }
}

function expandView() {
  if (ipc) {
    mainView.classList.remove('hidden');
    titleBar.classList.remove('hidden');
    widgetView.classList.add('hidden');
    ipc.send('expand-to-full');
  }
}

function closeApp() {
  if (ipc) {
    ipc.send('close-app');
  }
}

// ---------- LOAD USERS ----------
fetch('/api/users')
  .then(r => r.json())
  .then(data => users = data)
  .catch(err => console.error('Error loading users:', err));

// ---------- LOGIN ----------
function login() {
  const p = password.value;

  const user = users.find(x => x.password === p);
  if (!user) {
    alert('Access denied');
    return;
  }

  currentUser = user;
  loginBox.classList.add('hidden');
  appBox.classList.remove('hidden');
  userInfo.innerHTML = `<span>User: <strong>${user.username}</strong></span> <span>Role: <strong>${user.role}</strong></span>`;
}

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
programScan.addEventListener('change', async () => {
  pouchSection.innerHTML = '';
  const programBarcode = programScan.value;
  const program = getProgram(programBarcode);

  if (!program) {
    alert('Program not found');
    return;
  }

  currentProgram = program;
  scanBox.classList.add('hidden');

  const lines = await loadMBCheck(program);
  const pouchCount = parseInt(lines[0]);
  const mask = lines[1];
  const refs = lines.slice(10).map(r => r.replace('|', ''));

  pouchSection.innerHTML = `<h3>P${program} – Scan ${pouchCount} pockets</h3>`;

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
      if (currentUser.role === 'operator' && previousBarcode !== '') {
        alert('No permission to rescan');
        input.value = previousBarcode;
        return;
      }

      let scanned = input.value;
      if (!scanned) {
        statusMsg.innerText = 'Enter barcode';
        statusMsg.className = 'status-msg error visible';
        return;
      }

      if (scanned.length < 10) {
        statusMsg.innerText = 'Enter a valid barcode';
        statusMsg.className = 'status-msg error visible';
        return;
      }
      // Take only the first 10 characters as per logic update
      scanned = scanned.substring(0, 10);
      input.value = scanned; // Update UI to show truncated version

      // Update the MBCheck file and log the action via backend
      try {
        const response = await fetch('/api/update-barcode', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
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
          statusMsg.innerText = 'OK';
          statusMsg.className = 'status-msg ok visible';
          const masked = applyMask(scanned, mask);
          const ok = refs.some(r => masked.includes(r));
          input.className = ok ? 'ok' : 'nok';
          previousBarcode = scanned;

          // Lock the pocket: disable input and button
          input.disabled = true;
          submitBtn.disabled = true;
          submitBtn.style.opacity = '0.5';
          submitBtn.style.cursor = 'not-allowed';

          // Auto-focus next input
          if (allInputs[i + 1]) {
            allInputs[i + 1].focus();
          }

          setTimeout(() => {
            statusMsg.classList.remove('visible');
          }, 3000);
        } else {
          statusMsg.innerText = 'Error';
          statusMsg.className = 'status-msg error visible';
          alert('Error updating barcode: ' + result.error);
        }
      } catch (err) {
        console.error('Failed to communicate with backend:', err);
        statusMsg.innerText = 'Comm Error';
        statusMsg.className = 'status-msg error visible';
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        performSubmit();
      }
    });

    submitBtn.addEventListener('click', performSubmit);

    box.append(label, input, submitBtn, statusMsg);
    pouchSection.appendChild(box);
  }

  // Focus the first pocket input after generating them
  if (allInputs[0]) {
    setTimeout(() => allInputs[0].focus(), 100);
  }
});
