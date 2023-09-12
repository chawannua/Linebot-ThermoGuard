const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const app = express();


// Your Channel access token (long-lived)
const CH_ACCESS_TOKEN = '7nntV9CadnWw54gO9B+lAJTF1Ap4RF5lCJatqOLRrzHZO0wrSewxnSh8bV9kJSHf0xuwIPW5gw+08gH3W3nVK6KuDW9AB6ctP5SxleybdphHk4klApt8z68dp2OXcliJ27pXppy4Un4cx7j8DTXraAdB04t89/1O/w1cDnyilFU=';



app.use(bodyParser.json());

app.set('port', process.env.PORT || 4000);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.post('/webhook', (req, res) => {
  const text = req.body.events[0].message.text.toLowerCase();
  const sender = req.body.events[0].source.userId;
  const replyToken = req.body.events[0].replyToken;
  console.log('Received Line message:', text, 'from sender:', sender);

  if (text === 'data1' || text === 'data2' || text === 'data3') {
    // Determine the target ESP32 based on the received text
    const espDevice = 'Device' + text.charAt(text.length - 1);
    // Send the corresponding command to the MQTT topic
    console.log('Received command:', text);
    sendText(sender, 'Sending a command to request data from ' + espDevice + '...');
    getDataFromGoogleSheet(espDevice, sender);

  } else if (text === 'website') {
    console.log('Received command: website');
    // Help
    sendText(sender, 'Here is our website: http://thermoguard.spaceac.net/');
  } else {
    // Other
    sendText(sender, 'Please use the menu command or "data1," "data2," or "data3" command to control the ESP32 devices. For more info, visit http://thermoguard.spaceac.net/');
  }

  res.sendStatus(200);
});

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


function getDataFromGoogleSheet(DeviceNum, sender) {
  const googleSheetURL = 'https://docs.google.com/spreadsheets/d/1MkCIXPtFRnHyluy9qfIZXl2MzLan5zm_2iAHLcF4b4A/gviz/tq?tqx=out:csv&sheet=' + DeviceNum;
  console.log(googleSheetURL);
  fetch(googleSheetURL)
    .then((response) => response.text())
    .then((data) => {
      const dataArray = data.split('\n').map((row) => row.split(','));
      const responseText = `Data for ${DeviceNum}/n`;
      for (let index = 0; index < dataArray[1].length; index++) {
        if (index >= 2) {
          responseText += dataArray[0][index] + " " + dataArray[1][index] + "\n";
        }
      }
      sendText(sender, responseText);
    })
    .catch((error) => {
      console.error(error);
      sendText(sender, 'Error retrieving data from Google Sheet');
    });
}

app.listen(app.get('port'), () => {
  console.log('Node app is running on port', app.get('port'));
});