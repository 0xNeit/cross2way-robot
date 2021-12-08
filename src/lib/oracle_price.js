const chainWan = getChain('wanchain', process.env.NETWORK_TYPE);
const oracleWan = chainWan.loadContract('OracleDelegate')

const getOraclePrices = async (symbols) => {
  // const symbols = symbolStr.replace(/\s+/g,"").split(',')
  const prePricesArray = await oracleWan.getValuesByArray(symbols);
  const prePricesMap = {}
  symbols.forEach((v,i) => {prePricesMap[v] = prePricesArray[i];})
  return prePricesMap;
}

module.exports = getOraclePrices