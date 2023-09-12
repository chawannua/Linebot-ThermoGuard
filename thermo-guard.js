const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const app = express();
const mqtt = require('mqtt');

// Your Channel access token (long-lived)
const CH_ACCESS_TOKEN = 'YOUR_CHANNEL_ACCESS_TOKEN';

// MQTT Host
const mqtt_host = 'mqtt://driver.cloudmqtt.com';  // Use "mqtt://" for regular MQTT connections

// MQTT Config
const options = {
  port: 18772,
  host: 'driver.cloudmqtt.com',
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
  const text = req.body.events[0].message.text.toLowerCase();
  const sender = req.body.events[0].source.userId;
  const replyToken = req.body.events[0].replyToken;
  console.log('Received Line message:', text, 'from sender:', sender);

  if (text === 'data1' || text === 'data2' || text === 'data3') {
    // Determine the target ESP32 based on the received text
    const espDevice = 'esp32_' + text.charAt(text.length - 1);
    // Send the corresponding command to the MQTT topic
    const command = 'get_data'; // Assuming "get_data" for all data requests
    sendMqttCommand(sender, espDevice, command);
    console.log('Received command:', text);
    sendText(sender, 'Sending a command to request data from ' + espDevice + '...');
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

function sendMqttCommand(sender, espDevice, command) {
  // Create an MQTT client and connect to the broker
  const client = mqtt.connect(mqtt_host, options);

  // Handle MQTT connection errors
  client.on('error', (err) => {
    console.error('MQTT error:', err);
  });

  // Handle MQTT connection success
  client.on('connect', () => {
    console.log('MQTT connected');
    // MQTT Topic
    const mqtt_topics = '/ESP32/' + espDevice;
    const mqtt_topicr = '/ESP32/response' + espDevice;
    // Publish the command to the MQTT topic
    client.publish(mqtt_topics, command, () => {
      console.log('Command sent to ' + espDevice + ': ' + command);
      // After sending the command, you can disconnect the MQTT client
      client.end();
    });
  });
}

app.listen(app.get('port'), () => {
  console.log('Node app is running on port', app.get('port'));
});
