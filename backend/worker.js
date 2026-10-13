const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const db = require('./database');
const path = require('path');

puppeteer.use(StealthPlugin());

function gaussianDelay(mean, stdDev, min, max) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  const value = mean + num * stdDev;
  return Math.max(min, Math.min(max, value)) * 1000;
}

function getTypingDelay(messageLength) {
  const base = 40;
  const jitter = 20;
  return messageLength * (base + (Math.random() * jitter - jitter / 2));
}

async function startWorker(campaignId) {
  db.get(`SELECT * FROM campaigns WHERE id = ?`, [campaignId], async (err, campaign) => {
    if (err || !campaign) return console.error('Campanha não encontrada');

    const channelIds = JSON.parse(campaign.channel_ids);
    const token = campaign.token;

    const browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      userDataDir: path.join(__dirname, '..', 'user-data'),
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--window-size=1920,1080'
      ],
      defaultViewport: { width: 1920, height: 1080 }
    });

    const page = await browser.newPage();

    await page.evaluateOnNewDocument((t) => {
      localStorage.setItem('token', `"${t}"`);
    }, token);

    await page.goto('https://discord.com/channels/@me', { waitUntil: 'networkidle2', timeout: 60000 });

    await new Promise(r => setTimeout(r, gaussianDelay(3000, 500, 2000, 5000)));

    const initialDelay = gaussianDelay(15000, 5000, 8000, 30000);
    console.log(`Aguardando ${(initialDelay / 1000).toFixed(1)}s antes de começar...`);
    await new Promise(r => setTimeout(r, initialDelay));

    let messageCount = 0;

    for (const channelId of channelIds) {
      try {
        await page.goto(`https://discord.com/channels/@me/${channelId}`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });

        await new Promise(r => setTimeout(r, gaussianDelay(2500, 800, 1500, 5000)));

        const inputSelector = 'div[role="textbox"][contenteditable="true"]';
        await page.waitForSelector(inputSelector, { timeout: 15000 });

        const typingDelay = getTypingDelay(campaign.message.length);
        await page.type(inputSelector, campaign.message, { delay: typingDelay });

        await new Promise(r => setTimeout(r, gaussianDelay(800, 300, 300, 1500)));

        await page.keyboard.press('Enter');

        messageCount++;
        console.log(`[${messageCount}] Mensagem enviada em ${channelId}`);

        const mean = (campaign.delay_min + campaign.delay_max) / 2;
        const std = (campaign.delay_max - campaign.delay_min) / 4;
        const delay = gaussianDelay(mean, std, campaign.delay_min, campaign.delay_max * 2);
        console.log(`Aguardando ${(delay / 1000).toFixed(1)}s...`);
        await new Promise(r => setTimeout(r, delay));

        if (messageCount > 0 && Math.random() < 0.05) {
          const breakTime = gaussianDelay(150000, 30000, 60000, 300000);
          console.log(`☕ Pausa de ${(breakTime / 1000 / 60).toFixed(1)} minutos...`);
          await new Promise(r => setTimeout(r, breakTime));
        }

      } catch (err) {
        console.error(`Erro no canal ${channelId}:`, err.message);
        await new Promise(r => setTimeout(r, 30000));
      }
    }

    console.log('Campanha concluída. Fechando browser...');
    await browser.close();
  });
}

module.exports = { startWorker };
