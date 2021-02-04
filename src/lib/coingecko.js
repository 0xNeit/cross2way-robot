const axios = require('axios');
const { fractionToDecimalString, fractionRatioToDecimalString } = require('./utils');
const log = require('./log')
const fetch = require('node-fetch')
const { ApolloClient } = require('apollo-client')
const { InMemoryCache } = require('apollo-cache-inmemory')
const { createHttpLink } = require('apollo-link-http')
const gql = require('graphql-tag')

const client = new ApolloClient({
  link: new createHttpLink({
    uri: 'https://graph.wanswap.finance/subgraphs/name/wanswap/wanswap-subgraph-3',
    fetch: fetch
  }),
  cache: new InMemoryCache(),
  shouldBatch: true,
})

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

// list
// {
//   "id": "yearn-finance-bit2",
//   "symbol": "yfb2",
//   "name": "Yearn Finance Bit2"
// },
// {
//   "id": "yearn-finance-center",
//   "symbol": "yfc",
//   "name": "Yearn Finance Center"
// },

const getIDs = async (url, symbolsStr) => {
  try {
    const symbols = symbolsStr.toLowerCase().replace(/\s+/g,"").split(',')
    const symbolsMap = {}
    symbols.forEach(symbol => {
      if (symbol === "fnx") {
        symbolsMap[symbol] = "finnexus"
      } else if (symbol === "uni") {
        symbolsMap[symbol] = "uniswap"
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
          if (item.symbol !== "fnx" && item.symbol !== "uni") {
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

// price
// {
//   "finnexus": {
//     "usd": 0.120816
//   },
//   "wanchain": {
//     "usd": 0.370103
//   }
// }

function TOKEN_DATA() {
  return gql`query tokens {
    tokens(where:{symbol: "WASP"}) {
      id
      symbol
      derivedETH
    }
  }`
}
async function getPrices(symbolsStr) {
  const symbolIds = await getIDs("https://api.coingecko.com/api/v3/coins/list", symbolsStr)
  let hasWasp = false
  if (symbolIds['wasp'] !== undefined) {
    hasWasp = true
    delete symbolIds['wasp']
  }
  const symbols = symbolsStr.toLowerCase().replace(/\s+/g,"").replace(/,wasp/g,"").split(',')
  const idsArr = []
  symbols.forEach(it => {
    idsArr.push(symbolIds[it])
  })
  const ids = idsArr.join(',')
  console.log(ids)
  const priceIdMap = await getData(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`)

  const priceMap = {};
  symbols.forEach(it => {
    priceMap[it.toUpperCase()] = fractionToDecimalString(priceIdMap[symbolIds[it]].usd, process.env.PRICE_DECIMAL);
  });
  if (hasWasp) {
    const query = TOKEN_DATA()
    const p = await client.query({
      query: query,
      fetchPolicy: 'cache-first',
    })
    // priceMap['WAN']
    console.log(JSON.stringify(p, null, 2))
    const waspPrice = fractionRatioToDecimalString(p.data.tokens[0].derivedETH, 18, priceMap['WAN'])
    priceMap['WASP'] = waspPrice
  }
  return priceMap
}

// https://api.coingecko.com/api/v3/coins/list
// https://api.coingecko.com/api/v3/simple/price?ids=<coin>&vs_currencies=usd
// https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=3
// setTimeout(async () => {
//   // const data = await getIDs("https://api.coingecko.com/api/v3/coins/list", process.env.SYMBOLS);
//   const data = await getPrices(process.env.SYMBOLS)
//   console.log(JSON.stringify(data, null, 2))
// }, 0)

module.exports = getPrices
