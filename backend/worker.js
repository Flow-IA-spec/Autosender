const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const db = require('./database');
const path = require('path');
const { addLog } = require('./logger');

puppeteer.use(StealthPlugin());

const statusMap = {};
function getCampaignStatus(id) { return statusMap[id]; }

function gaussianDelay(mean, stdDev, min, max) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return Math.max(min, Math.min(max, mean + num * stdDev)) * 1000;
}

function getTypingDelay(len) {
  return len * (40 + (Math.random() * 20 - 10));
}

async function startWorker(campaignId) {
  if (statusMap[campaignId] === 'running') {
    addLog(`Campanha ${campaignId} já está rodando`, 'warn');
    return;
  }
  statusMap[campaignId] = 'running';
  addLog(`Iniciando campanha ${campaignId}...`, 'info');

  db.get(`SELECT * FROM campaigns WHERE id = ?`, [campaignId], async (err, campaign) => {
    if (err || !campaign) {
      statusMap[campaignId] = 'error';
      addLog(`Campanha ${campaignId} não encontrada`, 'error');
      return;
    }

    const channelIds = JSON.parse(campaign.channel_ids);
    const token = campaign.token;

    let browser;
    try {
      addLog('Abrindo navegador Chromium...', 'info');
      browser = await puppeteer.launch({
        headless: 'new',
        // Não definir executablePath — a imagem oficial já sabe onde está o Chromium
        userDataDir: path.join('/tmp', `puppeteer-${campaignId}`),
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-crash-reporter',   // ← remove o erro do crashpad
          '--disable-breakpad',         // ← remove o erro do crashpad
          '--window-size=1280,720'
        ],
        defaultViewport: { width: 1280, height: 720 }
      });
      addLog('Navegador aberto com sucesso', 'success');
    } catch (e) {
      statusMap[campaignId] = 'error';
      addLog(`Falha ao abrir navegador: ${e.message}`, 'error');
      return;
    }

    try {
      const page = await browser.newPage();

      await page.evaluateOnNewDocument((t) => {
        localStorage.setItem('token', `"${t}"`);
      }, token);

      addLog('Autenticando no Discord...', 'info');
      await page.goto('https://discord.com/channels/@me', { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise(r => setTimeout(r, gaussianDelay(3000, 500, 2000, 5000)));

      const initialDelay = gaussianDelay(10000, 3000, 5000, 20000);
      addLog(`Aguardando ${(initialDelay / 1000).toFixed(1)}s antes de começar...`, 'info');
      await new Promise(r => setTimeout(r, initialDelay));

      let sent = 0;
      for (const channelId of channelIds) {
        try {
          addLog(`Navegando ao canal ${channelId}...`, 'info');
          await page.goto(`https://discord.com/channels/@me/${channelId}`, {
            waitUntil: 'domcontentloaded', timeout: 30000
          });
          await new Promise(r => setTimeout(r, gaussianDelay(2500, 800, 1500, 5000)));

          const inputSelector = 'div[role="textbox"][contenteditable="true"]';
          await page.waitForSelector(inputSelector, { timeout: 15000 });

          await page.type(inputSelector, campaign.message, { delay: getTypingDelay(campaign.message.length) });
          await new Promise(r => setTimeout(r, gaussianDelay(800, 300, 300, 1500)));
          await page.keyboard.press('Enter');

          sent++;
          addLog(`✅ Mensagem ${sent}/${channelIds.length} enviada em ${channelId}`, 'success');

          const mean = (campaign.delay_min + campaign.delay_max) / 2;
          const std = (campaign.delay_max - campaign.delay_min) / 4;
          const delay = gaussianDelay(mean, std, campaign.delay_min, campaign.delay_max * 2);
          addLog(`Aguardando ${(delay / 1000).toFixed(1)}s...`, 'info');
          await new Promise(r => setTimeout(r, delay));

          if (sent > 0 && Math.random() < 0.05) {
            const breakTime = gaussianDelay(120000, 30000, 60000, 240000);
            addLog(`☕ Pausa de ${(breakTime / 60000).toFixed(1)} min...`, 'warn');
            await new Promise(r => setTimeout(r, breakTime));
          }
        } catch (e) {
          addLog(`Erro no canal ${channelId}: ${e.message}`, 'error');
          await new Promise(r => setTimeout(r, 15000));
        }
      }

      addLog(`Campanha ${campaignId} concluída. ${sent} mensagens enviadas.`, 'success');
      statusMap[campaignId] = 'done';
    } catch (e) {
      addLog(`Erro durante execução: ${e.message}`, 'error');
      statusMap[campaignId] = 'error';
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  });
}

module.exports = { startWorker, getCampaignStatus };
