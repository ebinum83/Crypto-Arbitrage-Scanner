console.log("Loaded");
let mainVue = new Vue({
    el: "#mainVue",
    data: {
        checkedNames: [],
        tableEntries: [],
        info: "Info",
        errors: "",
        ws: new WebSocket("ws://localhost:8081"),
        errorTimeout: {_destroyed: true}
    },
    methods: {
        startProcess: function () {
            console.log("Running");
            this.checkedNames = [];
            let tempChecked = $.makeArray($(".centerTable").find('input[type="checkbox"]:checked'));
            for (let checked in tempChecked){
                this.checkedNames.push($(tempChecked[checked]).attr("id"));
            }
            if (this.checkedNames.length<2 || this.checkedNames.length>4){
                alert("Please select only 2 to 4 items");
            } else {
                $("#subtitleSelect").toggleClass("d-none");
                $("#reloadPage").toggleClass("d-none");
                $("#stopProcess").toggleClass("d-none");
                $("#exchange-selector-container").hide();
                $("#logs").toggleClass("d-none");
                $("#symbolsTable").toggleClass("d-none");
                this.ws.send(JSON.stringify({"exec": "init","names": this.checkedNames}));
                let dNow = new Date();
                $("#tableHeading").text((dNow.getMonth()+1) + '/' + dNow.getDate() + '/' + dNow.getFullYear() + ' ' + dNow.getHours() + ':' + dNow.getMinutes());
                let updateInfo = this.updateInfo;
                let updateErrors = this.updateError;
                this.ws.onmessage = (data) => {
                    let parsedData = JSON.parse(data.data);
                    switch (parsedData.exec) {
                        case "info":
                            updateInfo(parsedData.data, null);
                            break;
                        case "newExchange":
                            updateInfo(Object.values(parsedData.data).join(", "), parsedData.data);
                            break;
                        case "error":
                            updateErrors(parsedData.data);
                    }
                };
            }
        },
        updateInfo: function(data, symbols){
            if ($(".info").hasClass("d-none")){
                $(".info").toggleClass("d-none");
            }
            this.info = data;
            if (symbols){
                let newTable = $('<table class="col-10 offset-1 pd-y-t-25 symbolsTable"> <tr> <th>Symbol</th> <th>Exchange to buy</th> <th>Exchange to sell</th> <th>Potential profit, %</th> </tr> </table>');
                let tableHeading = $('<h5 class="text-center col-4 offset-4" class="tableHeading"></h5> ');
                let dNow = new Date();
                tableHeading.text((dNow.getMonth()+1) + '/' + dNow.getDate() + '/' + dNow.getFullYear() + ' ' + dNow.getHours() + ':' + dNow.getMinutes());
                if (symbols.length){
                    for (let symbol in symbols){
                        if (symbols[symbol].length) symbol = JSON.parse(symbols[symbol]);
                        if (!symbol.symbol) return;
                        newTable.append("<tr><td>" + symbol.symbol + "</td><td>" + symbol.buy + "</td><td>" + symbol.sell + "</td><td>" + symbol.profit+"</td></tr>");
                    }

                } else {
                    if (!symbols.symbol) return;
                    newTable.append("<tr><td>" + symbols.symbol + "</td><td>" + symbols.buy + "</td><td>" + symbols.sell + "</td><td>" + symbols.profit+"</td></tr>");
                }
                $("#sybolsTableContainer").append(tableHeading);
                $("#sybolsTableContainer").append(newTable);
            } else {
                $(".info").html(this.info);
            }        },
        updateError: function(data){
            this.errors = data;
            if ($(".errors").hasClass("d-none")){
                $(".errors").toggleClass("d-none");
                // this.errorTimeout = setTimeout();
                // if (this.errorTimeout._destroyed){
                //
                // }
            }
            $(".errors").html(this.errors);
        },
        reloadPage: function(){
            this.ws.close();
            location.reload(true);
        },
        stopEverything: function () {
            this.ws.send(JSON.stringify({"exec": "stop"}));
            this.ws.close();
            close();
        }
    }
});
