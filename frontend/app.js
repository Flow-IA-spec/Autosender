let currentToken = '';
let pollInterval = null;
const API = window.location.origin + '/api';

// ===== ACCOUNT MANAGER =====
const STORAGE_KEY = 'autosender_accounts';
const ACTIVE_KEY = 'autosender_active_account';

function getAccounts() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}
function saveAccounts(accounts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}
function getActiveAccountId() { return localStorage.getItem(ACTIVE_KEY); }
function setActiveAccountId(id) { localStorage.setItem(ACTIVE_KEY, id); }

function renderAccountSelect() {
  const accounts = getAccounts();
  const select = document.getElementById('accountSelect');
  select.innerHTML = '';
  const activeId = getActiveAccountId();
  for (const [id, acc] of Object.entries(accounts)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = `@${acc.username} (#${id.slice(0, 6)})`;
    if (id === activeId) opt.selected = true;
    select.appendChild(opt);
  }
  if (!Object.keys(accounts).length) {
    select.innerHTML = '<option disabled>Nenhuma conta</option>';
  }
}

async function switchAccount() {
  const id = document.getElementById('accountSelect').value;
  const accounts = getAccounts();
  if (!accounts[id]) return;
  setActiveAccountId(id);
  await loginWithToken(accounts[id].token, accounts[id]);
}

function addAccount() {
  const token = prompt('Cole o token da nova conta:');
  if (!token || !token.trim()) return;
  validateTokenAndStore(token.trim());
}

async function removeAccount() {
  const id = getActiveAccountId();
  if (!id) return;
  if (!confirm('Remover esta conta?')) return;
  const accounts = getAccounts();
  delete accounts[id];
  saveAccounts(accounts);
  const remaining = Object.keys(accounts);
  if (remaining.length) {
    setActiveAccountId(remaining[0]);
    const acc = accounts[remaining[0]];
    await loginWithToken(acc.token, acc);
  } else {
    localStorage.removeItem(ACTIVE_KEY);
    location.reload();
  }
}

// ===== LOGIN =====
async function validateToken() {
  const token = document.getElementById('tokenInput').value.trim();
  if (!token) { document.getElementById('loginError').textContent = 'Cole um token'; return; }
  await validateTokenAndStore(token);
}

async function validateTokenAndStore(token) {
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  try {
    const res = await fetch(API + '/validate-token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = 'Token inválido'; return; }
    const u = data.user;
    // Salvar conta
    const accounts = getAccounts();
    accounts[u.id] = { token, username: u.global_name || u.username, id: u.id, avatar: u.avatar, discriminator: u.discriminator };
    saveAccounts(accounts);
    setActiveAccountId(u.id);
    await loginWithToken(token, accounts[u.id]);
  } catch (e) {
    errEl.textContent = 'Erro de conexão: ' + e.message;
  }
}

async function loginWithToken(token, userData) {
  currentToken = token;
  const u = userData;
  document.getElementById('userName').textContent = u.username;
  document.getElementById('userId').textContent = '#' + u.id.slice(0, 8);

  let avatarUrl;
  if (u.avatar) {
    avatarUrl = `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128`;
  } else {
    const idx = u.discriminator && u.discriminator !== '0'
      ? parseInt(u.discriminator) % 5
      : Number(BigInt(u.id) >> 22n) % 6;
    avatarUrl = `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  }
  document.getElementById('userAvatar').src = avatarUrl;
  document.getElementById('userAvatar').onerror = () => {
    document.getElementById('userAvatar').src = 'https://cdn.discordapp.com/embed/avatars/0.png';
  };

  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');
  renderAccountSelect();
  toast('Login realizado!', 'success');
  loadCampaigns();
  startPolling();
}

// ===== NAVEGAÇÃO =====
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    const tab = item.dataset.tab;
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
  });
});

// ===== CAMPANHAS =====
async function createCampaign() {
  const channelIds = document.getElementById('channelIds').value.split(',').map(s => s.trim()).filter(Boolean);
  const message = document.getElementById('message').value.trim();
  const delayMin = parseInt(document.getElementById('delayMin').value) || 8;
  const delayMax = parseInt(document.getElementById('delayMax').value) || 15;
  if (!channelIds.length || !message) { toast('Preencha canal e mensagem', 'error'); return; }

  const res = await fetch(API + '/campaigns', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: currentToken, channel_ids: channelIds, message, delay_min: delayMin, delay_max: delayMax })
  });
  const data = await res.json();
  if (data.success) {
    toast('Campanha criada!', 'success');
    document.getElementById('channelIds').value = '';
    document.getElementById('message').value = '';
    loadCampaigns();
    document.querySelector('.nav-item[data-tab="campaigns"]').click();
  } else toast('Erro ao criar', 'error');
}

async function loadCampaigns() {
  const res = await fetch(API + '/campaigns');
  const campaigns = await res.json();
  const list = document.getElementById('campaignsList');
  if (!campaigns.length) {
    list.innerHTML = '<p style="color:#888">Nenhuma campanha ainda. Crie uma!</p>';
  } else {
    list.innerHTML = campaigns.map(c => `
      <div class="campaign-item">
        <div class="campaign-info">
          <strong>${escapeHtml(c.message.substring(0, 60))}${c.message.length > 60 ? '...' : ''}</strong>
          <small>${c.channel_ids.length} canais · delay ${c.delay_min}-${c.delay_max}s</small>
        </div>
        <div>
          <span class="badge ${c.status || 'idle'}">${c.status || 'idle'}</span>
          <button class="btn-run" ${c.status === 'running' ? 'disabled' : ''} onclick="startCampaign(${c.id})">▶ Iniciar</button>
        </div>
      </div>
    `).join('');
  }
  document.getElementById('statCampaigns').textContent = campaigns.length;
  document.getElementById('statRunning').textContent = campaigns.filter(c => c.status === 'running').length;
}

async function startCampaign(id) {
  await fetch(API + '/campaigns/' + id + '/start', { method: 'POST' });
  toast('Campanha iniciada!', 'success');
  loadCampaigns();
}

// ===== LOGS =====
async function loadLogs() {
  try {
    const res = await fetch(API + '/logs');
    const logs = await res.json();
    const viewer = document.getElementById('logViewer');
    const mini = document.getElementById('dashboardLogs');
    const html = logs.slice(-200).reverse().map(l => `
      <div class="log-entry">
        <span class="log-time">${new Date(l.timestamp).toLocaleTimeString()}</span>
        <span class="log-${l.level}">${escapeHtml(l.message)}</span>
      </div>
    `).join('');
    if (viewer) viewer.innerHTML = html || '<span style="color:#888">Sem logs ainda...</span>';
    if (mini) mini.innerHTML = logs.slice(-8).reverse().map(l => `
      <div class="log-entry">
        <span class="log-time">${new Date(l.timestamp).toLocaleTimeString()}</span>
        <span class="log-${l.level}">${escapeHtml(l.message)}</span>
      </div>
    `).join('') || '<span style="color:#888">Sem atividade ainda...</span>';

    const successCount = logs.filter(l => l.level === 'success' && l.message.includes('Mensagem')).length;
    document.getElementById('statSent').textContent = successCount;
  } catch (e) {}
}

async function clearLogsUI() {
  await fetch(API + '/logs/clear', { method: 'POST' });
  loadLogs();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => {
    loadLogs();
    loadCampaigns();
  }, 2500);
  loadLogs();
}

// Enter no login
document.getElementById('tokenInput').addEventListener('keypress', e => {
  if (e.key === 'Enter') validateToken();
});

// ===== AUTO-LOGIN =====
(function autoLogin() {
  const accounts = getAccounts();
  const activeId = getActiveAccountId();
  if (activeId && accounts[activeId]) {
    loginWithToken(accounts[activeId].token, accounts[activeId]);
  }
})();
