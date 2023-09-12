var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');
var app = express();

var mqtt = require('mqtt');

// Your Channel access token (long-lived)
const CH_ACCESS_TOKEN = '7nntV9CadnWw54gO9B+lAJTF1Ap4RF5lCJatqOLRrzHZO0wrSewxnSh8bV9kJSHf0xuwIPW5gw+08gH3W3nVK6KuDW9AB6ctP5SxleybdphHk4klApt8z68dp2OXcliJ27pXppy4Un4cx7j8DTXraAdB04t89/1O/w1cDnyilFU=';

// MQTT Host
var mqtt_host = 'mqtt://driver.cloudmqtt.com';

// MQTT Topic
var mqtt_topic = '/ESP32';

// MQTT Config
var options = {
    port: 18772,
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

// Set up MQTT client
var client = mqtt.connect(mqtt_host, options);

// Handle MQTT client connection events
client.on('connect', function() {
    console.log('MQTT connected');
    // Subscribe to the MQTT topic
    client.subscribe(mqtt_topic, function(err) {
        if (err) {
            console.error('MQTT subscription failed:', err);
        } else {
            console.log('Subscribed to MQTT topic:', mqtt_topic);
        }
    });
});

client.on('message', function(topic, message) {
    console.log("Received '" + message.toString() + "' on '" + topic + "'");
    // Handle incoming MQTT messages here
    // You can send Line messages here as well
    // Example:
    sendLineMessage(sender, message.toString());
});

// Middleware to parse JSON requests
app.use(bodyParser.json());

// Set the port for the Express.js app
app.set('port', (process.env.PORT || 4000));

// Handle incoming Line messages
app.post('/webhook', function(req, res) {
    var text = req.body.events[0].message.text.toLowerCase();
    var sender = req.body.events[0].source.userId;
    var replyToken = req.body.events[0].replyToken;
    
    console.log(text, sender, replyToken);
    console.log(typeof sender, typeof text);

    if (text === 'info' || text === 'รายงาน') {
        // Info
        inFo(sender, text);
    } else if (text === '1' || text === 'เปิด' || text === 'on') {
        // LED On
        ledOn(sender, text);
    } else if (text === '0' || text === 'ปิด' || text === 'off') {
        // LED Off
        ledOff(sender, text);
    } else {
        // Other
        sendText(sender, text);
    }

    res.sendStatus(200);
});

function sendText(sender, text) {
    let data = {
        to: sender,
        messages: [
            {
                type: 'text',
                text: 'กรุณาพิมพ์ : info | on | off | เปิด | ปิด เท่านั้น'
            }
        ]
    };
    
    sendLineMessage(data);
}

function inFo(sender, text) {
    let data = {
        to: sender,
        messages: [
            {
                type: 'text',
                text: 'uid: ' + sender
            }
        ]
    };
    
    sendLineMessage(data);
}

function ledOn(sender, text) {
  // Publish an MQTT message to turn on the LED
  client.publish(mqtt_topic, 'on');
  
  let data = {
      to: sender,
      messages: [
          {
              type: 'text',
              text: 'LED ON'
          }
      ]
  };
  
  sendLineMessage(sender, data); // Pass the sender variable to sendLineMessage
}


// ...

function ledOff(sender, text) {
  // Publish an MQTT message to turn off the LED
  client.publish(mqtt_topic, 'off');
  
  let data = {
      to: sender,
      messages: [
          {
              type: 'text',
              text: 'LED OFF'
          }
      ]
  };
  
  sendLineMessage(sender, data); // Pass the sender variable to sendLineMessage
}

// ...



function sendLineMessage(messageData) {
    request({
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + CH_ACCESS_TOKEN
        },
        url: 'https://api.line.me/v2/bot/message/push',
        method: 'POST',
        body: messageData,
        json: true
    }, function (err, res, body) {
        if (err) {
            console.error('Error sending Line message:', err);
        } else {
            console.log('Line message sent:', body);
        }
    });
}

// Start the Express.js server
app.listen(app.get('port'), function () {
    console.log('App is running on port', app.get('port'));
});
