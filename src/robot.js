const schedule = require('node-schedule');
process.env.LOG_ENGINE = process.env.LOG_ENGINE
const log = require('./lib/log');
const getPrices_cmc = require("./lib/cmc");
const getPrices_crypto = require("./lib/crypto_compare");
const getPrices_coingecko = require("./lib/coingecko");
const readlineSync = require('readline-sync');
const keythereum = require("keythereum");
const { getChains } = require("./lib/web3_chains")

function readSyncByfs(tips) {
  tips = tips || '> ';
  process.stdout.write(tips);
  process.stdin.pause();

  const buf = Buffer.allocUnsafe(10000);
  fs.readSync(process.stdin.fd, buf, 0, 10000, 0);
  process.stdin.end();

  return buf.toString('utf8', 0, response).trim();
}

// const { createScanEvent, doSchedule, updateWanPrice, updatePrice_WAN, updatePrice_ETH, syncPriceToOtherChain, syncConfigToOtherChain } = require('./robot_core');
const { createScanEvent, doSchedule, updatePrice_WAN, updatePrice_ETH, syncConfigToOtherChain, syncIsDebtCleanToWan } = require('./robot_core');

const { loadContract } = require('./lib/abi_address');

const chainWan = require(`./chain/${process.env.WAN_CHAIN_ENGINE}`);
const chainEth = require(`./chain/${process.env.ETH_CHAIN_ENGINE}`);
const chainBsc = require(`./chain/${process.env.CHAIN_ENGINE_BSC}`);
const chainAvax = require(`./chain/${process.env.AVAX_CHAIN_ENGINE}`);
const chainDev = require(`./chain/${process.env.CHAIN_ENGINE_DEV}`);

const web3Chains = getChains(process.env.NETWORK_TYPE)

const chainBtc = require(`./chain/${process.env.IWAN_BTC_CHAIN_ENGINE}`);
const chainXrp = require(`./chain/${process.env.IWAN_XRP_CHAIN_ENGINE}`);
const chainLtc = require(`./chain/${process.env.IWAN_LTC_CHAIN_ENGINE}`);

const oracleWan = loadContract(chainWan, 'OracleDelegate')
const oracleEth = loadContract(chainEth, 'OracleDelegate')
const oracleBsc = loadContract(chainBsc, 'OracleDelegate')
const oracleAvax = loadContract(chainAvax, 'OracleDelegate')
const oracleDev = loadContract(chainDev, 'OracleDelegate')
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

const quotaWan = loadContract(chainWan, 'QuotaDelegate')
const quotaEth = loadContract(chainEth, 'QuotaDelegate')
const quotaBsc = loadContract(chainBsc, 'QuotaDelegate')
const quotaAvax = loadContract(chainAvax, 'QuotaDelegate')
const quotaDev = loadContract(chainDev, 'QuotaDelegate')

const sgaWan = loadContract(chainWan, 'StoremanGroupDelegate')


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
  const pricesMap = await doSchedule(getPrices_coingecko, process.env.SCHEDULE_RETRY_TIMES, process.env.SYMBOLS, process.env.SYMBOLIDS);
  log.info(`updatePriceToChains begin, get prices: ${JSON.stringify(pricesMap)}`);

  await doSchedule(updatePrice_WAN, process.env.SCHEDULE_RETRY_TIMES, oracleWan, pricesMap);
  log.info(`updatePriceToChains end`);
}

const updatePriceToETH = async function() {
  const pricesMap = await doSchedule(getPrices_coingecko, process.env.SCHEDULE_RETRY_TIMES, process.env.SYMBOLS_ETH, process.env.SYMBOLIDS);
  log.info(`updatePriceToChains begin, get prices: ${JSON.stringify(pricesMap)}`);

  await doSchedule(updatePrice_ETH, process.env.SCHEDULE_RETRY_TIMES, oracleEth, pricesMap);
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
        await syncConfigToOtherChain(sgaWan, [oracleEth, oracleBsc, oracleAvax, oracleDev, ...web3Oracles]);
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
        await syncConfigToOtherChain(sgaWan, [oracleEth, oracleBsc, oracleAvax, oracleDev, ...web3Oracles], true);
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
    await syncIsDebtCleanToWan(oracleWan, quotaWan, quotaEth, quotaBsc, quotaAvax, quotaDev, web3Quotas, chainBtc, chainXrp, chainLtc)
  })
}
const robotSchedules = function() {
  schedule.scheduleJob('20 * * * * *', updatePriceToWAN);

  // schedule.scheduleJob('20 0 */2 * * *', updatePriceToETH);

  // sync sga to sga database, 1 / 5min
  schedule.scheduleJob('0 */5 * * * *', scanNewStoreMan);

  // sync sga config from wan to other chain, sga database, 1 / 1day
  schedule.scheduleJob('15 2 1 * * *', updateStoreManToChains);

  schedule.scheduleJob('30 */1 * * * *', updateStoreManToChainsPart);

  schedule.scheduleJob('45 */11 * * * *', updateDebtCleanToWan);
};

// helper functions
setTimeout(async () => {
  // if (process.env.USE_KEYSTORE === 'true') {
  //   // set admin
  //   const wanAdminAddress = await oracleWan.admin()
  //   const ethAdminAddress = await oracleEth.admin()
  //   const bscAdminAddress = await oracleBsc.admin()
  //   const avaxAdminAddress = await oracleAvax.admin()
  //   const devAdminAddress = await oracleDev.admin()

  //   for (let i = 0; i < web3Oracles.length; i++) {
  //     const oracle = web3Oracles[i]
  //     const adminAddress = await oracle.admin()
      
  //     let address = adminAddress.toLowerCase() 
  //     let sk = getSk(address, `请输入${oracle.chain.chainName} 上 oracle 合约的 admin (${address})的  密码：`)
  //     oracle.setAdminSk(sk)
  //   }

  //   let address = wanAdminAddress.toLowerCase() 
  //   let sk = getSk(address, `请输入wanchain上oracle合约的admin(${address})的  密码：`)
  //   oracleWan.setAdminSk(sk)

  //   address = ethAdminAddress.toLowerCase()
  //   sk = null
  //   sk = getSk(address, `请输入ethereum上oracle合约的admin(${address})的  密码：`)
  //   oracleEth.setAdminSk(sk)

  //   address = bscAdminAddress.toLowerCase()
  //   sk = null
  //   sk = getSk(address, `请输入bsc上oracle合约的admin(${address})的  密码：`)
  //   oracleBsc.setAdminSk(sk)

  //   address = avaxAdminAddress.toLowerCase()
  //   sk = null
  //   sk = getSk(address, `请输入avax上oracle合约的admin(${address})的  密码：`)
  //   oracleAvax.setAdminSk(sk)

  //   address = devAdminAddress.toLowerCase()
  //   sk = null
  //   sk = getSk(address, `请输入moonbeam上oracle合约的admin(${address})的  密码：`)
  //   oracleDev.setAdminSk(sk)
  // }
  // if (process.env.ORACLE_ADMIN_WANCHAIN){
  //   oracleWan.setAdminSk(process.env.ORACLE_ADMIN_WANCHAIN)
  // }

  // setTimeout(updatePriceToWAN, 0);
  // setTimeout(scanNewStoreMan, 0);

  // robotSchedules();

  setTimeout(updateStoreManToChainsPart, 0)
}, 0)


process.on('unhandledRejection', (err) => {
  log.error(`unhandledRejection ${err}`);
});