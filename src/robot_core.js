const log = require('./lib/log');
const { sleep, web3 } = require('./lib/utils');
const logAndSendMail = require('./lib/email');
const ScanEvent = require('./scan_event');
const db = require('./lib/sqlite_db');
const xrp = require('./lib/xrp');
const dot = require('./lib/dot');
const { default: BigNumber } = require('bignumber.js');
const getCryptPrices = require('./lib/crypto_compare')

const thresholdTimes = web3.utils.toBN(process.env.THRESHOLD_TIMES);
const zero = web3.utils.toBN(0);

function createScanEvent(contract, eventName, chainName, step, uncertainBlock, delay) {
  return new ScanEvent(
    contract,
    eventName,
    chainName,
    step,
    uncertainBlock,
    delay,
  );
}

async function doSchedule(func, tryTimes = process.env.SCHEDULE_RETRY_TIMES, ...args) {
  log.info(`${func.name} begin`);
  let leftTime = parseInt(tryTimes);

  while (leftTime > 0) {
    try {
      leftTime --;
      return await func(...args);
    } catch (e) {
      if (leftTime === 0) {
        await logAndSendMail(`${func.name} exception`, `args=${args}, tried ${tryTimes} still failed, ${e instanceof Error ? e.stack : e}`);
        return;
      }
      log.warn(`${func.name} exception : ${e instanceof Error ? e.stack : e}`);
      await sleep(parseInt(process.env.SCHEDULE_RETRY_INTERVAL));
    }
  }
}

async function updatePrice(oracle, pricesMap, symbolsStringArray) {
  log.info(`updatePrice ${oracle.core.chainType} begin`);

  const threshold = web3.utils.toBN(process.env.THRESHOLD);
  const maxThreshold = web3.utils.toBN(process.env.MAXTHRESHOLD);
  const maxThresholdCmp = web3.utils.toBN(process.env.MAXTHRESHOLD_CMP);
  
  if (pricesMap) {
    const symbols = Object.keys(pricesMap);

    if (symbols.length > 0) {
      const prePricesArray = await oracle.getValuesByArray(symbolsStringArray);

      const prePricesMap = {}
      symbolsStringArray.forEach((v,i) => {prePricesMap[v] = prePricesArray[i];})

      let cryptoPriceMap = null
      const reg = new RegExp(process.env.SYMBOLS_reg, 'g')

      const needUpdateMap = {};
      const oldMap = {};
      const deltaMap = {}
      for (let i = 0; i < symbols.length; i++) {
        const it = symbols[i];

        const newPrice = web3.utils.toBN(pricesMap[it]);
        const oldPrice = web3.utils.toBN(prePricesMap[it]);

        if (oldPrice.cmp(zero) === 0) {
          needUpdateMap[it] = '0x' + newPrice.toString(16);
          oldMap[it] = '0';
          deltaMap[it] = 'infinity'
        } else {
          const deltaTimes = newPrice.sub(oldPrice).mul(thresholdTimes).div(oldPrice).abs();
          if (deltaTimes.cmp(threshold) > 0) {
            // 如果coingecko价格变化 > 30%, 则当crypto价格变化 > 25%, 才算通过
            if (deltaTimes.cmp(maxThreshold) > 0) {
              if (!cryptoPriceMap) {
                cryptoPriceMap = await getCryptPrices(process.env.SYMBOLS.replace(/\s+/g,"").replace(reg,""))
              }
              if (cryptoPriceMap[it]) {
                const newCryptoPrice = web3.utils.toBN(cryptoPriceMap[it])
                const cryptoDeltaTimes = newCryptoPrice.sub(oldPrice).mul(thresholdTimes).div(oldPrice).abs();
      
                // 则当crypto价格变化 < 25%, 放弃此次变化
                if (cryptoDeltaTimes.cmp(maxThresholdCmp) <= 0) {
                  continue
                }
              }
            }
            needUpdateMap[it] = '0x' + newPrice.toString(16);
            oldMap[it] = oldPrice.toString(10);
            deltaMap[it] = deltaTimes.toString(10);
          }
        }
      }
      
      await oracle.updatePrice(needUpdateMap, oldMap, deltaMap);
    }
  }
  log.info(`updatePrice ${oracle.core.chainType} end`);
}

function mergePrice(pricesMap, symbolsOld, symbolsMapStr) {
  symbolsMapStr.replace(/\s+/g,"").split(',').forEach(i => { 
    const kv = i.split(':')
    if (kv.length === 2) {
      pricesMap[kv[0]] = pricesMap[kv[1]]
      symbolsOld.push(kv[0])
    }
  })
}

async function updatePrice_WAN(oracle, pricesMap) {
  const symbols = process.env.SYMBOLS.replace(/\s+/g,"").split(',')
  mergePrice(pricesMap, symbols, process.env.SYMBOLS_MAP)
  await updatePrice(oracle, pricesMap, symbols)
}

async function updateDeposit(oracle, smgID, amount) {
  log.info(`updateDeposit`);
  const amountHex = "0x" + web3.utils.toBN(amount).toString('hex');
  await oracle.updateDeposit(smgID, amountHex);
}

async function setStoremanGroupStatus(oracle, smgID, status) {
  log.info(`setStoremanGroupStatus`);
  const statusHex = "0x" + web3.utils.toBN(status).toString('hex');
  await oracle.setStoremanGroupStatus(smgID, statusHex);
}

function writeToDB(config) {
  const c = JSON.parse(JSON.stringify(config));
  const updateTime = new Date().getTime();
  c.updateTime = updateTime;
  db.updateSga(c);
}
async function syncConfigToOtherChain(sgaContract, oracles, isPart = false) {
  log.info(`syncConfigToOtherChain begin`);

  // TODO: set current storeMan group 
  // const currentGroupIdKey1 = web3.utils.keccak256('MULTICOINSTAKE_RESERVED_KEY____1')
  // const currentGroupIdKey2 = web3.utils.keccak256('MULTICOINSTAKE_RESERVED_KEY____2')
  const curConfigs = []
  for (let j = 0; j < oracles.length; j++) {
    try {
      const configs = await oracles[j].getCurrentGroupIds()
      curConfigs.push(configs)
    } catch(e) {
      log.error(`chain ${oracles[j].chain.core.chainType} failed`)
      throw e
    }
  }
  const curTimestamp = Math.floor(Date.now() / 1000)
  // TODO: end

  const sgs = db.getAllSga();
  for (let i = 0; i<sgs.length; i++) {
    const sg = sgs[i];
    if (sg.status === 7) {
      continue;
    }
    const groupId = sg.groupId;
    const config = await sgaContract.getStoremanGroupConfig(groupId);

    // TODO: is a current group
    const groupName = web3.utils.hexToString(groupId)
    const groupIdUint = new BigNumber(sg.groupId).toString(10)
    let isCurrentConfig = false
    if (process.env.NETWORK_TYPE !== 'testnet' || groupName.startsWith('dev_')) {
      if (config.startTime <= curTimestamp && config.endTime >= curTimestamp) {
        isCurrentConfig = true
      }
    }
    // TODO: end
    
    if (config) {
      // ignore empty gpk
      if (!config.gpk1 || !config.gpk2) {
        if (sg.status !== parseInt(config.status)) {
          writeToDB(config)
        }
        continue;
      }
      
      for(let j = 0; j<oracles.length; j++) {
        const oracle = oracles[j];
        // TODO: is need set current group
        if (isCurrentConfig) {
          if (curConfigs[j][0] !== groupIdUint && curConfigs[j][1] !== groupIdUint) {
            await oracle.setCurrentGroupIds([groupIdUint, curConfigs[j][0]])
          }
        }
        // TODO: end
        const config_eth = await oracle.getStoremanGroupConfig(groupId);
        // curve1 -> chain curve type
        const curve1 = !!oracle.chain.curveType ? oracle.chain.curveType : process.env[oracle.chain.core.chainType + '_CURVETYPE']
        // curve2 -> another curve type
        const curve2 = curve1 === config.curve1 ? config.curve2 : config.curve1
        const gpk1   = curve1 === config.curve1 ? config.gpk1 : config.gpk2
        const gpk2   = curve1 === config.curve1 ? config.gpk2 : config.gpk1
        
        if (!config_eth ||
          (config.groupId !== config_eth.groupId) ||
          (config.chain1 !== config_eth.chain2) ||
          (config.chain2 !== config_eth.chain1) ||
          (curve1 != config_eth.curve1) ||
          (curve2 != config_eth.curve2) ||
          (gpk1 != config_eth.gpk1) ||
          (gpk2 != config_eth.gpk2) ||
          (config.startTime !== config_eth.startTime) ||
          (config.endTime !== config_eth.endTime)
        ) {
          // chain1 -> chain2
          await oracle.setStoremanGroupConfig(
            groupId,
            config.status,
            config.deposit,
            [config.chain2, config.chain1],
            [curve1, curve2],
            gpk1,
            gpk2,
            config.startTime,
            config.endTime,
          );
          writeToDB(config)
        } else if (config.status !== config_eth.status) {
          await setStoremanGroupStatus(oracle, groupId, config.status);
          writeToDB(config)
        }
      }
    }
  }
  log.info(`syncConfigToOtherChain end`);
}

const bigZero = new BigNumber(0)
const isBtcDebtClean = async function(chainBtc, sg) {
  if (sg.curve1 === 0 || sg.curve2 === 0) {
    const gpk = sg.curve1 === 0 ? sg.gpk1 : sg.gpk2
    const balance = await chainBtc.core.getOneBalance(gpk)

    if (balance.gt(bigZero)) {
      return false
    } else {
      return true
    }
  }
  // 1 1 的是老store man
  return true
}
const isLtcDebtClean = async function(chainLtc, sg) {
  if (sg.curve1 === 0 || sg.curve2 === 0) {
    const gpk = sg.curve1 === 0 ? sg.gpk1 : sg.gpk2
    const balance = await chainLtc.core.getOneBalance(gpk)

    if (balance.gt(bigZero)) {
      return false
    } else {
      return true
    }
  }
  // 1 1 的是老store man
  return true
}

const xrpUnit = new BigNumber(Math.pow(10, 6))
const minXrpAmount = (new BigNumber('21')).multipliedBy(xrpUnit)
const isXrpDebtClean = async function(chainXrp, sg) {
  if (sg.curve1 === 0 || sg.curve2 === 0) {
    const gpk = sg.curve1 === 0 ? sg.gpk1 : sg.gpk2
    const address = xrp.pkToAddress(gpk)
    const balanceStr = await chainXrp.core.getBalance(address)

    const balance = new BigNumber(balanceStr)
    if (balance.lt(minXrpAmount)) {
      return true
    } else {
      return false
    }
  }
  // 1 1 的是老store man
  return true
}

// 10 * 10 ** 10
const minDotAmount = new BigNumber(process.env.MIN_DOT)
const isDotDebtClean = async function(sg) {
  if (sg.curve1 === 0 || sg.curve2 === 0) {
    const gpk = sg.curve1 === 0 ? sg.gpk1 : sg.gpk2
    const address = dot.longPubKeyToAddress(gpk)
    const balanceStr = await dot.getBalance(address)

    const balance = new BigNumber(balanceStr)
    if (balance.lt(minDotAmount)) {
      return true
    } else {
      return false
    }
  }
  return true
}

const syncIsDebtCleanToWan = async function(sgaWan, oracleWan, web3Quotas, chainBtc, chainXrp, chainLtc) {
  const time = parseInt(new Date().getTime() / 1000);
  // 0. 获取 wan chain 上活跃的 store man -- 记录在db里
  const sgs = db.getAllSga();
  for (let i = 0; i<sgs.length; i++) {
    const sg = sgs[i];
    const groupId = sg.groupId;
    const config = await sgaWan.getStoremanGroupConfig(groupId);

    const isDebtClean = await oracleWan.isDebtClean(groupId)
    if (isDebtClean) {
      continue
    }

    // const groupName = web3.utils.hexToString(groupId)
    // if (groupName !== 'dev_031' && groupName !== 'testnet_027') {
    //   continue
    // }

    const isDebtCleans = []
    let totalClean = 0
    let logStr = ''
    if (config.status === '6') {
      log.info('status is 6')
      for (let i = 0; i < web3Quotas.length; i++) {
        const quota = web3Quotas[i]
        const isDebtClean = await quota.isDebtClean(groupId)
        isDebtCleans.push(isDebtClean)
        if (isDebtClean) {
          totalClean ++
        }
        logStr += ` ${quota.chain.chainName} ${isDebtClean}`
      }
    }

    let isDebtClean_btc = false
    let isDebtClean_xrp = false
    let isDebtClean_ltc = false
    let isDebtClean_dot = false
    if (config.status >= 5) {
      if (time > config.endTime) {
        isDebtClean_btc = await isBtcDebtClean(chainBtc, sg)
        isDebtClean_xrp = await isXrpDebtClean(chainXrp, sg)
        isDebtClean_ltc = await isLtcDebtClean(chainLtc, sg)
        isDebtClean_dot = await isDotDebtClean(sg)
      }
    }
  
    // 4. 如果其他链上都debt clean， 则将debt clean状态同步到wanChain的oracle上
    if (isDebtClean_btc && isDebtClean_xrp && isDebtClean_ltc && isDebtClean_dot && totalClean === web3Quotas.length) {
      await oracleWan.setDebtClean(groupId, true);
    }

    log.info("isDebtClean smgId", groupId, "btc", isDebtClean_btc, "xrp", isDebtClean_xrp, "ltc", isDebtClean_ltc, "dot", isDebtClean_dot, logStr)
  }
}

module.exports = {
  createScanEvent,
  doSchedule,
  syncConfigToOtherChain,
  updatePrice_WAN,
  syncIsDebtCleanToWan
}
