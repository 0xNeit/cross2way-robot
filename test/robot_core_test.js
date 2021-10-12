process.env.LOG_ENGINE = process.env.LOG_ENGINE
const log = require('../src/lib/log');
const { getChain, getChains } = require("../src/lib/web3_chains")
const {web3} = require('../src/lib/utils')
const db = require('../src/lib/sqlite_db')
const BigNumber = require('bignumber.js')

const btc = require('../src/lib/btc');
const { updatePrice, syncIsDebtCleanToWanV2, syncDebt, scan} = require('../src/robot_core');

// const web3Chains = getChains(process.env.NETWORK_TYPE)

// const registerTopics = web3.utils.keccak256('StoremanGroupRegisterStartEvent(bytes32,bytes32,uint256,uint256,uint256)');
// console.log(`${registerTopics.toString('hex')}`)

const doUpdatePrice = async() => {
  const chainWan = getChain('wanchain', process.env.NETWORK_TYPE);
  const oracleWan = chainWan.loadContractAt('OracleDelegate')
  oracleWan.setAdminSk('06a03207128827eaae0d31d97a7a6243de31f2baf99eabd764e33389ecf436fc')

  const symbols = ['FNX']
  const pricesMap = {'FNX': '1000'}

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

const checkDebt = async () => {
  const chainWan = getChain('wanchain', process.env.NETWORK_TYPE);
  const sgaWan = chainWan.loadContract('StoremanGroupDelegate')
  const oracleWan = chainWan.loadContract('OracleDelegate')
  const web3Chains = getChains(process.env.NETWORK_TYPE)
  const web3Tms = []
  web3Chains.forEach(web3Chain => {
    const tm = web3Chain.loadContract('TokenManagerDelegate')
    if (!tm) {
      log.error(`${web3Chain.chainType} has not deployed TokenManagerDelegate`)
    }
    web3Tms.push(tm)
  })
  await syncDebt(sgaWan, oracleWan, web3Tms)
}

const getStoreManConfig = async () => {
  const chainEth = getChain('ethereum', process.env.NETWORK_TYPE);
  const oracleEth = chainEth.loadContract('OracleDelegate')
  const c = await oracleEth.getStoremanGroupConfig('0x000000000000000000000000000000000000000000000000006465765f303234')
  console.log(`${JSON.stringify(c, null, 2)}`)
}

const checkDebtClean = async() => {
  const chainWan = getChain('wanchain', process.env.NETWORK_TYPE);
  const sgaWan = chainWan.loadContract('StoremanGroupDelegate')
  const oracleWan = chainWan.loadContract('OracleDelegate')
  await syncIsDebtCleanToWanV2(sgaWan, oracleWan)
}

const scanBtc = async () => {
  await scan(btc.btcChain)
}

const insertDebt = () => {
  db.insertDebt({
    groupId: 'aa',
    chainType: 'btc',
    isDebtClean: 1,
    totalSupply: '0',
    totalReceive: null,
    lastReceiveTx: null,
  })
}

const getMsgsByGroupId = () => {
  const a = db.getMsgsByGroupId({
    groupId: '0x000000000000000000000000000000000000000000746573746e65745f303236',
    chainType: 'BTC'
  });
  console.log(`${a.length}`)
}

const dbTx = () => {
  const insertGet = db.db.transaction((items) => {
    for (let i = 0; i < items.length; i++) {
      db.insertMsg({
        groupId: 'test',
        chainType: 'ttt',
        receive: '100',
        tx: 'tx',
      })

      const assets = db.getMsgsByGroupId({groupId: 'test', chainType: 'ttt'})
      const reducer = (sum, asset) => sum.plus(BigNumber(asset.receive))
      const totalAssets = assets.reduce(reducer, BigNumber(0))
      console.log(`${i} total = ${totalAssets}`)
    }
  })

  insertGet([1,2])
}

function factorial (number, result = 1) {
  console.trace(`t ${number}`)
  if (number === 1) return result
  return factorial(number - 1, number * result)
}

function factorial2 (number) {
  console.trace(`t ${number}`)
  if (number < 2) {
    return 1
  } else {
    return number * factorial2(number - 1)
  }
}

function factorial3 (o, result = 1) {
  console.trace(`t ${o.number}`)
  if (o.number === 1) {
    console.log('result', result)
    return result
  }
  setTimeout(() => {
    factorial3({number: o.number - 1}, o.number * result)
  }, 0)
}

setTimeout(async () => {
  factorial(3)
  // factorial2(3)
  // factorial3({number: 3})

  // await scanBtc()
  // await checkDebtClean()
  // getMsgsByGroupId()
  // dbTx()
  // insertDebt()
}, 0)

process.on('uncaughtException', err => {
  log.error(`uncaughtException test: ${err}`)
});
process.on('unhandledRejection', (err) => {
  log.error(`unhandledRejection test: ${err}`)
});