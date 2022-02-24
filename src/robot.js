"use strict"
const schedule = require('node-schedule');
process.env.LOG_ENGINE = process.env.LOG_ENGINE
const log = require('./lib/log');
// const getPrices_cmc = require("./lib/cmc");
// const getPrices_crypto = require("./lib/crypto_compare");
const getPrices_coingecko = require("./lib/coingecko");
const readlineSync = require('readline-sync');
const keythereum = require("keythereum");
const { getChain, getChains } = require("./lib/web3_chains")
const Web3 = require("web3");

const { 
  createScanEvent,
  doSchedule,
  updatePrice_WAN,
  syncConfigToOtherChain,
  // syncIsDebtCleanToWan_old,
  syncIsDebtCleanToWan,
  syncDebt,
  // scanAllChains,
  checkDebtClean
} = require('./robot_core');
const { gNccChains } = require('./lib/ncc_chains');

const chainWan = getChain('wanchain', process.env.NETWORK_TYPE);
const web3Chains = getChains(process.env.NETWORK_TYPE)

const chainBtc = require(`./chain/${process.env.IWAN_BTC_CHAIN_ENGINE}`);
const chainXrp = require(`./chain/${process.env.IWAN_XRP_CHAIN_ENGINE}`);
const chainLtc = require(`./chain/${process.env.IWAN_LTC_CHAIN_ENGINE}`);

let oracleWan = null
const sgaWan = chainWan.loadContract('StoremanGroupDelegate')

const web3Oracles = []
// const web3Quotas = []
const web3Tms = []
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

    // const quota = web3Chain.loadContract('QuotaDelegate')
    // if (!quota) {
    //   log.error(`${web3Chain.chainType} has not deployed Quota`)
    // }
    // web3Quotas.push(quota)

    const tm = web3Chain.loadContract('TokenManagerDelegate')
    if (!tm) {
      log.error(`${web3Chain.chainType} has not deployed TokenManagerDelegate`)
    }
    web3Tms.push(tm)
  }
})

function getSk(address, tip) {
  let sk = null
  while (!sk) {
    const password = readlineSync.question(tip, {hideEchoBack: true, mask: '*'})
    if (password === 'quit') {
      return null
    }
    try {
      const keyObject = keythereum.importFromFile(address.slice(2), process.env.KEYSTORE_PARENT_FOLD);
      sk = keythereum.recover(password, keyObject);
    } catch(e) {
      log.error(`get private key exception: ${address}`, e)
    }
  }
  return sk.toString('hex')
}

const scanInst = createScanEvent(
  sgaWan,
  process.env.REGISTER_START_EVENT,
  process.env.CHAINTYPE_WAN,
  parseInt(process.env.SCAN_STEP),
  parseInt(process.env.SCAN_UNCERTAIN_BLOCK),
  parseInt(process.env.SCAN_DELAY),
);

const updatePriceToWAN = async function() {
  const pricesMap = await doSchedule(getPrices_coingecko, process.env.SCHEDULE_RETRY_TIMES, process.env.SYMBOLS_3RD, process.env.SYMBOLS_SWAP);
  log.info(`updatePriceToChains begin, get prices: ${JSON.stringify(pricesMap)}`);

  await doSchedule(updatePrice_WAN, process.env.SCHEDULE_RETRY_TIMES, oracleWan, pricesMap);
  log.info(`updatePriceToChains end`);
}

const scanNewStoreMan = () => {
  scanInst.scanEvent();
}

const updateStoreManToChains = async function() {
  log.info("updateStoreManToChains")
  await doSchedule(async () => {
    if (!scanInst.bScanning) {
      scanInst.bScanning = true
      try{
        const oracles = web3Oracles.filter(o => (o.chain.chainName !== 'wan' ))
        await syncConfigToOtherChain(sgaWan, oracles);
      } catch(e) {
        log.error(`updateStoreManToChains exception:`, e)
      } finally {
        scanInst.bScanning = false
      }
    } else {
      setTimeout(async() => {
        await updateStoreManToChains()
      }, 10000)
    }
  })
}

const updateStoreManToChainsPart = async function() {
  log.info("updateStoreManToChainsPart")
  await doSchedule(async () => {
    if (!scanInst.bScanning) {
      scanInst.bScanning = true
      try{
        const oracles = web3Oracles.filter(o => (o.chain.chainName !== 'wan' ))
        await syncConfigToOtherChain(sgaWan, oracles, true);
      } catch(e) {
        log.error(`updateStoreManToChainsPart exception`, e)
      } finally {
        scanInst.bScanning = false
      }
    }
  })
}

// const updateDebtCleanToWan_old = async function() {
//   log.info("updateDebtCleanToWan")
//   await doSchedule(async () => {
//     await syncIsDebtCleanToWan_old(sgaWan, oracleWan, web3Quotas, chainBtc, chainXrp, chainLtc)
//   })
// }
const updateDebtCleanToWan = async function() {
  log.info("updateDebtCleanToWan")
  await doSchedule(async () => {
    await syncIsDebtCleanToWan(sgaWan, oracleWan)
  })
}
const updateDebt = async function() {
  log.info("updateDebt")
  await doSchedule(async () => {
    // await syncDebt(sgaWan, oracleWan, web3Tms)
    await syncDebt()
  })
}
const checkDebt = async function() {
  log.info("checkDebt")
  await doSchedule(async () => {
    // await checkDebtClean(sgaWan, oracleWan, web3Tms)
    await checkDebtClean(web3Tms)
  })
}

const robotSchedules = function() {
  schedule.scheduleJob('20 * * * * *', updatePriceToWAN);

  // sync sga to sga database, 1 / 5min
  schedule.scheduleJob('0 */5 * * * *', scanNewStoreMan);

  // sync sga config from wan to other chain, sga database, 1 / 1day
  // schedule.scheduleJob('15 2 1 * * *', updateStoreManToChains);

  schedule.scheduleJob('30 */3 * * * *', updateStoreManToChainsPart);

  // schedule.scheduleJob('45 */11 * * * *', updateDebtCleanToWan_old);
  schedule.scheduleJob('45 */11 * * * *', updateDebtCleanToWan);

  // save debt
  schedule.scheduleJob('5 0 */4 * * *', updateDebt);
  // check debt
  schedule.scheduleJob('5 */10 * * * *', checkDebt);
};

/// check rpc if invalid, choose another one, this is only for testnet
// check rpc begin
async function checkChainRpc(chain) {
  // 记录上一次的blocknumber,如果多久没变, 如果超过设定,则查看其余rpc,看是否更新, 更新则切换
  let blockNumber = 0
  let isBadConnect = false
  try {
    blockNumber = await chain.getBlockNumber()
  } catch(error) {
    // chain is disconnect?
    isBadConnect = true
    // 1. 优先切换到别的可用web3上,
    // 2. 没有可用的, 则尝试reconnect?
    log.warn(`chain exception ${chain.chainType} getBlockNumber : ${chain.rpc}`, error)
  }

  log.info(`chain ${chain.chainType} blockNumber : ${blockNumber}`)
  
  if (!isBadConnect && (chain.lastBlockNumber < blockNumber)) {
    chain.lastBlockNumber = blockNumber
    chain.lastBlockTime = new Date().getTime()
  } else {
    const currentTime = new Date().getTime()
    // 如果 链接失败 或 超过设定时间, 优先切换到可用的web3上
    // if (currentTime - chain.lastBlockTime > chain.maxNoBlockTime) {
    if (isBadConnect || (currentTime > chain.lastBlockTime + chain.maxNoBlockTime)) {
      let latestBlockNumber = chain.lastBlockNumber
      let latestRpc = chain.rpc
      let latestWeb3 = chain.web3
      // 则查看其余rpc,看是否更新, 
      if (chain.rpcS && chain.rpcS.length > 1) {
        for (let i = 0; i < chain.rpcS.length; i ++) {
          const rpc_url = chain.rpcS[i]

          if (rpc_url !== chain.rpc) {
            log.info(`chain ${chain.chainType} create rpc : ${rpc_url}`)
            try {
              let web3 = await chain.createApi(rpc_url)
              const rpcBlockNumber = await web3.eth.getBlockNumber()
              if (rpcBlockNumber > latestBlockNumber) {
                latestBlockNumber = rpcBlockNumber
                latestRpc = rpc_url
                latestWeb3 = web3
              }
            } catch (error) {
              log.warn(`chain exception ${chain.chainType} createApi or sGetBlockNumber : ${rpc_url}`, error)
            }
          }
        }

        // 真的有最新的?
        if (latestRpc !== chain.rpc) {
          // 再获取一次最新的块看看
          try {
            blockNumber = await chain.getBlockNumber()
            chain.lastBlockNumber = blockNumber
          } catch (error) {
            log.warn(`chain exception ${chain.chainType} getBlockNumber : ${rpc_url}`, error)
          }
  
          // 真的有更新, 则替换
          if (latestBlockNumber > chain.lastBlockNumber) {
            log.warn(`chain ${chain.chainType} change rpc from ${chain.rpc} to ${latestRpc}`)
  
            try {
              await chain.setApi(latestWeb3)
              chain.rpc = latestRpc
              chain.lastBlockNumber = latestBlockNumber
              chain.lastBlockTime = new Date().getTime()
            } catch (error) {
              log.warn(`chain exception ${chain.chainType} setApi rpc from ${chain.rpc} to ${latestRpc}`)
            }
  
            return
          }
        }
      }
    }

    if (isBadConnect) {
      let web3 = await chain.createApi(chain.rpc)
      await chain.setApi(web3)
      log.warn(`chain ${chain.chainType} reconnect ${chain.rpc}`)
    }
  }
}

const tickRpcInterval = 30 * 60 * 1000
async function tickRPC() {
  try {
    // contract chains check
    const promises = []
    for(let i = 0; i < web3Chains.length; i++) {
      promises.push(checkChainRpc(web3Chains[i]))
    }

    // non-contract chains check
    const keys = Object.keys(gNccChains)
    for(let j = 0; j < keys.length; j++) {
      promises.push(checkChainRpc(gNccChains[keys[j]].chain))
    }
    await Promise.all(promises)
  } catch(e) {
    log.warn(e)
  }

  // try every 30 minutes
  setTimeout(tickRPC, tickRpcInterval)
}
// end

// helper functions
setTimeout(async () => {
  if (process.env.USE_KEYSTORE === 'true') {
    for (let i = 0; i < web3Oracles.length; i++) {
      const oracle = web3Oracles[i]
      const adminAddress = await oracle.admin()
      
      let address = adminAddress.toLowerCase() 
      let sk = getSk(address, `请输入${oracle.chain.chainName} 上 oracle 合约的 admin (${address})的  密码, 退出请输入"quit"：`)
      if (sk === null) {
        process.exit(0);
      }
      oracle.setAdminSk(sk)
    }
  }
  if (process.env.ORACLE_ADMIN_WANCHAIN){
    oracleWan.setAdminSk(process.env.ORACLE_ADMIN_WANCHAIN)
  }

  setTimeout(updatePriceToWAN, 0);
  setTimeout(scanNewStoreMan, 0);
  // setTimeout(scanAllChains, 10000)
  setTimeout(updateDebt, 0)
  setTimeout(tickRPC, tickRpcInterval)

  robotSchedules();

  // setTimeout(scanNewStoreMan, 0);
  // setTimeout(updateStoreManToChainsPart, 0)
  // setTimeout(updateDebtCleanToWan, 0)
  // setTimeout(updateDebt, 0)
  // setTimeout(scanAllChains, 10000)
  // setTimeout(updateStoreManToChainsPart, 0)

  // setTimeout(checkDebt, 1000)
  
  // setTimeout(tickRPC, tickRpcInterval)
}, 0)


process.on('uncaughtException', err => {
  log.error(`uncaughtException`, err)
});
process.on('unhandledRejection', (err) => {
  log.error(`unhandledRejection`, err)
});
