process.env.LOG_ENGINE = process.env.LOG_ENGINE
const log = require('../src/lib/log');
const { getChain, getChains } = require("../src/lib/web3_chains")
const {web3} = require('../src/lib/utils')
const { gNccChains, gNccChainTypes } = require('../src/lib/ncc_chains')
const db = require('../src/lib/sqlite_db')
const BigNumber = require('bignumber.js')

const btc = require('../src/lib/btc');
const { updatePrice, syncIsDebtCleanToWanV2, syncDebt, scanAllChains, getNccTokenChainTypeMap, syncConfigToOtherChain, syncSupply} = require('../src/robot_core');
const { ExceptionHandler } = require('winston');

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

const getContracts = () => {
  const web3Oracles = []
  const web3Quotas = []
  const web3Tms = []
  let oracleWan = null
  const web3Chains = getChains(process.env.NETWORK_TYPE)
  web3Chains.forEach(web3Chain => {
    if (!!web3Chain.deployedFile) {
      const oracle = web3Chain.loadContract('OracleDelegate')
      if (!oracle) {
        log.error(`${web3Chain.chainType} has not deployed Oracle`)
      }
      if (oracle.chain.chainName === 'wan') {
        oracleWan = oracle
      }
      web3Oracles.push(oracle)
  
      const quota = web3Chain.loadContract('QuotaDelegate')
      if (!quota) {
        log.error(`${web3Chain.chainType} has not deployed Quota`)
      }
      web3Quotas.push(quota)
  
      const tm = web3Chain.loadContract('TokenManagerDelegate')
      if (!tm) {
        log.error(`${web3Chain.chainType} has not deployed TokenManagerDelegate`)
      }
      web3Tms.push(tm)
    }
  })

  return {
    oracleWan,
    web3Oracles,
    web3Quotas,
    web3Tms,
  }
}

const testSyncSupply = async () => {
  const web3Chains = getChains(process.env.NETWORK_TYPE)
  const web3Tms = []
  web3Chains.forEach(web3Chain => {
    const tm = web3Chain.loadContract('TokenManagerDelegate')
    if (!tm) {
      log.error(`${web3Chain.chainType} has not deployed TokenManagerDelegate`)
    }
    web3Tms.push(tm)
  })


  const time = parseInt(new Date().getTime() / 1000);

  const s = {}
  await syncSupply(web3Tms, s, '0x000000000000000000000000000000000000000000000000006465765f303434', time)
}

async function testSyncConfigToOtherChain() {
  const chainWan = getChain('wanchain', process.env.NETWORK_TYPE);
  const sgaWan = chainWan.loadContract('StoremanGroupDelegate')
  const contracts = getContracts()
  const oracles = contracts.web3Oracles.filter(o => (o.chain.chainType !== 'WAN' ))
  await syncConfigToOtherChain(sgaWan, oracles)

  console.log('testSyncConfigToOtherChain finished')
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

const testSyncDebt = async () => {
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

  // 记录扫描debt的时间点, 以及该时间点各store man group的真实资产
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

const testScanAllChains = async () => {
  const chains = gNccChains
  const chainTypes = gNccChainTypes
  
  const from = {
    'BTC': 2099138,
    'LTC': 2048641,
    'XRP': 21695835,
    'DOT': 7718536,
    'DOGE': 3371105,
  }
  for (let i = 0; i < chainTypes.length; i++) {
    const num = i
    setTimeout(async () => {
      const chainType = chainTypes[num]
      await chains[chainType].chain.scan(db, from[chainType], from[chainType] + 1)
    }, 0)
  }
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
  // factorial(3)
  // factorial2(3)
  // factorial3({number: 3})

  // await scanBtc()
  // await checkDebtClean()
  // getMsgsByGroupId()
  // dbTx()
  // insertDebt()
  // getNccTokenChainTypeMap()

  // testSyncDebt()
  // testScanAllChains()
  // await testSyncConfigToOtherChain()
  await testSyncSupply()
}, 0)

process.on('uncaughtException', err => {
  log.error(`uncaughtException test:`, err)
});
process.on('unhandledRejection', (err) => {
  log.error(`unhandledRejection test:`, err)
});