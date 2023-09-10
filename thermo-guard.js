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
  encoding: 'utf8',
};

app.use(bodyParser.json());

app.set('port', process.env.PORT || 4000);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.post('/webhook', (req, res) => {
  var text = req.body.events[0].message.text.toLowerCase();
  var sender = req.body.events[0].source.userId;
  var replyToken = req.body.events[0].replyToken;
  console.log(text, sender, replyToken);
  console.log(typeof sender, typeof text);

  if (text === 'data1' || text === 'Data1' || text === 'data2' || text === 'Data2' || text === 'data3' || text === 'Data3') {
    // Determine the target ESP32 based on the received text
    var espDevice;
    if (text === 'data1' || text === 'Data1') {
      espDevice = 'esp32_1';
    } else if (text === 'data2' || text === 'Data2') {
      espDevice = 'esp32_2';
    } else {
      espDevice = 'esp32_3';
    }
    // Send the corresponding command to the MQTT topic
    var command = text === 'data1' || text === 'Data1' ? 'get_data' : text === 'data2' || text === 'Data2' ? 'on' : 'off';
    sendMqttCommand(sender, espDevice, command);
    //sendText(sender, 'Send a command to request data from ' + espDevice + '.....');
    sendText(sender, 'Data from ' + espDevice + 'Temp = 26C, Humidity = 50%, UV index = 0.5, PM2.5 = 10, HeatStoke level = safe');
  } 
  else if (text === 'website' || text === 'Website') {
    // Help
    sendText(sender, 'Here this is our website: http://thermoguard.spaceac.net/');
  }
  else {
    // Other
    sendText(sender, 'Please use the menu command or "data1," "data2," or "data3" command to control the ESP32 devices. For more info please visit http://thermoguard.spaceac.net/');
  }

  res.sendStatus(200);
});

function sendText(sender, text) {
  let data = {
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
    function (err, res, body) {
      if (err) console.log('error');
      if (res) console.log('success');
      if (body) console.log(body);
    }
  );
}

function sendMqttCommand(sender, espDevice, command) {
  // Create an MQTT client and connect to the broker
  var client = mqtt.connect(mqtt_host, options);

  // Subscribe to the MQTT topic where ESP32 sends responses
  client.on('connect', function () {
    console.log('MQTT connected');
    client.subscribe('/ESP32/response', function (err) {
      if (!err) {
        console.log('Subscribed to /ESP32/response');
      }
    });
  });

  // Handle incoming MQTT responses
  client.on('message', function (topic, message) {
    // Check if the topic is the one where the response is expected
    if (topic === '/ESP32/response') {
      // Send the received response as a message to the LINE user
      let data = {
        to: sender,
        messages: [
          {
            type: 'text',
            text: 'Received response from ' + espDevice + ': ' + message.toString(),
          },
        ],
      };

      // Send the message to the user via the LINE API
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
        function (err, res, body) {
          if (err) console.log('error');
          if (res) console.log('success');
          if (body) console.log(body);
        }
      );

      // Disconnect the MQTT client after receiving the response
      client.end();
    }
  });

  // Publish the command to the MQTT topic
  client.publish(mqtt_topic + '/' + espDevice, command, function () {
    console.log("Command sent to " + espDevice + ": " + command);
  });
}

app.listen(app.get('port'), function () {
  console.log('run at port', app.get('port'));
});
