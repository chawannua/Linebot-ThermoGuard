const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const fetch = require('node-fetch');
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

  if (text === 'data1') {
    handleData1(sender);
  } else if (text === 'data2') {
    handleData2(sender);
  } else if (text === 'data3') {
    handleData3(sender);
  } else if (text === 'website') {
    handleWebsite(sender);
  } else {
    handleOther(sender);
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

function handleData1(sender) {
  const DeviceNum = 'Device1'; // Customize for 'data1'
  getDataFromGoogleSheet(DeviceNum, sender);
}

function handleData2(sender) {
  const DeviceNum = 'Device2'; // Customize for 'data2'
  getDataFromGoogleSheet(DeviceNum, sender);
}

function handleData3(sender) {
  const DeviceNum = 'Device3'; // Customize for 'data3'
  getDataFromGoogleSheet(DeviceNum, sender);
}

function handleWebsite(sender) {
  console.log('Received command: website');
  sendText(sender, 'Here is our website: http://thermoguard.spaceac.net/');
}

function handleOther(sender) {
  sendText(sender, 'Please use the menu command or "data1," "data2," or "data3" command to retrieve data. For more info, visit http://thermoguard.spaceac.net/');
}

function getDataFromGoogleSheet(DeviceNum, sender) {
  const googleSheetURL = 'https://docs.google.com/spreadsheets/d/1MkCIXPtFRnHyluy9qfIZXl2MzLan5zm_2iAHLcF4b4A/gviz/tq?tqx=out:csv&sheet=' + DeviceNum;
  console.log(googleSheetURL);

  fetch(googleSheetURL)
    .then((response) => response.text())
    .then((data) => {
      const dataArray = data.split('\n').map((row) => row.split(','));
      const responseText = `Data for ${DeviceNum}: ${dataArray[1][3].replace(/"/g, '')}`;
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
