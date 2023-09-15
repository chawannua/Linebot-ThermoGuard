const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const fetch = require('node-fetch'); // Import the fetch module
const app = express();

// Your Channel access token (long-lived)
const CH_ACCESS_TOKEN = '7nntV9CadnWw54gO9B+lAJTF1Ap4RF5lCJatqOLRrzHZO0wrSewxnSh8bV9kJSHf0xuwIPW5gw+08gH3W3nVK6KuDW9AB6ctP5SxleybdphHk4klApt8z68dp2OXcliJ27pXppy4Un4cx7j8DTXraAdB04t89/1O/w1cDnyilFU=
app.use(bodyParser.json());

app.set('port', process.env.PORT || 4000);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Initialize previousRiskLevel to 0
let previousRiskLevel = 0;

app.post('/webhook', (req, res) => {
  const text = req.body.events[0].message.text.toLowerCase();
  const sender = req.body.events[0].source.userId;
  const replyToken = req.body.events[0].replyToken;
  console.log('Received Line message:', text, 'from sender:', sender);

  if (text === 'system1' || text === 'system2' || text === 'system3') {
    const espDevice = 'Device' + text.charAt(text.length - 1);
    console.log('Received command:', text);
    sendText(sender, 'Sending a command to request data from ' + espDevice + '...');
    getDataFromGoogleSheet(espDevice, sender);

  } else if (text === 'website') {
    console.log('Received command: website');
    sendText(sender, 'Here is our website: http://thermoguard.spaceac.net/');
  } else {
    sendText(sender, 'Please use the menu command or "system1," "system2," or "system3" command to control the ESP32 devices. For more info, visit http://thermoguard.spaceac.net/');
  }
});

function getDataFromGoogleSheet(DeviceNum, sender) {
  const googleSheetURL = 'https://docs.google.com/spreadsheets/d/1MkCIXPtFRnHyluy9qfIZXl2MzLan5zm_2iAHLcF4b4A/gviz/tq?tqx=out:csv&sheet=' + DeviceNum;
  console.log(googleSheetURL);
  fetch(googleSheetURL)
    .then((response) => response.text())
    .then((data) => {
      const dataArray = data.split('\n').map((row) => row.split(','));
      var responseText = "";

      for (let rowIndex = 1; rowIndex < dataArray.length; rowIndex++) {
        const row = dataArray[rowIndex];
        if (row.length >= 10) {
          const riskLevel = parseFloat(row[9].replace(/"/g, '')); // Index 9 represents the 10th column (0-based index)

          if (riskLevel > 2 && riskLevel > previousRiskLevel) {
            responseText += `Risk Level increased from ${previousRiskLevel} to ${riskLevel}\n`;
            previousRiskLevel = riskLevel;
          }
        }
      }

      if (responseText !== "") {
        sendText(sender, responseText);
      }
    })
    .catch((error) => {
      console.error(error);
      sendText(sender, 'Error retrieving data from Device ' + DeviceNum + '. Please try again later');
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

app.listen(app.get('port'), () => {
  console.log('Node app is running on port', app.get('port'));
});
