const schedule = require('node-schedule');
process.env.LOG_ENGINE = process.env.LOG_ENGINE
const log = require('./lib/log');
// const getPrices_cmc = require("./lib/cmc");
// const getPrices_crypto = require("./lib/crypto_compare");
const getPrices_coingecko = require("./lib/coingecko");
const readlineSync = require('readline-sync');
const keythereum = require("keythereum");
const { getChain, getChains } = require("./lib/web3_chains")

const { createScanEvent, doSchedule, updatePrice_WAN, syncConfigToOtherChain, syncIsDebtCleanToWan } = require('./robot_core');

const chainWan = getChain('wanchain', process.env.NETWORK_TYPE);
const web3Chains = getChains(process.env.NETWORK_TYPE)

const chainBtc = require(`./chain/${process.env.IWAN_BTC_CHAIN_ENGINE}`);
const chainXrp = require(`./chain/${process.env.IWAN_XRP_CHAIN_ENGINE}`);
const chainLtc = require(`./chain/${process.env.IWAN_LTC_CHAIN_ENGINE}`);

const oracleWan = chainWan.loadContract('OracleDelegate')
const sgaWan = chainWan.loadContract('StoremanGroupDelegate')

const web3Oracles = []
const web3Quotas = []
web3Chains.forEach(web3Chain => {
  if (!!web3Chain.deployedFile) {
    const oracle = web3Chain.loadContract('OracleDelegate')
    if (!oracle) {
      log.error(`${web3Chain.chainType} has not deployed Oracle`)
    }
    web3Oracles.push(oracle)

    const quota = web3Chain.loadContract('QuotaDelegate')
    if (!quota) {
      log.error(`${web3Chain.chainType} has not deployed Quota`)
    }
    web3Quotas.push(quota)
  }
})

function getSk(address, tip) {
  let sk = null
  while (!sk) {
    const password = readlineSync.question(tip, {hideEchoBack: true, mask: '*'})
    try {
      const keyObject = keythereum.importFromFile(address.slice(2), process.env.KEYSTORE_PARENT_FOLD);
      sk = keythereum.recover(password, keyObject);
    } catch(e) {
      log.error(e)
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
        log.error(e)
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
        log.error(e)
      } finally {
        scanInst.bScanning = false
      }
    }
  })
}

const updateDebtCleanToWan = async function() {
  log.info("updateDebtCleanToWan")
  await doSchedule(async () => {
    await syncIsDebtCleanToWan(sgaWan, oracleWan, web3Quotas, chainBtc, chainXrp, chainLtc)
  })
}
const robotSchedules = function() {
  schedule.scheduleJob('20 * * * * *', updatePriceToWAN);

  // sync sga to sga database, 1 / 5min
  schedule.scheduleJob('0 */5 * * * *', scanNewStoreMan);

  // sync sga config from wan to other chain, sga database, 1 / 1day
  schedule.scheduleJob('15 2 1 * * *', updateStoreManToChains);

  schedule.scheduleJob('30 */1 * * * *', updateStoreManToChainsPart);

  schedule.scheduleJob('45 */11 * * * *', updateDebtCleanToWan);
};

// helper functions
setTimeout(async () => {
  if (process.env.USE_KEYSTORE === 'true') {
    for (let i = 0; i < web3Oracles.length; i++) {
      const oracle = web3Oracles[i]
      const adminAddress = await oracle.admin()
      
      let address = adminAddress.toLowerCase() 
      let sk = getSk(address, `请输入${oracle.chain.chainName} 上 oracle 合约的 admin (${address})的  密码：`)
      oracle.setAdminSk(sk)
    }
  }
  if (process.env.ORACLE_ADMIN_WANCHAIN){
    oracleWan.setAdminSk(process.env.ORACLE_ADMIN_WANCHAIN)
  }

  setTimeout(updatePriceToWAN, 0);
  setTimeout(scanNewStoreMan, 0);

  robotSchedules();

  // setTimeout(updatePriceToWAN, 0)
}, 0)


process.on('unhandledRejection', (err) => {
  log.error(`unhandledRejection ${err}`);
});