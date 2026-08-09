require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const app = express();

// --- CONFIGURATION ---
const CH_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN || 'ใส่_TOKEN_ชั่วคราวเพื่อเทสตรงนี้ก่อนได้ครับ';
const CH_SECRET = process.env.LINE_CHANNEL_SECRET || '';
const checkInterval = 60000; // เช็คทุกๆ 1 นาที (60,000 ms)

// เก็บสถานะ Risk Level แยกระบบกัน เพื่อไม่ให้ค่ามันตีกันเอง
let lastRiskLevels = {
  'Device1': 0,
  'Device2': 0,
  'Device3': 0
};

app.set('port', process.env.PORT || 4000);

// Raw body parser for optional LINE signature verification
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(bodyParser.urlencoded({ extended: true }));

// --- HELPER FUNCTIONS ---

// Helper to safely parse CSV format from Google Sheets (handles quotes and commas gracefully)
function parseCSV(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => {
      const matches = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
      if (!matches) return line.split(',');
      return matches.map(cell => cell.replace(/^"|"$/g, '').trim());
    });
}

// Timing-safe verification of LINE Signature header
function verifySignature(req) {
  if (!CH_SECRET) return true; // Skip if secret is not configured
  const signature = req.headers['x-line-signature'];
  if (!signature || !req.rawBody) return false;

  try {
    const signatureBuffer = Buffer.from(signature, 'base64');
    const hashBuffer = crypto
      .createHmac('sha256', CH_SECRET)
      .update(req.rawBody)
      .digest();

    if (signatureBuffer.length !== hashBuffer.length) return false;
    return crypto.timingSafeEqual(signatureBuffer, hashBuffer);
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

// --- HEALTH CHECK ROUTE ---
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ThermoGuard LINE Bot Backend',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// --- WEBHOOK RECEIVER (รับคำสั่งจากผู้ใช้) ---
app.post('/webhook', (req, res) => {
  if (!verifySignature(req)) {
    console.warn('Webhook signature verification failed');
    return res.status(401).send('Unauthorized signature');
  }

  if (!req.body.events || !Array.isArray(req.body.events)) {
    return res.sendStatus(200);
  }

  for (const event of req.body.events) {
    if (event.type !== 'message' || !event.message || event.message.type !== 'text') {
      continue;
    }

    const text = event.message.text.trim().toLowerCase();
    const sender = event.source ? event.source.userId : null;
    const replyToken = event.replyToken;
    if (!sender) continue;

    console.log(`Received command: [${text}] from User: ${sender}`);

    const systemMatch = text.match(/^system\s*([1-3])$/i);

    if (systemMatch) {
      const deviceNum = 'Device' + systemMatch[1];
      getDataFromGoogleSheet(deviceNum, replyToken, sender);

    } else if (text === 'website') {
      sendReply(replyToken, 'ดู Dashboard แบบเต็มได้ที่: http://thermoguard.spaceac.net/');

    } else if (text === 'risk' || text === 'risk level') {
      sendReply(replyToken, 'กำลังตรวจสอบระดับความเสี่ยงของทุกระบบ...');
      ['Device1', 'Device2', 'Device3'].forEach(d => RiskLvlChecker(d));

    } else {
      sendReply(replyToken, 'พิมพ์คำสั่งไม่ถูกต้องครับ ลองพิมพ์:\n- system1 (เพื่อดูข้อมูลเครื่อง 1)\n- system2\n- system3\n- risk level\n- website');
    }
  }

  res.sendStatus(200);
});

// --- FUNCTIONS ---

// ส่งข้อความตอบกลับโดยใช้ Reply API (ประหยัดโควต้า Push)
function sendReply(replyToken, text) {
  if (!replyToken) return;

  fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CH_ACCESS_TOKEN}`
    },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] })
  })
  .then(async res => {
    if (!res.ok) {
      const errBody = await res.text();
      console.error('Reply Error:', res.status, errBody);
    }
  })
  .catch(err => console.error('Reply Error:', err));
}

// ส่งข้อความ Push หาคนใดคนหนึ่ง (1 ต่อ 1)
function sendPush(to, text) {
  if (!to) return;

  fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CH_ACCESS_TOKEN}`
    },
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] })
  })
  .then(async res => {
    if (!res.ok) {
      const errBody = await res.text();
      console.error('Push Error:', res.status, errBody);
    }
  })
  .catch(err => console.error('Push Error:', err));
}

// ยิงข้อความแจ้งเตือนหา "ทุกคน" ที่แอดบอท (Broadcast)
function broadcastText(text) {
  fetch('https://api.line.me/v2/bot/message/broadcast', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CH_ACCESS_TOKEN}`
    },
    body: JSON.stringify({ messages: [{ type: 'text', text }] })
  })
  .then(async res => {
    if (!res.ok) {
      const errBody = await res.text();
      console.error('Broadcast Error:', res.status, errBody);
    } else {
      console.log('Broadcast sent successfully!');
    }
  })
  .catch(err => console.error('Broadcast Error:', err));
}

// ดึงข้อมูลรายเครื่องจาก Google Sheet
function getDataFromGoogleSheet(DeviceNum, replyToken, targetSender) {
  const url = `https://docs.google.com/spreadsheets/d/1MkCIXPtFRnHyluy9qfIZXl2MzLan5zm_2iAHLcF4b4A/gviz/tq?tqx=out:csv&sheet=${DeviceNum}`;
  
  fetch(url)
    .then(res => res.text())
    .then(data => {
      const rows = parseCSV(data);
      if (rows.length < 2) {
        const errorMsg = `ขออภัย ไม่สามารถดึงข้อมูล ${DeviceNum} ได้ในขณะนี้ (ข้อมูลไม่สมบูรณ์)`;
        return replyToken ? sendReply(replyToken, errorMsg) : sendPush(targetSender, errorMsg);
      }

      let msg = `📊 สถานะ ${DeviceNum}:\n`;
      for (let i = 2; i <= 9; i++) {
        if (rows[0] && rows[0][i] !== undefined && rows[1] && rows[1][i] !== undefined) {
          const key = rows[0][i].replace(/"/g, '').trim();
          const val = rows[1][i].replace(/"/g, '').trim();
          if (key) {
            msg += `${key} : ${val}\n`;
          }
        }
      }

      if (replyToken) {
        sendReply(replyToken, msg);
      } else {
        sendPush(targetSender, msg);
      }
    })
    .catch(err => {
      console.error(`Google Sheet Fetch Error (${DeviceNum}):`, err);
      const errText = `ขออภัย ไม่สามารถดึงข้อมูล ${DeviceNum} ได้ในขณะนี้`;
      if (replyToken) sendReply(replyToken, errText);
      else sendPush(targetSender, errText);
    });
}

// ระบบตรวจสอบและแจ้งเตือนอัตโนมัติ (Automated Alert)
function RiskLvlChecker(DeviceNum) {
  const url = `https://docs.google.com/spreadsheets/d/1MkCIXPtFRnHyluy9qfIZXl2MzLan5zm_2iAHLcF4b4A/gviz/tq?tqx=out:csv&sheet=${DeviceNum}`;
  
  fetch(url)
    .then(res => res.text())
    .then(data => {
      const rows = parseCSV(data);
      if (!rows[1] || !rows[1][9]) return;

      const currentRisk = parseInt(rows[1][9].replace(/"/g, '').trim(), 10);
      if (isNaN(currentRisk)) return;

      const oldRisk = lastRiskLevels[DeviceNum];

      // ถ้าค่าระดับความเสี่ยงเปลี่ยนไปจากเดิม
      if (currentRisk !== oldRisk) {
        lastRiskLevels[DeviceNum] = currentRisk; // อัปเดตค่าใหม่เก็บไว้
        
        let alertMsg = '';
        
        if (currentRisk === 1) {
          alertMsg = `⚠️ [${DeviceNum}] แจ้งเตือนระดับ 1:\nเริ่มมีอันตราย โปรดระมัดระวังในการทำกิจกรรม (ค่าขยับจาก ${oldRisk} เป็น ${currentRisk})`;
        } else if (currentRisk === 2) {
          alertMsg = `🚨 [${DeviceNum}] แจ้งเตือนระดับ 2:\nอันตรายเพิ่มขึ้น โปรดระมัดระวังในการทำกิจกรรม (ค่าขยับจาก ${oldRisk} เป็น ${currentRisk})`;
        } else if (currentRisk >= 3) {
          alertMsg = `🆘 [${DeviceNum}] แจ้งเตือนระดับ 3 (วิกฤต):\nอันตรายมากๆ โปรดเข้าที่ร่มหรือที่หลบพักเพื่อความปลอดภัยในชีวิต! (ค่าขยับจาก ${oldRisk} เป็น ${currentRisk})`;
        } else if (currentRisk === 0 && oldRisk > 0) {
          alertMsg = `✅ [${DeviceNum}] สถานะกลับสู่ภาวะปกติ (ระดับ 0):\nความเสี่ยงลดลงเรียบร้อยแล้ว`;
        }

        // ถ้ามีข้อความแจ้งเตือน ให้ทำการ Broadcast หาทุกคน
        if (alertMsg !== '') {
          console.log(`Triggering Broadcast for ${DeviceNum} - Risk: ${currentRisk}`);
          broadcastText(alertMsg);
        }
      }
    })
    .catch(err => console.error(`Risk Checker Error on ${DeviceNum}:`, err));
}

// --- START SERVER & AUTOMATION ---
const server = app.listen(app.get('port'), () => {
  console.log('ThermoGuard Server is running on port', app.get('port'));
  
  // เริ่มลูปตรวจสอบความเสี่ยงทุกๆ 1 นาที
  console.log(`Starting automated risk checker every ${checkInterval / 1000} seconds...`);
  const riskInterval = setInterval(() => {
    ['Device1', 'Device2', 'Device3'].forEach(d => RiskLvlChecker(d));
  }, checkInterval);

  // Graceful shutdown handling
  const shutdown = (signal) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    clearInterval(riskInterval);
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
});