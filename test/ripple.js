const RippleAPI = require('ripple-lib').RippleAPI;
const api = new RippleAPI({
    server: 'wss://s1.ripple.com' // 公共Ripple节点服务器，可本地搭建节点
});
const myAddress = 'r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59';
api.on('error', (errorCode, errorMessage) => {
    console.log(errorCode + ': ' + errorMessage);
});
api.on('connected', () => {
    console.log('connected');
});
api.on('disconnected', (code) => {
    //当连接关闭后，服务器端发送的代码
    console.log('disconnected, code:', code);
});
api.connect().then(() => {
    /* 自定义代码开始 */
    return api.getFee().then(fee => {console.log("----------交易费用----------"); console.log(fee);});
}).then(() => {
    return api.getAccountInfo(myAddress).then(info => {console.log("----------账户信息----------"); console.log(info);});
}).then(() => { //准备交易
    const payment = {       //付款对象
      "source": {
        "address": "r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59",
        "maxAmount": {
          "value": "0.01",
          "currency": "USD",
          "counterparty": "rMH4UxPrbuMa1spCBR98hLLyNJp4d8p4tM"
        }
      },
      "destination": {
        "address": "rpZc4mVfWUif9CRoHRKKcmhu1nx2xktxBo",
        "amount": {
          "value": "0.01",
          "currency": "USD",
          "counterparty": "rMH4UxPrbuMa1spCBR98hLLyNJp4d8p4tM"
        }
      }
    };
    return api.preparePayment(myAddress, payment)
        .then(prepared => {
            console.log("----------payment交易准备----------");
            console.log(prepared);
        });
}).then(() => { //交易签名
    const txJSON = '{"Flags":2147483648,"TransactionType":"AccountSet","Account":"r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59","Domain":"726970706C652E636F6D","LastLedgerSequence":8820051,"Fee":"12","Sequence":23}';
    const secret = 'shsWGZcmZz6YsWWmcnpfr6fLTdtFV';
    var res = api.sign(txJSON, secret);     //or: api.sign(txJSON, keypair);
    console.log("----------交易签名结果----------");
    console.log(res);
    return res;
}).then(() => { //交易提交
    const signedTransaction = '12000322800000002400000017201B0086955368400000000000000C732102F89EAEC7667B30F33D0687BBA86C3FE2A08CCA40A9186C5BDE2DAA6FA97A37D874473045022100BDE09A1F6670403F341C21A77CF35BA47E45CDE974096E1AA5FC39811D8269E702203D60291B9A27F1DCABA9CF5DED307B4F23223E0B6F156991DB601DFB9C41CE1C770A726970706C652E636F6D81145E7B112523F68D2F5E879DB4EAC51C6698A69304';
    return api.submit(signedTransaction).then(result => {
        console.log("----------提交结果----------");
        console.log(result);
    });
}).then(() => { //交易验证
    const id = '01CDEAA89BF99D97DFD47F79A0477E1DCC0989D39F70E8AACBFE68CC83BD1E94';
    return api.getTransaction(id).then(transaction => {
        console.log("----------交易验证结果----------");
        console.log(transaction);
    });
    /* 自定义代码结束 */
}).then(() => {
    return api.disconnect();
}).catch(console.error);