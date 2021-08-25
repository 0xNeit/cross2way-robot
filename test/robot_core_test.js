process.env.LOG_ENGINE = process.env.LOG_ENGINE
const log = require('../src/lib/log');
const { getChain, getChains } = require("../src/lib/web3_chains")

const { updatePrice} = require('../src/robot_core');

// const web3Chains = getChains(process.env.NETWORK_TYPE)


const doUpdatePrice = async() => {
  const chainWan = getChain('wanchain', process.env.NETWORK_TYPE);
  const oracleWan = chainWan.loadContractAt('OracleDelegate')
  oracleWan.setAdminSk('06a03207128827eaae0d31d97a7a6243de31f2baf99eabd764e33389ecf436fc')

  const symbols = ['WAN']
  const pricesMap = {'WAN': '1086330000000000000'}

  await updatePrice(oracleWan, pricesMap, symbols)
}

const getTotalSupply = async() => {
  const chain = getChain('ethereum', process.env.NETWORK_TYPE);
  const blocknumber = await chain.getBlockNumber()
  const fnx = chain.loadContractAt('MappingToken', '0x9df2251629afba66baac69789a3e9aee7d53aeaa')
  const total = await fnx.getFun('totalSupply')
  console.log(`total ${blocknumber} ${total}`)
  for (let i = 100; i<5000; i += 27) {
    const total2 = await fnx.core.getScFun('totalSupply', [], fnx.contract, null, blocknumber - i)
    console.log(`total2 ${blocknumber - i} ${total2}`)
  }
}

setTimeout(async () => {
  await getTotalSupply()
}, 0)