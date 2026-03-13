const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const app = express();

require('dotenv').config(); // เพิ่มบรรทัดนี้ไว้บนสุดเพื่อดึงค่าจากไฟล์ .env

const express = require('express');
const bodyParser = require('body-parser');



// --- CONFIGURATION ---
// ดึง Token จากไฟล์ .env (อย่าลืมสร้างไฟล์ .env และใส่ LINE_ACCESS_TOKEN ลงไปนะครับ)
const CH_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN || 'ใส่_TOKEN_ชั่วคราวเพื่อเทสตรงนี้ก่อนได้ครับ';
const checkInterval = 60000; // เช็คทุกๆ 1 นาที (60,000 ms)

// เก็บสถานะ Risk Level แยกระบบกัน เพื่อไม่ให้ค่ามันตีกันเอง
let lastRiskLevels = {
  'Device1': 0,
  'Device2': 0,
  'Device3': 0
};

app.set('port', process.env.PORT || 4000);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// --- WEBHOOK RECEIVER (รับคำสั่งจากผู้ใช้) ---
app.post('/webhook', (req, res) => {
  if (!req.body.events || req.body.events.length === 0) return res.sendStatus(200);

  const event = req.body.events[0];
  if (event.type !== 'message' || event.message.type !== 'text') return res.sendStatus(200);

  const text = event.message.text.toLowerCase();
  const sender = event.source.userId; // รับ ID ของคนที่พิมพ์มา
  
  console.log(`Received command: [${text}] from User: ${sender}`);

  if (text.startsWith('system')) {
    const deviceNum = 'Device' + text.charAt(text.length - 1);
    sendText(sender, `กำลังดึงข้อมูลล่าสุดจาก ${deviceNum} ครับ...`);
    getDataFromGoogleSheet(deviceNum, sender);

  } else if (text === 'website') {
    sendText(sender, 'ดู Dashboard แบบเต็มได้ที่: http://thermoguard.spaceac.net/');

  } else if (text === 'risk' || text === 'risk level') {
    sendText(sender, 'กำลังตรวจสอบระดับความเสี่ยงของทุกระบบ...');
    ['Device1', 'Device2', 'Device3'].forEach(d => RiskLvlChecker(d));
    
  } else {
    sendText(sender, 'พิมพ์คำสั่งไม่ถูกต้องครับ ลองพิมพ์:\n- system1 (เพื่อดูข้อมูลเครื่อง 1)\n- system2\n- system3\n- risk level\n- website');
  }

  res.sendStatus(200);
});

// --- FUNCTIONS ---

// ส่งข้อความกลับไปหาคนที่พิมพ์ถามมา (1 ต่อ 1)
function sendText(to, text) {
  request({
    url: 'https://api.line.me/v2/bot/message/push',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CH_ACCESS_TOKEN}`
    },
    body: { to, messages: [{ type: 'text', text }] },
    json: true
  }, (err, res, body) => {
    if (err) console.error('Push Error:', err);
  });
}

// ยิงข้อความแจ้งเตือนหา "ทุกคน" ที่แอดบอท (Broadcast)
function broadcastText(text) {
  request({
    url: 'https://api.line.me/v2/bot/message/broadcast',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CH_ACCESS_TOKEN}`
    },
    body: { messages: [{ type: 'text', text }] },
    json: true
  }, (err, res, body) => {
    if (err) console.error('Broadcast Error:', err);
    else console.log('Broadcast sent successfully!');
  });
}

// ดึงข้อมูลรายเครื่องจาก Google Sheet
function getDataFromGoogleSheet(DeviceNum, targetSender) {
  const url = `https://docs.google.com/spreadsheets/d/1MkCIXPtFRnHyluy9qfIZXl2MzLan5zm_2iAHLcF4b4A/gviz/tq?tqx=out:csv&sheet=${DeviceNum}`;
  
  fetch(url)
    .then(res => res.text())
    .then(data => {
      const rows = data.split('\n').map(row => row.split(','));
      let msg = `📊 สถานะ ${DeviceNum}:\n`;
      
      for (let i = 2; i <= 9; i++) {
        if (rows[0][i]) {
          msg += `${rows[0][i].replace(/"/g,'')} : ${rows[1][i].replace(/"/g,'')}\n`;
        }
      }
      sendText(targetSender, msg);
    })
    .catch(err => sendText(targetSender, `ขออภัย ไม่สามารถดึงข้อมูล ${DeviceNum} ได้ในขณะนี้`));
}

// ระบบตรวจสอบและแจ้งเตือนอัตโนมัติ (Automated Alert)
function RiskLvlChecker(DeviceNum) {
  const url = `https://docs.google.com/spreadsheets/d/1MkCIXPtFRnHyluy9qfIZXl2MzLan5zm_2iAHLcF4b4A/gviz/tq?tqx=out:csv&sheet=${DeviceNum}`;
  
  fetch(url).then(res => res.text()).then(data => {
    const rows = data.split('\n').map(row => row.split(','));
    const currentRisk = parseInt(rows[1][9].replace(/"/g, '')); // ดึงค่า Risk Level จากคอลัมน์ที่ 9
    const oldRisk = lastRiskLevels[DeviceNum];

    // ถ้าค่าระดับความเสี่ยงเปลี่ยนไปจากเดิม
    if (currentRisk !== oldRisk) {
      lastRiskLevels[DeviceNum] = currentRisk; // อัปเดตค่าใหม่เก็บไว้
      
      let alertMsg = '';
      
      // เงื่อนไขแจ้งเตือนที่คุณเคยเขียนไว้ นำมาปรับใช้ให้ทำงานได้จริง
      if (currentRisk === 1) {
        alertMsg = `⚠️ [${DeviceNum}] แจ้งเตือนระดับ 1:\nเริ่มมีอันตราย โปรดระมัดระวังในการทำกิจกรรม (ค่าขยับจาก ${oldRisk} เป็น ${currentRisk})`;
      } else if (currentRisk === 2) {
        alertMsg = `🚨 [${DeviceNum}] แจ้งเตือนระดับ 2:\nอันตรายเพิ่มขึ้น โปรดระมัดระวังในการทำกิจกรรม (ค่าขยับจาก ${oldRisk} เป็น ${currentRisk})`;
      } else if (currentRisk >= 3) {
        alertMsg = `🆘 [${DeviceNum}] แจ้งเตือนระดับ 3 (วิกฤต):\nอันตรายมากๆ โปรดเข้าที่ร่มหรือที่หลบพักเพื่อความปลอดภัยในชีวิต! (ค่าขยับจาก ${oldRisk} เป็น ${currentRisk})`;
      }

      // ถ้ามีข้อความแจ้งเตือน ให้ทำการ Broadcast หาทุกคน
      if (alertMsg !== '') {
        console.log(`Triggering Broadcast for ${DeviceNum} - Risk: ${currentRisk}`);
        broadcastText(alertMsg);
      }
    }
  }).catch(err => console.error(`Risk Checker Error on ${DeviceNum}:`, err));
}

// --- START SERVER & AUTOMATION ---
app.listen(app.get('port'), () => {
  console.log('ThermoGuard Server is running on port', app.get('port'));
  
  // เริ่มลูปตรวจสอบความเสี่ยงทุกๆ 1 นาที
  console.log(`Starting automated risk checker every ${checkInterval / 1000} seconds...`);
  setInterval(() => {
    ['Device1', 'Device2', 'Device3'].forEach(d => RiskLvlChecker(d));
  }, checkInterval);
});