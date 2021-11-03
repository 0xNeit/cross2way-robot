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
    log.error(`get ${url} exception:`, error)
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
    console.error(`get ${url} exception`, error)
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
    console.error(`get ${url} exception:`, error)
  }
  return null
}

// ETH,USDC,TUSD,GUSD,LINK,MKR,ZXC,EURS,USDT,WAN,BTC,EOS,UNI,SUSHI,XRP,ZCN,VIBE,LTC,AVAX,DOT,MATIC
// ethereum,usd-coin,true-usd,gemini-dollar,chainlink,maker,0xcert,stasis-eurs,tether,wanchain,bitcoin,eos,uniswap,sushi,ripple,0chain,vibe,litecoin,avalanche-2,polkadot,matic-network
const getMaps = (symbolsStr3rd) => {
  const ids =  {
    ETH: 'ethereum',
    USDC: 'usd-coin',
    TUSD: 'true-usd',
    GUSD: 'gemini-dollar',
    LINK: 'chainlink',
    MKR: 'maker',
    ZXC: '0xcert',
    EURS: 'stasis-eurs',
    USDT: 'tether',
    WAN: 'wanchain',
    BTC: 'bitcoin',
    EOS: 'eos',
    UNI: 'uniswap',
    SUSHI: 'sushi',
    XRP: 'ripple',
    ZCN: '0chain',
    VIBE: 'vibe',
    LTC: 'litecoin',
    AVAX: 'avalanche-2',
    DOT: 'polkadot',
    MATIC: 'matic-network',
    DOGE: 'dogecoin',
    // MOVR: 'moonriver',
  }

  const symbols = symbolsStr3rd.replace(/\s+/g,"").split(',')
  const symbolIdMap = {}
  const idSymbolMap = {}
  symbols.forEach(symbol => {
    if (!ids.hasOwnProperty(symbol)) {
      log.error(`coingecko ${symbol} id not exist`)
      throw new Error(`coingecko ${symbol} id not exist`)
    }
    symbolIdMap[symbol] = ids[symbol]
    idSymbolMap[ids[symbol]] = symbol
  })

  return {
    symbolIdMap,
    idSymbolMap
  }
}

async function getPrices(symbolsStr3rd, symbolsStrSwap) {
  // const symbolIds = await getIDs("https://api.coingecko.com/api/v3/coins/list", symbolsStr)
  const { symbolIdMap, idSymbolMap } = getMaps(symbolsStr3rd)
  const ids = Object.keys(idSymbolMap).join(',')

  const priceIdMap = await getData(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`)

  const priceMap = {}

  for(it in symbolIdMap) {
    try {
      priceMap[it] = fractionToDecimalString(priceIdMap[symbolIdMap[it]].usd, process.env.PRICE_DECIMAL);
    } catch (e) {
      log.error(`${it} ${symbolIdMap[it]} price is not exist`, e)
      throw e
    }

    // 如果价格为0 抛异常
    const newPrice = new BigNumber(priceMap[it])
    // if newPrice <= 0, mail,ding
    if (newPrice.lte(0)) {
      log.error(`newPrice ${it} <= 0`)
      throw new Error(`newPrice ${it} is less than 0`)
    }
  }

  const contractPrices = await getContractPrices(priceMap['WAN'])
  const swapSymbols = symbolsStrSwap.replace(/\s+/g,"").split(',')
  swapSymbols.forEach(symbol => {
    if (!contractPrices.hasOwnProperty(symbol)) {
      log.error(`swap ${symbol} price is not exist`)
      throw new Error(`swap ${symbol} price is not exist`)
    }
    priceMap[symbol] = contractPrices[symbol]
  })

  // TODO: remove
  priceMap['FNX'] = '0x1000'
  return priceMap
}

// setTimeout(async () => {
//   const symbolsStr = process.env.SYMBOLS_3RD + ',MOVR'
//   await printIDs("https://api.coingecko.com/api/v3/coins/list", symbolsStr)
// }, 0);

// https://api.coingecko.com/api/v3/coins/list
// https://api.coingecko.com/api/v3/simple/price?ids=<coin>&vs_currencies=usd
// https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=3

// setTimeout(async () => {
//   // const data = await getIDs("https://api.coingecko.com/api/v3/coins/list", process.env.SYMBOLS_3RD);
//   const data = await getPrices(process.env.SYMBOLS_3RD, process.env.SYMBOLS_SWAP)
//   console.log(JSON.stringify(data, null, 2))
// }, 0)

module.exports = getPrices
