const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const opn = require("opn");
require('ansicolor').nice;

const PORT = 8080;
const WSS_PORT = 8081;

let cryptFunctions = require('./cryptFunctions');

let index = require('./routes/index');

let app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', index);

let wss = new WebSocket.Server({
    port: WSS_PORT,
});

wss.on("connection", (ws) => {
    ws.on("open", () => {
        console.log("Opened");
    });

    ws.on("message", (data) => {
        let parsedData = JSON.parse(data);
        switch (parsedData.exec){
            case 'init':
                try {
                    cryptFunctions.main(ws, parsedData.names, 24);
                } catch (e){
                    console.log(e);
                }
                break;
            case "stop":
                console.log("Closing...");
                process.exit(0);
                break;
        }
    });

    ws.on("close", () => {
        console.log(("If you closed the site, please navigate to http://localhost:"+PORT+" to access it again, or press ctrl+c to stop the program").blue);
    });

    ws.on('error', () => {});
});


app.listen(PORT, () => {
    ("http://localhost:" + PORT);
});
