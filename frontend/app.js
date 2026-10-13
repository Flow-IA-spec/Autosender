let currentToken = '';
let pollInterval = null;
const API = window.location.origin + '/api';

// ===== TOASTS =====
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3500);
}

// ===== LOGIN =====
async function validateToken() {
  const token = document.getElementById('tokenInput').value.trim();
  const errEl = document.getElementById('loginError');
  if (!token) { errEl.textContent = 'Cole um token'; return; }
  errEl.textContent = '';
  try {
    const res = await fetch(API + '/validate-token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const data = await res.json();
    if (!data.success) { errEl.textContent = 'Token inválido'; return; }
    currentToken = token;
    const u = data.user;
    document.getElementById('userName').textContent = u.global_name;
    document.getElementById('userId').textContent = '#' + u.id;
    // Avatar com fallback
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
    toast('Login realizado!', 'success');
    loadCampaigns();
    startPolling();
  } catch (e) {
    errEl.textContent = 'Erro de conexão: ' + e.message;
  }
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
