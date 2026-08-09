require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const mqtt = require('mqtt');
const app = express();

// --- CONFIGURATION ---
const CH_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN || 'ใส่_TOKEN_ชั่วคราวเพื่อเทสตรงนี้ก่อนได้ครับ';
const CH_SECRET = process.env.LINE_CHANNEL_SECRET || '';
const checkInterval = 60000; // เช็คทุกๆ 1 นาที (60,000 ms)

// MQTT Config for Hardware Alerts
const MQTT_SERVER = process.env.MQTT_SERVER || '';
const MQTT_PORT = parseInt(process.env.MQTT_PORT || '18772', 10);
const MQTT_USERNAME = process.env.MQTT_USERNAME || '';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';
const MQTT_BROADCAST_TOPIC = process.env.MQTT_BROADCAST_TOPIC || '/ESP32/broadcast';

// เก็บสถานะ Risk Level แยกระบบกัน เพื่อไม่ให้ค่ามันตีกันเอง
let lastRiskLevels = {
  'Device1': 0,
  'Device2': 0,
  'Device3': 0
};

// Setup MQTT Client (if broker is configured)
let mqttClient = null;
if (MQTT_SERVER && MQTT_SERVER !== 'your_mqtt_broker_host') {
  try {
    const protocol = MQTT_PORT === 8883 ? 'mqtts' : 'mqtt';
    mqttClient = mqtt.connect(`${protocol}://${MQTT_SERVER}:${MQTT_PORT}`, {
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
      reconnectPeriod: 5000,
      connectTimeout: 5000
    });

    mqttClient.on('connect', () => {
      console.log('Connected to MQTT Broker successfully!');
    });

    mqttClient.on('error', (err) => {
      console.error('MQTT Client Error:', err.message);
    });
  } catch (err) {
    console.error('Failed to initialize MQTT client:', err.message);
  }
}

app.set('port', process.env.PORT || 4000);

// Raw body parser for optional LINE signature verification
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(bodyParser.urlencoded({ extended: true }));

// --- HELPER FUNCTIONS ---

// Broadcast Heat Alert payload to all physical ESP32 hardware devices over MQTT
function broadcastMqttAlert(deviceNum, currentRisk, alertMsg) {
  if (!mqttClient || !mqttClient.connected) {
    console.log(`MQTT not connected. Skipping hardware MQTT broadcast for ${deviceNum}.`);
    return;
  }

  const broadcastTopic = MQTT_BROADCAST_TOPIC;
  const signalMsg = `HEAT_ALERT:${currentRisk}:${deviceNum}`;
  
  mqttClient.publish(broadcastTopic, signalMsg, { qos: 1 }, (err) => {
    if (err) {
      console.error(`MQTT Broadcast Error on ${broadcastTopic}:`, err);
    } else {
      console.log(`📢 Published Heat Alert to MQTT broadcast topic: ${broadcastTopic} (${signalMsg})`);
    }
  });

  const deviceTopic = `/ESP32/${deviceNum.toLowerCase()}`;
  const payload = JSON.stringify({
    event: 'HEAT_ALERT',
    device: deviceNum,
    riskLevel: currentRisk,
    message: alertMsg,
    timestamp: new Date().toISOString()
  });

  mqttClient.publish(deviceTopic, payload, { qos: 1 }, (err) => {
    if (err) console.error(`MQTT Device Publish Error on ${deviceTopic}:`, err);
  });
}

// Fetch single device status from Google Sheets
async function fetchDeviceSummary(DeviceNum) {
  const url = `https://docs.google.com/spreadsheets/d/1MkCIXPtFRnHyluy9qfIZXl2MzLan5zm_2iAHLcF4b4A/gviz/tq?tqx=out:csv&sheet=${DeviceNum}`;
  try {
    const res = await fetch(url);
    const data = await res.text();

    if (data.trim().startsWith('<') || data.includes('<!DOCTYPE html>') || data.includes('<html')) {
      return { device: DeviceNum, ok: false, risk: lastRiskLevels[DeviceNum] || 0, details: 'ออนไลน์' };
    }

    const rows = parseCSV(data);
    if (!rows[1] || rows.length < 2) {
      return { device: DeviceNum, ok: false, risk: lastRiskLevels[DeviceNum] || 0, details: 'ข้อมูลไม่สมบูรณ์' };
    }

    const riskVal = parseInt(rows[1][9] ? rows[1][9].replace(/"/g, '').trim() : '0', 10);
    const risk = isNaN(riskVal) ? (lastRiskLevels[DeviceNum] || 0) : riskVal;

    let keyMetrics = [];
    for (let i = 2; i <= 8; i++) {
      if (rows[0] && rows[0][i] !== undefined && rows[1] && rows[1][i] !== undefined) {
        const k = rows[0][i].replace(/"/g, '').trim();
        const v = rows[1][i].replace(/"/g, '').trim();
        if (k && v && !k.includes('{') && !k.includes(':') && k.length < 30) {
          keyMetrics.push(`${k}: ${v}`);
        }
      }
    }

    return {
      device: DeviceNum,
      ok: true,
      risk,
      details: keyMetrics.slice(0, 3).join(' | ') || 'ปกติ'
    };
  } catch (err) {
    return { device: DeviceNum, ok: false, risk: lastRiskLevels[DeviceNum] || 0, details: 'ไม่สามารถดึงข้อมูลได้' };
  }
}

// Fetch and combine summary status across all 3 devices
async function getAllDevicesStatusText() {
  const devices = ['Device1', 'Device2', 'Device3'];
  const results = await Promise.all(devices.map(fetchDeviceSummary));
  
  let summary = `📋 สถานะรวมทุกอุปกรณ์ในระบบ (All Devices Status):\n`;
  results.forEach(r => {
    const riskEmoji = r.risk === 0 ? '🟢' : r.risk === 1 ? '🟡' : r.risk === 2 ? '🟠' : '🆘';
    summary += `${riskEmoji} ${r.device}: ระดับความเสี่ยง ${r.risk} (${r.details})\n`;
  });
  return summary.trim();
}

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
    mqttConnected: mqttClient ? mqttClient.connected : false,
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
      getAllDevicesStatusText().then(summaryText => {
        sendReply(replyToken, summaryText);
      });
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

// ระบบตรวจสอบและแจ้งเตือนอัตโนมัติ (Automated Heat Index & Risk Alert)
function RiskLvlChecker(DeviceNum) {
  const url = `https://docs.google.com/spreadsheets/d/1MkCIXPtFRnHyluy9qfIZXl2MzLan5zm_2iAHLcF4b4A/gviz/tq?tqx=out:csv&sheet=${DeviceNum}`;
  
  fetch(url)
    .then(res => res.text())
    .then(async data => {
      const rows = parseCSV(data);
      if (!rows[1] || !rows[1][9]) return;

      const currentRisk = parseInt(rows[1][9].replace(/"/g, '').trim(), 10);
      if (isNaN(currentRisk)) return;

      // Extract Heat Index value if present in spreadsheet columns
      let heatIndexVal = null;
      if (rows[0] && rows[1]) {
        for (let c = 0; c < rows[0].length; c++) {
          const colHeader = rows[0][c] ? rows[0][c].replace(/"/g, '').trim().toLowerCase() : '';
          if (colHeader.includes('heat index') || colHeader.includes('ดัชนีความร้อน') || colHeader === 'hi') {
            const val = parseFloat(rows[1][c] ? rows[1][c].replace(/"/g, '').trim() : '');
            if (!isNaN(val)) {
              heatIndexVal = val;
            }
          }
        }
      }

      const oldRisk = lastRiskLevels[DeviceNum];

      // ถ้าค่าระดับความเสี่ยงเปลี่ยนไปจากเดิม
      if (currentRisk !== oldRisk) {
        lastRiskLevels[DeviceNum] = currentRisk; // อัปเดตค่าใหม่เก็บไว้
        
        let alertMsg = '';
        const hiText = heatIndexVal !== null ? ` (ค่า Heat Index: ${heatIndexVal}°C)` : '';
        
        if (currentRisk === 1) {
          alertMsg = `⚠️ [${DeviceNum}] แจ้งเตือนความเสี่ยงดัชนีความร้อน ระดับ 1:\nเริ่มมีอันตราย${hiText} โปรดระมัดระวังในการทำกิจกรรม (ระดับ ${oldRisk} ➡️ ${currentRisk})`;
        } else if (currentRisk === 2) {
          alertMsg = `🚨 [${DeviceNum}] แจ้งเตือนความเสี่ยงดัชนีความร้อน ระดับ 2:\nอันตรายเพิ่มขึ้น${hiText} โปรดระมัดระวังในการทำกิจกรรม (ระดับ ${oldRisk} ➡️ ${currentRisk})`;
        } else if (currentRisk >= 3) {
          alertMsg = `🆘 [${DeviceNum}] แจ้งเตือนความเสี่ยงดัชนีความร้อน ระดับ 3 (วิกฤต/เกินเกณฑ์มาตรฐาน):\nอันตรายมากๆ${hiText} โปรดเข้าที่ร่มหรือที่หลบพักเพื่อความปลอดภัย! (ระดับ ${oldRisk} ➡️ ${currentRisk})`;
        } else if (currentRisk === 0 && oldRisk > 0) {
          alertMsg = `✅ [${DeviceNum}] สถานะดัชนีความร้อนกลับสู่ภาวะปกติ (ระดับ 0):\nความเสี่ยงลดลงเรียบร้อยแล้ว`;
        }

        // ถ้ามีข้อความแจ้งเตือน ให้ทำการ Broadcast หาทุกคนที่แอดเพื่อนบอท LINE นี้ไว้
        if (alertMsg !== '') {
          console.log(`Triggering LINE Broadcast for ${DeviceNum} - Risk: ${currentRisk}, HI: ${heatIndexVal}`);

          // Fetch summary of all devices to announce total status
          const summaryText = await getAllDevicesStatusText();
          const combinedMsg = `📢 [HEAT ALERT BROADCAST - แจ้งเตือนสมาชิกทุกคน]\n${alertMsg}\n\n====================\n${summaryText}`;

          // LINE Broadcast to all users who added this LINE Official Account as a friend
          broadcastText(combinedMsg);

          // MQTT Hardware Broadcast to all ESP32 devices
          broadcastMqttAlert(DeviceNum, currentRisk, alertMsg);
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
    if (mqttClient) mqttClient.end();
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
});