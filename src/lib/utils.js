const Web3 = require('web3');
const web3 = new Web3();
const wanUtil = require('wanchainjs-util');

// TODO: delete chainIds
const chainIds = {
    ETH: 0x8000003c,
    WAN: 0x8057414e,
    BTC: 0x80000000,
    ETC: 0x8000003d,
    EOS: 0x800000c2,
    XRP: 0x80000090,
    BSC: 0x800002ca,
    LTC: 0x80000002,
    DOT: 0x80000162,
    AVAX: 0x80002328,
    [process.env.CHAINTYPE_DEV]: parseInt(process.env.BIP44_DEV),
}

function privateToAddress(sk) {
    return '0x' + wanUtil.privateToAddress(Buffer.from(sk, 'hex')).toString('hex');
}

function sleep(ms) {
	return new Promise(function (resolve, reject) {
		setTimeout(function () {
			resolve();
		}, ms);
	})
};

// const sleep = (ms) => { return new Promise(resolve => setTimeout(resolve, ms)) };

function promisify(func, paras=[], obj=null){
  return new Promise(function(success, fail){
      function _cb(err, result){
          if(err){
              fail(err);
          } else {
              success(result);
          }
      }
      paras.push(_cb);
      func.apply(obj, paras);
  });
}

function promiseEvent(func, paras=[], obj=null, event){
  return new Promise(function(success, fail){
      let res = func.apply(obj, paras);
      obj.on(event, function _cb(err){
          if(err){
              fail(err);
          } else {
              success(res);
          }
      })
  });
}

function fractionRatioToDecimalString(priceRaw, price_decimal, ratio) {
    const ratioPrice = fractionToDecimalString(priceRaw, price_decimal)
    const ratio_price = web3.utils.toBN(ratioPrice)
    const ratio_p = web3.utils.toBN(ratio)
    const price = web3.utils.toBN(ratioPrice).mul(web3.utils.toBN(ratio)).div(web3.utils.toBN(Math.pow(10, price_decimal)))
    return '0x' + price.toString('hex')
}

function fractionToDecimalString(priceRaw, _price_decimal) {
    const price_decimal = parseInt(_price_decimal);
    let decimal = 0;

    const priceRawSplit = (priceRaw + "").split('.');
    let priceStr = priceRawSplit[0];
    if (priceRawSplit.length > 1) {
        decimal = priceRawSplit[1].length;
        if (decimal > price_decimal) {
            // throw new Error(`${it} decimal > ${price_decimal}, price = ${symbolPriceMap[it]}`);
            decimal = price_decimal
            priceStr += priceRawSplit[1].substr(0, decimal);
        } else {
            priceStr += priceRawSplit[1];
        }
    }
    const price = web3.utils.toBN(priceStr);

    return '0x' + price.mul(web3.utils.toBN(Math.pow(10, price_decimal - decimal))).toString('hex');
}

function formatToFraction(oldDecimalString) {
    const padPrice = web3.utils.padLeft(oldDecimalString, 19, '0');
    return padPrice.substr(0, padPrice.length - 18)+ '.'+ padPrice.substr(padPrice.length - 18, 18);
}

module.exports = {
  sleep,
  promisify,
  promiseEvent,
  fractionToDecimalString,
  fractionRatioToDecimalString,
  web3,
  chainIds,
  privateToAddress,
  formatToFraction
}
