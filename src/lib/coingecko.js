const axios = require('axios');
const { fractionToDecimalString } = require('./utils');
const log = require('./log')
const BigNumber = require('bignumber.js')

const { getContractPrices } = require('./wasp')

const getData = async url => {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    if (typeof(error) === "string") {
      log.error(error);
    } else {
      log.error(JSON.stringify(error));
    }
  }
  return null;
}

const printIDs = async (url, symbolsStr) => {
  try {
    const symbols = symbolsStr.toLowerCase().replace(/\s+/g,"").split(',')
    const symbolsMap = {}
    symbols.forEach(symbol => {symbolsMap[symbol] = []})

    const response = (await axios.get(url))
    const data = response.data
    data.forEach(item => {
      if (item.symbol === 'AVAX') {
        symbolsMap['avax'].push(item.id)
      } else if (symbolsMap.hasOwnProperty(item.symbol)) {
        symbolsMap[item.symbol].push(item.id)
      }
    })
    let str = ''
    symbols.forEach(symbol => {
      const ids = symbolsMap[symbol].length > 1 ? `[${symbolsMap[symbol]}]` : symbolsMap[symbol]
      str = str === '' ? ids : str + ',' + ids
    })
    console.log(str)
  } catch (error) {
    console.error(error)
  }
  return null
}

const getIDs = async (url, symbolsStr) => {
  try {
    const symbols = symbolsStr.toLowerCase().replace(/\s+/g,"").split(',')
    const symbolsMap = {}
    symbols.forEach(symbol => {
      if (symbol === "fnx") {
        symbolsMap[symbol] = "finnexus"
      } else if (symbol === "uni") {
        symbolsMap[symbol] = "uniswap"
      } else if (symbol === "xrp") {
        symbolsMap[symbol] = "ripple"
      } else if (symbol === 'ltc') {
        symbolsMap[symbol] = "litecoin"
      } else if (symbol === 'eos') { 
        symbolsMap[symbol] = "eos"
      } else {
        symbolsMap[symbol] = ""
      }
    })

    const response = (await axios.get(url))
    const data = response.data
    data.forEach(item => {
      if (symbolsMap.hasOwnProperty(item.symbol)) {
        if (symbolsMap[item.symbol] === "") {
          symbolsMap[item.symbol] = item.id
        } else {
          if (item.symbol !== "fnx" && item.symbol !== "uni" && item.symbol !== 'xrp' && item.symbol !== 'ltc' && item.symbol !== 'eos') {
            log.error(`duplicated new ${JSON.stringify(item, null, 2)}, old ${JSON.stringify(symbolsMap[item.symbol], null, 2)}`)
            throw new Error(`duplicated new ${JSON.stringify(item, null, 2)}, old ${JSON.stringify(symbolsMap[item.symbol], null, 2)}`)
          }
        }
      }
    })

    return symbolsMap
  } catch (error) {
    console.error(error)
  }
  return null
}

const getIDsMap = (symbolsStr, IdsStr) => {
  const symbolsMap = {}
  const symbols = symbolsStr.toLowerCase().replace(/\s+/g,"").split(',')
  const ids = IdsStr.replace(/\s+/g,"").split(',')

  for( let i = 0; i < symbols.length; i++ ) {
    symbolsMap[symbols[i]] = ids[i]
  }
  return symbolsMap
}

async function getPrices(symbolsStr, idsStr) {
  // const symbolIds = await getIDs("https://api.coingecko.com/api/v3/coins/list", symbolsStr)
  const symbolIds = getIDsMap(symbolsStr, idsStr)
  delete symbolIds['wasp']
  delete symbolIds['zoo']
  delete symbolIds['phx']
  delete symbolIds['wand']
  const reg = new RegExp(process.env.SYMBOLS_reg, 'g')
  const symbols = symbolsStr.replace(/\s+/g,"").replace(reg,"").toLowerCase().split(',')
  const idsArr = []
  symbols.forEach(it => {
    idsArr.push(symbolIds[it])
  })
  const ids = idsArr.join(',')
  console.log(ids)
  const priceIdMap = await getData(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`)

  const priceMap = {}

  symbols.forEach(it => {
    try {
      priceMap[it.toUpperCase()] = fractionToDecimalString(priceIdMap[symbolIds[it]].usd, process.env.PRICE_DECIMAL);
    } catch (e) {
      log.error(`${it} ${e}`)
      throw e
    }

    // 如果价格为0 抛异常
    const newPrice = new BigNumber(priceMap[it.toUpperCase()])
    if (newPrice.isZero()) {
      log.error(`newPrice ${it} is 0`)
      throw new Error(`newPrice ${it} is 0`)
    }
  });

  const contractPrices = await getContractPrices(priceMap['WAN'])
  priceMap['WASP'] = contractPrices.waspPrice
  priceMap['ZOO'] = contractPrices.zooPrice
  priceMap['PHX'] = contractPrices.phxPrice
  priceMap['WAND'] = contractPrices.wandPrice

  // priceMap['FNX'] = '0x01'
  return priceMap
}

// setTimeout(async () => {
//   const symbolsStr = "ETH,USDC,TUSD,GUSD,LINK,MKR,ZXC,EURS,USDT,WAN,FNX,BTC,EOS,UNI,SUSHI,WASP,XRP,ZCN,VIBE,LTC,AVAX,DOT,MATIC"
//   await printIDs("https://api.coingecko.com/api/v3/coins/list", symbolsStr)
// }, 0);

// https://api.coingecko.com/api/v3/coins/list
// https://api.coingecko.com/api/v3/simple/price?ids=<coin>&vs_currencies=usd
// https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=3
// setTimeout(async () => {
//   // const data = await getIDs("https://api.coingecko.com/api/v3/coins/list", process.env.SYMBOLS);
//   const data = await getPrices(process.env.SYMBOLS, process.env.SYMBOLIDS)
//   console.log(JSON.stringify(data, null, 2))
// }, 0)

module.exports = getPrices
