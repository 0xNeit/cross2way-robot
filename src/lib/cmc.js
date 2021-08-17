const rp = require('request-promise');
const log = require('./log');
const { fractionToDecimalString } = require('./utils');

async function getPrices(symbolsStr) {
  const symbols = symbolsStr.replace(/\s+/g,"").split(',');

  const requestOptions = {
    method: 'GET',
    uri: process.env.CMC_QUOTES_URL,
    qs: {
      'symbol': symbolsStr,
      'aux': 'cmc_rank',
      'convert': 'USD'
    },
    headers: {
      'X-CMC_PRO_API_KEY': process.env.CMC_API
    },
    json: true,
    gzip: true
  };

  const response = await rp(requestOptions);

  const priceMap = {};
  if (response.status.error_code === 0) {
    const data = response.data;
    // const milliSeconds = new Date(data[it].quote.USD.last_updated).getTime();
    symbols.forEach(it => {
      // priceMap[it] = { 
      //   price : data[it].quote.USD.price,
      //   time: milliSeconds
      // }; 
      priceMap[it] = fractionToDecimalString(data[it].quote.USD.price, process.env.PRICE_DECIMAL);
    });
    log.info(JSON.stringify(priceMap));
  } else {
    throw new Error(response.error_message);
  }
  return priceMap;
}

// setTimeout(async () => {
//   // const data = await getIDs("https://api.coingecko.com/api/v3/coins/list", process.env.SYMBOLS_3RD);
//   const data = await getPrices(process.env.SYMBOLS_3RD)
//   console.log(JSON.stringify(data, null, 2))
// }, 0)

module.exports = getPrices;

// curl -H "X-CMC_PRO_API_KEY: 899c3d91-f0be-4351-80fc-21bac6f6ee40" -H "Accept: application/json" -d "symbol=BTC,USDC,TUSD,MKR,GUSD,ETH,SAI,LINK,LRC,ZXC,EURS,EOS,USDT,RVX,FNX,WAN&aux=cmc_rank&convert=USD" -G https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest
// {
//   "status":{
//       "timestamp":"2020-06-29T04:14:47.622Z",
//       "error_code":0,
//       "error_message":null,
//       "elapsed":14,
//       "credit_count":1,
//       "notice":null
//   },
//   "data":{
//       "BTC":{
//           "id":1,
//           "name":"Bitcoin",
//           "symbol":"BTC",
//           "slug":"bitcoin",
//           "cmc_rank":1,
//           "last_updated":"2020-06-29T04:13:35.000Z",
//           "quote":{
//               "USD":{
//                   "price":9107.9165014,
//                   "volume_24h":14708751971.5769,
//                   "percent_change_1h":-0.289599,
//                   "percent_change_24h":1.04698,
//                   "percent_change_7d":-2.73841,
//                   "market_cap":167746299949.09518,
//                   "last_updated":"2020-06-29T04:13:35.000Z"
//               }
//           }
//       }
//   }
// }

// 需要付费才支持多convert
// curl -H "X-CMC_PRO_API_KEY: 899c3d91-f0be-4351-80fc-21bac6f6ee40" -H "Accept: application/json" -d "amount=1&symbol=ETH&convert=USD" -G https://pro-api.coinmarketcap.com/v1/tools/price-conversion
// {
//   "status":{
//       "timestamp":"2020-06-30T02:23:56.764Z",
//       "error_code":0,
//       "error_message":null,
//       "elapsed":13,
//       "credit_count":1,
//       "notice":null
//   },
//   "data":{
//       "id":1027,
//       "symbol":"ETH",
//       "name":"Ethereum",
//       "amount":1,
//       "last_updated":"2020-06-30T02:22:24.000Z",
//       "quote":{
//           "USD":{
//               "price":228.336370685,
//               "last_updated":"2020-06-30T02:22:24.000Z"
//           }
//       }
//   }
// }
