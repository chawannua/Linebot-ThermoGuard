const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const app = express();
var olddata = 0;
const checkInterval = 60000; // 1 minute
let globalSender; // Define a global variable to store the sender

// Your Channel access token (long-lived)
const CH_ACCESS_TOKEN = '7nntV9CadnWw54gO9B+lAJTF1Ap4RF5lCJatqOLRrzHZO0wrSewxnSh8bV9kJSHf0xuwIPW5gw+08gH3W3nVK6KuDW9AB6ctP5SxleybdphHk4klApt8z68dp2OXcliJ27pXppy4Un4cx7j8DTXraAdB04t89/1O/w1cDnyilFU=';
const LINE_RETRY_KEY = 'your_retry_key'; // Generate a unique UUID

app.use(bodyParser.json());

app.set('port', process.env.PORT || 4000);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.post('/webhook', (req, res) => {
  const text = req.body.events[0].message.text.toLowerCase();
  const sender = req.body.events[0].source.userId;
  globalSender = sender; // Store the sender in the global variable
  const replyToken = req.body.events[0].replyToken;
  console.log('Received Line message:', text, 'from sender:', sender);

  if (text === 'system1' || text === 'system2' || text === 'system3') {
    // Determine the target ESP32 based on the received text
    const espDevice = 'Device' + text.charAt(text.length - 1);
    // Send the corresponding command to the MQTT topic
    console.log('Received command:', text);
    sendText(sender, 'Sending a command to request data from ' + espDevice + '...');
    getDataFromGoogleSheet(espDevice);

  } else if (text === 'website') {
    console.log('Received command: website');
    // Website
    sendText(sender, 'Here is our website: http://thermoguard.spaceac.net/');

  } else if (text === 'risk level' || text === 'risklevel' || text === 'risk') {
    console.log('Received command: risk level');
    CheckForRiskLvlChanges('Device1');
    CheckForRiskLvlChanges('Device2');
    CheckForRiskLvlChanges('Device3');
    // Add more devices as needed
    sendText(sender, 'Checking for risk level changes...');
    sendText(sender, notificationMessage);
    
  } else if (text === 'test') {
  TextAll(text,'test message');
  sendBroadcastToUser('Ud61051a9f069c83edeb9b887dcf9d78f', 'This is a test broadcast message to a single user.');
  
  } else {
    // Other
    sendText(sender, 'Please use the menu command or "system1," "system2," "system3" or "risk level" command to control the ESP32 devices. For more info, visit http://thermoguard.spaceac.net/');
  }

  res.sendStatus(200);
});

function TextAll(text) {
  const data = {
    messages: [
      {
        type: 'text',
        text: text,
      },
    ],
  };

  const options = {
    url: 'https://api.line.me/v2/bot/message/broadcast',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CH_ACCESS_TOKEN}`,
      'X-Line-Retry-Key': LINE_RETRY_KEY,
    },
    json: data,
  };

  //const requestData = {
  //  to: ['@all'], // Send the broadcast message to all users
  // messages: [
  //    {
  //      type: 'text',
  //      text: text,
  //    },
  //  ],
  //};

  request(options, (error, response, body) => {
    if (!error && response.statusCode === 200) {
      console.log('Broadcast message sent successfully:', body);
    } else {
      console.error('Error sending broadcast message:', error);
    }
  });
}

function sendText(sender, text) {
  const data = {
    to: sender,
    messages: [
      {
        type: 'text',
        text: text,
      },
    ],
  };

  request(
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + CH_ACCESS_TOKEN,
      },
      url: 'https://api.line.me/v2/bot/message/push',
      method: 'POST',
      body: data,
      json: true,
    },
    (err, res, body) => {
      if (err) {
        console.log('Error sending Line message:', err);
      } else {
        console.log('Successfully sent Line message:', body);
      }
    }
  );
}

function getDataFromGoogleSheet(DeviceNum) {
  const googleSheetURL = 'https://docs.google.com/spreadsheets/d/1MkCIXPtFRnHyluy9qfIZXl2MzLan5zm_2iAHLcF4b4A/gviz/tq?tqx=out:csv&sheet=' + DeviceNum;
  console.log(googleSheetURL);
  fetch(googleSheetURL)
    .then((response) => response.text())
    .then((data) => {
      const dataArray = data.split('\n').map((row) => row.split(','));
      var responseText = "Data for " + DeviceNum + ":\n\n";
      for (let index = 0; index < dataArray[1].length; index++) {
        if (index > 9) {
          break;
        }
        if (index >= 2) {
          responseText += dataArray[0][index].replace(/"/g,'') + " : " + dataArray[1][index].replace(/"/g,'') + "\n";
        }
      }
      sendText(globalSender, responseText);
    })
    .catch((error) => {
      console.error(error);
      sendText(globalSender, 'Error retrieving data from Device ' + DeviceNum + '. Please try again later');
    });
}

function CheckForRiskLvlChanges(DeviceNum) {
  // Call RiskLvlChecker for each device and provide the correct device name as the first argument
  RiskLvlChecker(DeviceNum);
  // Schedule the next check
  setTimeout(() => CheckForRiskLvlChanges(DeviceNum), checkInterval);
}

function RiskLvlChecker(DeviceNum) {
  const googleSheetURL = 'https://docs.google.com/spreadsheets/d/1MkCIXPtFRnHyluy9qfIZXl2MzLan5zm_2iAHLcF4b4A/gviz/tq?tqx=out:csv&sheet=' + DeviceNum;
  console.log(googleSheetURL);
  fetch(googleSheetURL)
    .then((response) => response.text())
    .then((data) => {

      
      const dataArray = data.split('\n').map((row) => row.split(','));
      console.log(dataArray[1][9] + " " + DeviceNum);
      const theval = dataArray[1][9].replace(/"/g, '');
      
      if (theval !== olddata) {
        console.log("changed");
        olddata = theval;
        var textdatalv = parseInt(theval);
        if (textdatalv >= 5) {
          notificationMessage = 'Level change from ' + theval + ' to ' + olddata + ' test funni';
          TextAll(notificationMessage, globalSender); // Provide both arguments here
        }

        
        
        // if (textdatalv == 1) {
        //   notificationMessage = 'Level change from ' + textdatalv + ' to ' + olddata + ' เริ่มมีอันตราย โปรดระมัดระวังในการทำกิจกรรม';
        // } else if (textdatalv == 2) {
        //   notificationMessage = 'Level change from ' + textdatalv + ' to ' + olddata + ' อันตรายเพิ่มขึ้น โปรดระมัดระวังในการทำกิจกรรม';
        // } else if (textdatalv == 3) {
        //   notificationMessage = 'Level change from ' + textdatalv + ' to ' + olddata + ' อันตรายมากๆ โปรดเข้าที่ร่มหรือที่หลบพักเพื่อความโปรดภัยในชีวิต';
        // }
      }

      // Old code
      // const dataArray = data.split('\n').map((row) => row.split(','));
      

      // // Find the index of the "RiskLV" header
      // const RiskLvlIndex = headers.indexOf('RiskLV');

      // if (RiskLvlIndex === -1) {
      //   sendText(globalSender, 'Column RiskLV not found in Google Sheet for ' + DeviceNum);
      //   return;
      // }

      // const newData = dataArray[1].map((value) => value.replace(/"/g, ''));
      // const oldValue = newData;

      // if (newData[RiskLvlIndex] !== oldValue) {
      //   // Value in "RiskLV" column has changed
      //   const newValue = newData[RiskLvlIndex];
      //   const change = parseInt(newValue) - parseInt(oldValue);

      //   let notificationMessage = '';
        
      //   if (change === 1) {
      //     notificationMessage = 'Level change from ' + newValue + ' to ' + oldValue + ' เริ่มมีอันตราย โปรดระมัดระวังในการทำกิจกรรม';
      //   } else if (change === 2) {
      //     notificationMessage = 'Level change from ' + newValue + ' to ' + oldValue + ' อันตรายเพิ่มขึ้น โปรดระมัดระวังในการทำกิจกรรม';
      //   } else if (change === 3) {
      //     notificationMessage = 'Level change from ' + newValue + ' to ' + oldValue + ' อันตรายมากๆ โปรดเข้าที่ร่มหรือที่หลบพักเพื่อความโปรดภัยในชีวิต';
      //   }

      //   if (notificationMessage) {
      //     TextAll(notificationMessage, globalSender); // Provide both arguments here
      //   }
      // }
    })
  
    .catch((error) => {
      console.error(error);
      sendText(globalSender, 'Error retrieving data from Device ' + DeviceNum + '. Please try again later');
    });
}

function sendBroadcastToUser(userId, text) {
  console.log('Broadcast message sent successfully:',);
  const data = {
    messages: [
      {
        type: 'text',
        text: text,
      },
    ],
  };}


app.listen(app.get('port'), () => {
  console.log('Node app is running on port', app.get('port'));
  // Start checking for risk level changes initially
  CheckForRiskLvlChanges('Device1');
  CheckForRiskLvlChanges('Device2');
  CheckForRiskLvlChanges('Device3');
  // Add more devices as needed
});