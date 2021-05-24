const log = require('./lib/log');
const { sleep, web3 } = require('./lib/utils');
const logAndSendMail = require('./lib/email');
const ScanEvent = require('./scan_event');
const db = require('./lib/sqlite_db');
const xrp = require('./lib/xrp');
const { default: BigNumber } = require('bignumber.js');

const times = web3.utils.toBN(process.env.THRESHOLD_TIMES);
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

  const threshold = oracle.core.chainType === 'ETH' 
    ? web3.utils.toBN(process.env.THRESHOLD_ETH) 
    : web3.utils.toBN(process.env.THRESHOLD);
  
  if (pricesMap) {
    const symbols = Object.keys(pricesMap);

    if (symbols.length > 0) {
      const prePricesArray = await oracle.getValuesByArray(symbolsStringArray);

      const prePricesMap = {}
      symbolsStringArray.forEach((v,i) => {prePricesMap[v] = prePricesArray[i];})

      const needUpdateMap = {};
      const oldMap = {};
      const deltaMap = {}
      symbols.forEach(i => {
        const newPrice = web3.utils.toBN(pricesMap[i]);
        const oldPrice = web3.utils.toBN(prePricesMap[i]);

        if (oldPrice.cmp(zero) === 0) {
          needUpdateMap[i] = '0x' + newPrice.toString(16);
          oldMap[i] = '0';
          deltaMap[i] = 'infinity'
        } else {
          const deltaTimes = newPrice.sub(oldPrice).mul(times).div(oldPrice).abs();
          if (deltaTimes.cmp(threshold) > 0) {
            needUpdateMap[i] = '0x' + newPrice.toString(16);
            oldMap[i] = oldPrice.toString(10);
            deltaMap[i] = deltaTimes.toString(10);
          }
        }
      })

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

async function updatePrice_ETH(oracle, pricesMap) {
  const symbols = process.env.SYMBOLS_ETH.replace(/\s+/g,"").split(',')
  mergePrice(pricesMap, symbols, process.env.SYMBOLS_MAP_ETH)
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
  const sgs = db.getAllSga();
  for (let i = 0; i<sgs.length; i++) {
    const sg = sgs[i];
    const groupId = sg.groupId;
    const config = await sgaContract.getStoremanGroupConfig(groupId);
    let hasWriteDb = false
    if (config) {
      if ((sg.status !== parseInt(config.status)) ||
        (sg.deposit !== config.deposit)
      ) {
        writeToDB(config)
        hasWriteDb = true
      }
      if (!config.gpk1 || !config.gpk2) {
        continue;
      }
      
      for(let j = 0; j<oracles.length; j++) {
        const oracle = oracles[j];
        const config_eth = await oracle.getStoremanGroupConfig(groupId);
        if (config.curve1 === '1' && config.curve2 === '1') {
          if (!config_eth ||
            (config.groupId !== config_eth.groupId) ||
            (config.chain1 !== config_eth.chain2) ||
            (config.chain2 !== config_eth.chain1) ||
            (config.curve1 !== config_eth.curve2) ||
            (config.curve2 !== config_eth.curve1) ||
            (config.gpk1 !== config_eth.gpk2) ||
            (config.gpk2 !== config_eth.gpk1) ||
            (config.startTime !== config_eth.startTime) ||
            (config.endTime !== config_eth.endTime)
          ) {
            // chain1 -> chain2
            await oracle.setStoremanGroupConfig(
              groupId,
              config.status,
              config.deposit,
              [config.chain2, config.chain1],
              [config.curve2, config.curve1],
              config.gpk2,
              config.gpk1,
              config.startTime,
              config.endTime,
            );
            if (!hasWriteDb) writeToDB(config)
          } else if (config.status !== config_eth.status) {
            await setStoremanGroupStatus(oracle, groupId, config.status);
            if (!hasWriteDb) writeToDB(config)
          }
        } else {
          const curve1 = process.env[oracle.chain.core.chainType + '_CURVETYPE']
          const curve2 = curve1 === config.curve1 ? config.curve2 : config.curve1
          const gpk1 = config.curve1 === curve1 ? config.gpk1 : config.gpk2
          const gpk2 = gpk1 === config.gpk1 ? config.gpk2 : config.gpk1
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
            if (!hasWriteDb) writeToDB(config)
          } else if (config.status !== config_eth.status) {
            await setStoremanGroupStatus(oracle, groupId, config.status);
            if (!hasWriteDb) writeToDB(config)
          }
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

const syncIsDebtCleanToWan = async function(oracleWan, quotaWan, quotaEth, quotaBsc, chainBtc, chainXrp, chainLtc) {
  const time = parseInt(new Date().getTime() / 1000);
  // 0. 获取 wan chain 上活跃的 store man -- 记录在db里
  const sgs = db.getAllSga();
  for (let i = 0; i<sgs.length; i++) {
    const sg = sgs[i];
    const groupId = sg.groupId;

    const isDebtClean = await oracleWan.isDebtClean(groupId)
    if (isDebtClean) {
      continue
    }

    let isDebtClean_wan = false
    let isDebtClean_eth = false
    let isDebtClean_bsc = false
    if (sg.status === 6) {
      console.log('status is 6')
      isDebtClean_wan = await quotaWan.isDebtClean(groupId)
      isDebtClean_eth = await quotaEth.isDebtClean(groupId)
      isDebtClean_bsc = await quotaBsc.isDebtClean(groupId)
    }

    let isDebtClean_btc = false
    let isDebtClean_xrp = false
    let isDebtClean_ltc = false
    if (sg.status >= 5) {
      if (time > sg.endTime) {
        isDebtClean_btc = await isBtcDebtClean(chainBtc, sg)
        isDebtClean_xrp = await isXrpDebtClean(chainXrp, sg)
        isDebtClean_ltc = await isLtcDebtClean(chainLtc, sg)
      }
    }
  
    // 4. 如果其他链上都debt clean， 则将debt clean状态同步到wanChain的oracle上
    if (isDebtClean_wan && isDebtClean_eth && isDebtClean_bsc && isDebtClean_btc && isDebtClean_xrp && isDebtClean_ltc) {
      await oracleWan.setDebtClean(groupId, true);
      log.info("smgId", groupId, "wan", isDebtClean_wan, "eth", isDebtClean_eth, "bsc", isDebtClean_bsc, "btc", isDebtClean_btc, "xrp", isDebtClean_xrp, "ltc", isDebtClean_ltc)
    }
  }
}

module.exports = {
  createScanEvent,
  doSchedule,
  // updateWanPrice,
  // syncPriceToOtherChain,
  syncConfigToOtherChain,
  updatePrice_WAN,
  updatePrice_ETH,
  syncIsDebtCleanToWan
}
