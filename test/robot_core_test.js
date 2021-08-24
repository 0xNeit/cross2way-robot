process.env.LOG_ENGINE = process.env.LOG_ENGINE
const log = require('../src/lib/log');
const { getChain, getChains } = require("../src/lib/web3_chains")

const { updatePrice} = require('../src/robot_core');

const chainWan = getChain('wanchain', process.env.NETWORK_TYPE);
// const web3Chains = getChains(process.env.NETWORK_TYPE)

const oracleWan = chainWan.loadContract('OracleDelegate')
// const sgaWan = chainWan.loadContract('StoremanGroupDelegate')


const doUpdatePrice = async() => {
  oracleWan.setAdminSk('06a03207128827eaae0d31d97a7a6243de31f2baf99eabd764e33389ecf436fc')

  const symbols = ['WAN']
  const pricesMap = {'WAN': '1086330000000000000'}

  await updatePrice(oracleWan, pricesMap, symbols)

}
setTimeout(async () => {
  await doUpdatePrice()
}, 0)