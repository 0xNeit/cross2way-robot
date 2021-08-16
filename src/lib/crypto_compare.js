const axios = require('axios');
const log = require('./log');
const { fractionToDecimalString } = require('./utils');

const getData = async url => {
  try {
    const response = await axios.get(url);
    const data = response.data;
    return data;
  } catch (error) {
    if (typeof(error) === "string") {
      log.error(error);
    } else {
      log.error(JSON.stringify(error));
    }
  }
  return null;
}

// https://min-api.cryptocompare.com/data/pricemulti?fsyms=ETH,USDC,TUSD,GUSD,LINK,MKR,ZXC,EURS,USDT,WAN,BTC,EOS,UNI,SUSHI,XRP,ZCN,VIBE,LTC,AVAX,DOT,MATIC&tsyms=USD
async function getPrices(symbolsStr) {
  const symbols = symbolsStr.replace(/\s+/g,"").split(',');
  const priceMap = {};
  const data = await getData(`${process.env.CRYPTO_URL}fsyms=${symbolsStr}&tsyms=USD`);
  symbols.forEach(it => {
    if (data[it]) {
      // priceMap[it] = { price : data[it].USD, time: Date.now() };
      priceMap[it] = fractionToDecimalString(data[it].USD, process.env.PRICE_DECIMAL);
    } else {
      // priceMap[it] = null;
    }
  });
  log.info(JSON.stringify(priceMap));
  return priceMap;
}

module.exports = getPrices;

// {
// 	"BTC": {
// 		"USD": 23515.66
// 	},
// 	"USDC": {
// 		"USD": 0.9999
// 	},
// 	"TUSD": {
// 		"USD": 1.001
// 	}
// }
