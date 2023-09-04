try:
    import requests
    from flask import Flask, request, abort
    from linebot import LineBotApi, WebhookHandler
    from linebot.exceptions import InvalidSignatureError
    from linebot.models import MessageEvent, TextMessage, TextSendMessage

    # Replace with your own values
    LINE_CHANNEL_SECRET = '22550507fb118de47cd3d0fa8153bbe6'
    LINE_CHANNEL_ACCESS_TOKEN = '7nntV9CadnWw54gO9B+lAJTF1Ap4RF5lCJatqOLRrzHZO0wrSewxnSh8bV9kJSHf0xuwIPW5gw+08gH3W3nVK6KuDW9AB6ctP5SxleybdphHk4klApt8z68dp2OXcliJ27pXppy4Un4cx7j8DTXraAdB04t89/1O/w1cDnyilFU='

    line_bot_api = LineBotApi(LINE_CHANNEL_ACCESS_TOKEN)
    handler = WebhookHandler(LINE_CHANNEL_SECRET)

    app = Flask(__name__)

    @app.route("/callback", methods=['POST'])
    def callback():
        signature = request.headers['X-Line-Sipip freeze > requirements.txtgnature']
        body = request.get_data(as_text=True)
        try:
            handler.handle(body, signature)
        except InvalidSignatureError:
            abort(400)
        return 'OK'

    @handler.add(MessageEvent, message=TextMessage)
    def handle_message(event):
        if event.message.text == ("info","Info"):
            # Replace with the URL of your ESP32 endpoint
            esp32_url = "http://esp32_ip_address/data"
            
            try:
                response = requests.get(esp32_url)
                data = response.json()
                temperature = data["temperature"]
                humidity = data["humidity"]
                #reply_message = f"Temperature: {temperature}°C, Humidity: {humidity}%"  ///Test reply message without esp32
                reply_message = f"Temperature: 22°C, Humidity: 44%"
            except Exception as e:
                reply_message = "Error fetching data from ESP32."

            line_bot_api.reply_message(
                event.reply_token,
                TextSendMessage(text=reply_message)
            )

    if __name__ == "__main__":
        app.run()
except Exception as e:
    2023-09-04T16:40:13.239598+00:00 heroku[web.1]: State changed from starting to crashed
    2023-09-04T16:40:15.977837+00:00 heroku[router]: at=error code=H10 desc="App crashed" method=GET path="/" host=thermo-guard-3d215e420130.herokuapp.com request_id=8724bdc4-e164-488e-9d6b-f03abd586223 fwd="171.96.190.101" dyno= connect= service= status=503 bytes= protocol=https
    2023-09-04T16:40:16.858392+00:00 heroku[router]: at=error code=H10 desc="App crashed" method=GET path="/favicon.ico" host=thermo-guard-3d215e420130.herokuapp.com request_id=04e00faa-d358-4d98-acf0-c04e50cc1e70 fwd="171.96.190.101" dyno= connect= service= status=503 bytes= protocol=https protocol=
    print(f"An error occurred: {str(e)}")