"use strict";

const ccxt = require("ccxt");
const log = require('ololog').configure({locate: false});
require('ansicolor').nice;

//const  exchangesNames = ["binance","huobipro","cryptopia","qryptos","cex", "poloniex"]

const diffTreshold = 0.25;
const diffUpperTreshold = 100;

let exchangesNames = [];

module.exports.getPrices = async function (ws, SymbolsObj) {
    //-----------------------------------------------------------------------------

    process.on('uncaughtException', e => {
        log.bright.red.error(e);
        ws.send(JSON.stringify({"exec": "error", "data": e}));
    });
    process.on('unhandledRejection', e => {
        log.bright.red.error(e);
        ws.send(JSON.stringify({"exec": "error", "data": e}));
    });

    //-----------------------------------------------------------------------------
    let singleSymbStorage = [], results = [];
    let priceObj = {}, ticker = {}, result = null;
    for (let e of SymbolsObj) {
        for (let exchangeId of e.ex) {
            const exchange = new ccxt[exchangeId]({enableRateLimit: true});
            try {
                ticker = await exchange.fetchTicker(e.symbol);
            }
            catch (e) {
//                throw e;
                continue;
            }
            if (ticker.bid && ticker.ask) {
                priceObj = {
                    ex: exchangeId,
                    symbol: ticker.symbol,
                    price: ticker.last,
                    bid: ticker.bid,
                    ask: ticker.ask
                };
                singleSymbStorage.push(priceObj);
                log("symbol: ", priceObj.symbol.green, "exchange:", priceObj.ex.green, "price:", priceObj.price, "ask:", priceObj.ask, "bid:", priceObj.bid);
                ws.send(JSON.stringify({
                    "exec": "info",
                    "data": "symbol: " + priceObj.symbol + " exchange: " + priceObj.ex + " price: " + priceObj.price + " ask: " + priceObj.ask + " bid: " + priceObj.bid
                }));

                if (singleSymbStorage.length > 2) {
                    let counts = singleSymbStorage.reduce(function (collector, item) {
                        if (collector[item.symbol]) {
                            collector[item.symbol] += 1;
                        } else {
                            collector[item.symbol] = 1;
                        }
                        return collector;
                    }, {});

                    singleSymbStorage = singleSymbStorage.filter(function (value) {
                        if (counts[value.symbol] >= 2) {
                            return true;
                        } else {
                            return false;
                        }
                    });
                }
            }
        }

        if ((singleSymbStorage.length == 2) && (singleSymbStorage[0].symbol == singleSymbStorage[1].symbol)) { // we got a pair of symbols
            //now we have to compare each ask and bid diff
            let exToBuy = {}, exToSell = {};
            let line, percentDiff;
            let flag = false;
            if (singleSymbStorage[0].ask < singleSymbStorage[1].bid) {
                exToSell = singleSymbStorage[1];
                exToBuy = singleSymbStorage[0];
                flag = true
            }
            if (singleSymbStorage[1].ask < singleSymbStorage[0].bid) {
                exToSell = singleSymbStorage[0];
                exToBuy = singleSymbStorage[1];
                flag = true
            }
            if (flag) {
                percentDiff = ((exToSell.bid - exToBuy.ask) * 100 / exToBuy.ask).toFixed(2);
                line = exToSell.symbol + ',' + exToSell.ex + ' ' + exToSell.bid + ',' + exToBuy.ex + ' ' + exToBuy.ask + ',' + percentDiff;
                log.red(line);
                if ((percentDiff > diffTreshold) && (percentDiff < diffUpperTreshold)) {
                    result = {
                        symbol: exToSell.symbol,
                        sell: exToSell.ex + ' @ ' + exToSell.bid,
                        buy: exToBuy.ex + ' @ ' + exToBuy.ask,
                        profit: percentDiff
                    }
                }
                if (result) {
                    results.push(JSON.stringify(result));
                }
            }
            singleSymbStorage = [];
        }
    }
    //remove duplicates
		results = results.reduce((r, i) =>
			!r.some(j => !Object.keys(i).some(k => i[k] !== j[k])) ? [...r, i] : r, []);
    return results;
};


module.exports.loadMyExchanges = async function (ws, ids) {
    console.log("Loading Exchanges");
    try {
        ws.send(JSON.stringify({"exec": "info", "data": "Loading Exchanges"}));
    } catch(e){}
    let exchanges = {};
    if (!ids) ids = [];
    // load all markets from all exchanges
    for (let id of ids) {
        // instantiate the exchange by id
        let exchange = null;
        try {
            exchange = new ccxt[id]();
        } catch (e) {
            log({error: e});
            ws.send(JSON.stringify({"exec": "error", "data": "Sorry, internal error. Start again with diffrent exchanges."}));
            return;
        }
        // save it in a dictionary under its id for future use
        exchanges[id] = exchange;
        // load all markets from the exchange
        try {
            let markets = await exchange.loadMarkets()
//            if (exchange.symbols.length < minNumOfMarkets) continue;
        } catch (e) {
            if (e instanceof ccxt.DDoSProtection) {
                log.bright.yellow(exchange.id, '[DDoS Protection] ' + e.message);
                continue;
            } else if (e instanceof ccxt.RequestTimeout) {
                log.bright.yellow(exchange.id, '[Request Timeout] ' + e.message);
                continue;
            } else if (e instanceof ccxt.AuthenticationError) {
                log.bright.yellow(exchange.id, '[Authentication Error] ' + e.message);
                continue;
            } else if (e instanceof ccxt.ExchangeNotAvailable) {
                log.bright.yellow(exchange.id, '[Exchange Not Available] ' + e.message);
                continue;
            } else if (e instanceof ccxt.ExchangeError) {
                log.bright.yellow(exchange.id, '[Exchange Error] ' + e.message);
                continue;
            } else if (e instanceof ccxt.NetworkError) {
                log.bright.yellow(exchange.id, '[Network Error] ' + e.message);
                continue;
            } else {
                log.red({"error": e});
            }
        }
        try{
            log(id.green, 'loaded', exchange.symbols.length, 'markets (symbols)');
            ws.send(JSON.stringify({
                "exec": "info",
                "data": id + " loaded " + exchange.symbols.length + " markets (symbols)"
            }));
        } catch (e){
            log({"error": e});
            return;
        }
    }

    // get all unique symbols
    let uniqueSymbols = ccxt.unique(ccxt.flatten(ids.map(id => exchanges[id].symbols)));
    // filter out symbols that are not present on at least two exchanges
    let arbitrableSymbols = null;
    try {
        arbitrableSymbols = uniqueSymbols
            .filter(symbol =>
            ids.filter(id =>
                (exchanges[id].symbols.indexOf(symbol) >= 0)).length > 1)
            .sort((id1, id2) => (id1 > id2) ? 1 : ((id2 > id1) ? -1 : 0));
    } catch (e) {
        ws.send(JSON.stringify({"exec": "error", "data": "Error getting symbols..."}))

    }

    let symbs = null;
    try {
        symbs = arbitrableSymbols.map(symbol => {
            let ex = [];
            let row = {symbol, ex};
            for (let id of ids)
                if (exchanges[id].symbols.indexOf(symbol) >= 0)
                    ex.push(id);
            return row
        });
        log('Loading exchanges...');
        ws.send(JSON.stringify({"exec": "info", "data": "Loading exchanges..."}));
    } catch (e) {
        log({"error": e});
        return;
    }
    return symbs;

};
module.exports.getPairs = function (names) {
    const n = names.length;
    let i, j;
    let arrOfPairs = [];
    for (i = 0; i < n; i++) {
        for (j = i + 1; j < n; j++) {
            arrOfPairs.push([names[i], names[j]])
        }
    }
    return arrOfPairs;
}
module.exports.main = async function (ws, ids, iterNum) {
    let sleepinterval = 300; //5 min
    let results = [];
    let pairsOfExchanges = await module.exports.getPairs(ids);
    for (let ids of pairsOfExchanges) {
        let mySymbolsObj = await module.exports.loadMyExchanges(ws, ids);
        try {
            if (mySymbolsObj.length < 1) {
                log("Sorry, exchanges " + ids[0] + " and " + ids[1] + " don't have common pairs. Click the button above to choose other exchanges.");
                ws.send(JSON.stringify({
                    "exec": "error",
                    "data": "Sorry, exchanges " + ids[0] + " and " + ids[1] + " don't have common pairs. Click the button above to choose other exchanges."
                }));
            } else {
                log("Got", mySymbolsObj.length, "common symbols that are traded at these exchanges. Please be patient, getting data for each pair...");
                ws.send(JSON.stringify({
                    "exec": "info",
                    "data": "Got " + mySymbolsObj.length + " common symbols that are traded at these exchanges. Please be patient, getting data for each pair..."
                }));
                try {
                    results = await module.exports.getPrices(ws, mySymbolsObj);
                    if (results === undefined || results.length == 0) {
                        log("Sorry there are no arbitrage opportunities on " + ids[0] + " and " + ids[1] + " at this time. Try again later.");
                        ws.send(JSON.stringify({
                            "exec": "error",
                            "data": "Sorry there are no arbitrage opportunities on " + ids[0] + " and " + ids[1] + " at this time. Try again later."
                        }))
                    }
                    else {
                        ws.send(JSON.stringify({"exec": "newExchange", "data": results}));
                    }

                } catch (e) {
                    log({error: e});
                    return;
                }
            }
        } catch(e){
            log({"error": e});
            if (ws.readyState ===1){
                ws.send(JSON.stringify({
                    "exec": "error",
                    "data": "An unknown error has occurred, please check the server logs"
                }));
            }
            return;
        }
    }
    let datestring = Date() + ". Going to sleep for "+ sleepinterval +" seconds";
    log(datestring);
    ws.send(JSON.stringify({"exec": "info", "data": datestring}));
    setTimeout(() => {
        module.exports.main(ws, ids, iterNum-1);
    }, sleepinterval * 1000); // sleep for n seconds
};
