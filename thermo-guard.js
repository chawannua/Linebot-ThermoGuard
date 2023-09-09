var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');
var app = express();
var mqtt = require('mqtt');

// Your Channel access token (long-lived)
const CH_ACCESS_TOKEN = '7nntV9CadnWw54gO9B+lAJTF1Ap4RF5lCJatqOLRrzHZO0wrSewxnSh8bV9kJSHf0xuwIPW5gw+08gH3W3nVK6KuDW9AB6ctP5SxleybdphHk4klApt8z68dp2OXcliJ27pXppy4Un4cx7j8DTXraAdB04t89/1O/w1cDnyilFU=';

// MQTT Host
var mqtt_host = 'mqtt://m15.cloudmqtt.com';

// MQTT Topic
var mqtt_topic = '/ESP32';

// MQTT Config
var options = {
    port: 18772,
    host: 'mqtt://m15.cloudmqtt.com',
    clientId: 'mqttjs_' + Math.random().toString(16).substr(2, 8),
    username: 'wfcsvmqa',
    password: 'IqpnVbyPDHqi',
    keepalive: 60,
    reconnectPeriod: 1000,
    protocolId: 'MQIsdp',
    protocolVersion: 3,
    clean: true,
    encoding: 'utf8'
};

app.use(bodyParser.json());

app.set('port', (process.env.PORT || 4000));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.post('/webhook', (req, res) => {
  var text = req.body.events[0].message.text.toLowerCase();
  var sender = req.body.events[0].source.userId;
  var replyToken = req.body.events[0].replyToken;
  console.log(text, sender, replyToken);

  if (text === 'info1' || text === 'Info1') {
    // Info
    inFo1(sender, text);
  } else if (text === 'info2' || text === 'Info2') {
    // LED On
    inFo2(sender, text);
  } else if (text === 'info3' || text === 'Info3') {
    // LED Off
    inFo3(sender, text);
  } else if (text === 'get_data' || text === 'GetData') {
    // Request data from ESP32
    requestData(sender, text);
  } else {
    // Other
    sendText(sender, text);
  }

  res.sendStatus(200);
});

function requestData(sender, text) {
  // Publish a "get_data" command to the MQTT topic.
  var client = mqtt.connect(mqtt_host, options);
  client.on('connect', function () {
    console.log('MQTT connected');
    // Publish a "get_data" command.
    client.publish(mqtt_topic, 'get_data', function () {
      console.log("Request for data sent");
      client.end();
    });
  });

  // Send a message to the user indicating that data is being requested.
  let data = {
    to: sender,
    messages: [
      {
        type: 'text',
        text: 'Requesting data from ESP32...'
      }
    ]
  };

  request({
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + CH_ACCESS_TOKEN
    },
    url: 'https://api.line.me/v2/bot/message/push',
    method: 'POST',
    body: data,
    json: true
  }, function (err, res, body) {
    if (err) console.log('error');
    if (res) console.log('success');
    if (body) console.log(body);
  });
}

// Define your other functions (inFo1, inFo2, inFo3, sendText) here as before.

app.listen(app.get('port'), function () {
  console.log('run at port', app.get('port'))
});
