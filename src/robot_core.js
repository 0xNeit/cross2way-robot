"use strict"
const log = require('./lib/log');
const { sleep, web3, promisify, getSmgIsDebtCleans, getSmgConfigs, getTokenPairIds, getTokenPairDetails,  } = require('./lib/utils');
const logAndSendMail = require('./lib/email');
const ScanEvent = require('./scan_event');
const db = require('./lib/sqlite_db');
// const xrp = require('./lib/xrp');
// const dot = require('./lib/dot');
// const btc = require('./lib/btc');
// const ltc = require('./lib/ltc');
const { gNccChains, gNccChainTypes } = require('./lib/ncc_chains')
const xrp = gNccChains['XRP']
const dot = gNccChains['DOT']
const btc = gNccChains['BTC']
const ltc = gNccChains['LTC']
const { default: BigNumber } = require('bignumber.js');
const { aggregate } = require('@makerdao/multicall');
const getCryptPrices = require('./lib/crypto_compare')
const nccConfigs = require('./lib/configs-ncc');

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
      log.warn(`${func.name} exception : `, e);
      await sleep(parseInt(process.env.SCHEDULE_RETRY_INTERVAL));
    }
  }
}

const batchGetSmgConfigs = async (oracleWan, sgaWan, sgs, smgConfigs, isDebtCleans) => {
  if (sgaWan.chain.multiCall) {
    if (isDebtCleans) {
      await getSmgIsDebtCleans(oracleWan, sgs, isDebtCleans)
    }
    await getSmgConfigs(sgaWan, sgs, smgConfigs, isDebtCleans)
  } else {
    for (let i = 0; i<sgs.length; i++) {
      const sg = sgs[i];
      const groupId = sg.groupId;
      const config = await sgaWan.getStoremanGroupConfig(groupId);
      if (isDebtCleans) {
        const isDebtClean = await oracleWan.isDebtClean(groupId)
        isDebtCleans[groupId] = isDebtClean
      }
      smgConfigs[groupId] = config
    }
  }
}

// const batchGetSmgDebtClean = async (oracleWan, sgaWan, sgs, isDebtCleans) => {
//   if (sgaWan.chain.multiCall) {
//     await getSmgIsDebtCleans(oracleWan, sgs, isDebtCleans)
//   } else {
//     for (let i = 0; i<sgs.length; i++) {
//       const sg = sgs[i];
//       const groupId = sg.groupId;
//       const isDebtClean = await oracleWan.isDebtClean(groupId)
//       isDebtCleans[groupId] = isDebtClean
//     }
//   }
// }

// const getBalance = async (chain, groupId, address, asset) => {
//   const balance = await chain.getBalance(address)
//   asset[groupId] = balance
// } 

// const batchGetLockAssetRequest = (sgs, lockAssets) => {
//   const promises = []
//   const chains = gNccChains
//   const chainTypes = gNccChainTypes

//   for (let i = 0; i < chainTypes.length; i++) {
//     const chainType = chainTypes[i]
//     lockAssets[chainType] = {}
//     for (let j = 0; j < sgs.length; j++) {
//       const sg = sgs[j]
//       const groupId = sg.groupId
//       const chain = chains[chainType].chain
//       const address = chain.getP2PKHAddress(sg.gpk2)
//       promises.push(getBalance(chain, groupId, address, lockAssets[chainType]))
//     }
//   }
//   return promises
// }

async function updatePrice(oracle, pricesMap, symbolsStringArray) {
  log.info(`updatePrice ${oracle.core.chainType} begin`);

  const threshold = web3.utils.toBN(process.env.THRESHOLD);
  const maxThreshold = web3.utils.toBN(process.env.MAXTHRESHOLD);
  const maxThresholdCmp = web3.utils.toBN(process.env.MAXTHRESHOLD_CMP);
  
  if (pricesMap) {
    const symbols = Object.keys(pricesMap);

    if (symbols.length > 0) {
      // // TODO: remove
      // symbolsStringArray.push('FNX')
      
      const prePricesArray = await oracle.getValuesByArray(symbolsStringArray);

      const prePricesMap = {}
      symbolsStringArray.forEach((v,i) => {prePricesMap[v] = prePricesArray[i];})

      let cryptoPriceMap = null

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
                cryptoPriceMap = await getCryptPrices(process.env.SYMBOLS_3RD.replace(/\s+/g,""))
                mergePrice(cryptoPriceMap, null, process.env.SYMBOLS_MAP)
              }
              
              if (cryptoPriceMap[it]) {
                const newCryptoPrice = web3.utils.toBN(cryptoPriceMap[it])
                // 两个新的价格做差 > 5%, 则非法
                const cryptoDeltaTimes = newCryptoPrice.sub(newPrice).mul(thresholdTimes).div(newPrice).abs();
      
                if (cryptoDeltaTimes.gt(maxThresholdCmp)) { 
                  log.warn(`crypto coingecko ${it} price conflict ${newCryptoPrice.toString(10)}, ${newPrice.toString(10)}`)
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
      if (symbolsOld) {
        symbolsOld.push(kv[0])
      }
    }
  })
}

async function updatePrice_WAN(oracle, pricesMap) {
  const symbols = (process.env.SYMBOLS_3RD + ',' + process.env.SYMBOLS_SWAP).replace(/\s+/g,"").split(',')
  mergePrice(pricesMap, symbols, process.env.SYMBOLS_MAP)
  await updatePrice(oracle, pricesMap, symbols)
}

// async function updateDeposit(oracle, smgID, amount) {
//   log.info(`updateDeposit`);
//   const amountHex = "0x" + web3.utils.toBN(amount).toString('hex');
//   await oracle.updateDeposit(smgID, amountHex);
// }

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

function isConfigEqual(config, config2, bStatus = false) {
  if ((config.groupId !== config2.groupId) ||
    (config.chain1 !== config2.chain2) ||
    (config.chain2 !== config2.chain1) ||
    (config.curve1 !== config2.curve1) ||
    (config.curve2 !== config2.curve2) ||
    (config.gpk1 !== config2.gpk1) ||
    (config.gpk2 !== config2.gpk2) ||
    (config.startTime !== config2.startTime) ||
    (config.endTime !== config2.endTime)) {
      return false
    }
    if (bStatus) {
      if (config.status !== config2.status) {
        return false
      }
    }
    return true
}

async function syncConfigToOtherChain(sgaContract, oracles, isPart = false) {
  log.info(`syncConfigToOtherChain begin`);

  // set current storeMan group 
  // const currentGroupIdKey1 = web3.utils.keccak256('MULTICOINSTAKE_RESERVED_KEY____1')
  // const currentGroupIdKey2 = web3.utils.keccak256('MULTICOINSTAKE_RESERVED_KEY____2')
  const curConfigs = []
  for (let j = 0; j < oracles.length; j++) {
    try {
      const configs = await oracles[j].getCurrentGroupIds()
      curConfigs.push(configs)
    } catch(e) {
      log.error(`getCurrentGroupIds chain ${oracles[j].chain.core.chainType} failed`, e)
      throw e
    }
  }

  const sgs = db.getActiveSga()
  const smgConfigs = {}
  await batchGetSmgConfigs(null, sgaContract, sgs, smgConfigs)

  const sgsValid = sgs.filter(sg => {
    const config = smgConfigs[sg.groupId]
    const status = parseInt(config.status)
    if (status < 5) {
      return false
    }
    return true
  })

  const promises = []
  const chainSmgConfigs = {}
  for(let j = 0; j<oracles.length; j++) {
    const index = j
    const o = oracles[index]
    chainSmgConfigs[o.chain.chainType] = {}
    promises.push(batchGetSmgConfigs(o, o, sgsValid, chainSmgConfigs[o.chain.chainType]))
  }
  await Promise.all(promises)

  for (let i = 0; i<sgs.length; i++) {
    const sg = sgs[i];
    if (sg.status === 7) {
      continue;
    }
    const groupId = sg.groupId;
    const config = smgConfigs[groupId];

    if (config) {
      const status = parseInt(config.status)

      // is a current group
      const groupName = web3.utils.hexToString(groupId)
      const groupIdUint = new BigNumber(sg.groupId).toString(10)
      let isCurrentConfig = false
      if (process.env.NETWORK_TYPE !== 'testnet' || groupName.startsWith('dev_')) {
        if (status === 5) {
          isCurrentConfig = true
        }
      }
      // end
    
      // ignore empty gpk
      if (!config.gpk1 || config.gpk1 === '0x' || !config.gpk2 || config.gpk2 === '0x') {
        if (sg.status !== status) {
          writeToDB(config)
        }
        continue;
      }
      let needWriteToDb = false
      for(let j = 0; j<oracles.length; j++) {
        const oracle = oracles[j];
        // is need set current group
        if (isCurrentConfig) {
          if (curConfigs[j][0] !== groupIdUint && curConfigs[j][1] !== groupIdUint) {
            await oracle.setCurrentGroupIds([groupIdUint, curConfigs[j][0]])
          }
        }
        // end
        // const config_eth = await oracle.getStoremanGroupConfig(groupId);
        const config_eth = chainSmgConfigs[oracle.chain.chainType][groupId];
        // curve1 -> chain curve type
        const curve1 = !!oracle.chain.curveType ? oracle.chain.curveType : process.env[oracle.chain.core.chainType + '_CURVETYPE']
        // curve2 -> another curve type
        const curve2 = curve1 === config.curve1 ? config.curve2 : config.curve1
        const gpk1   = curve1 === config.curve1 ? config.gpk1 : config.gpk2
        const gpk2   = curve1 === config.curve1 ? config.gpk2 : config.gpk1
        const newConfig = {
          ...config,
          curve1,
          curve2,
          gpk1,
          gpk2
        }
        
        if (!config_eth || !isConfigEqual(newConfig, config_eth)) {
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
          needWriteToDb = true
        } else if (config.status !== config_eth.status) {
          await setStoremanGroupStatus(oracle, groupId, config.status);
          needWriteToDb = true
        } else {
          // 如果wan上配置和其他链上的相等,则比较下数据库和链上
          const status = parseInt(newConfig.status)
          if (status !== sg.status) {
            needWriteToDb = true
          }
        }
      }
      
      if (needWriteToDb) {
        writeToDB(config)
      }
    } else {
      log.error(`can't get store man group ${groupId} config on wan chain`)
    }
  }
  log.info(`syncConfigToOtherChain end`);
}

/*
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
// export enum PolkadotSS58Format {
// 	polkadot = 0,
// 	kusama = 2,
// 	westend = 42,
// 	substrate = 42,
// }
const minDotAmount = new BigNumber(process.env.MIN_DOT)
const isDotDebtClean = async function(sg) {
  if (sg.curve1 === 0 || sg.curve2 === 0) {
    const gpk = sg.curve1 === 0 ? sg.gpk1 : sg.gpk2
    const address = dot.pkToAddress(gpk, process.env.NETWORK_TYPE)
    const balanceStr = await dot.chain.getBalance(address)

    const balance = new BigNumber(balanceStr)
    if (balance.lt(minDotAmount)) {
      return true
    } else {
      return false
    }
  }
  return true
}

const syncIsDebtCleanToWan_old = async function(sgaWan, oracleWan, web3Quotas, chainBtc, chainXrp, chainLtc) {
  const time = Math.floor(new Date().getTime() / 1000);
  // 0. 获取 wan chain 上活跃的 store man -- 记录在db里
  const sgs = db.getAllSga();
  for (let i = 0; i<sgs.length; i++) {
    const sg = sgs[i];
    const groupId = sg.groupId;
    // TODO: 注意链上获取的是string, 数据库里保存的是int,以后应该统一到string
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
    const status = parseInt(config.status)
    if (status === 6) {
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
    if (status >= 5) {
      const endTime = parseInt(config.endTime)
      if (time > endTime) {
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
*/

function getMapTm(web3Tms, toChainId) {
  const tm = web3Tms.find(tm => {
    return tm.core.bip44 === toChainId
  })
  if (!tm) {
    return null
  }
  return tm;
}

// btc => chains
const getNccTokenChainTypeMap = () => {
  const tokenChainMap = {}
  const chainTypes = Object.keys(nccConfigs)
  chainTypes.forEach(chainType => {
    const symbol = nccConfigs[chainType][process.env.NETWORK_TYPE].symbol
    tokenChainMap[symbol] = chainType
  })

  return tokenChainMap
}

// 
let gTokenPairs = {}
let gMappingTokenMap = {}
let gTokenPairsCount = 0
let gNccTokenChainTypeMap = getNccTokenChainTypeMap()
async function getTokenPairsInfo(tm, total, web3Tms) {
  if (gTokenPairsCount === total) {
    return {
      tokenPairs: gTokenPairs,
      mappingTokenMap: gMappingTokenMap,
    }
  }

  const tokenPairs = {}
  const mappingTokenMap = {}

  Object.keys(gNccTokenChainTypeMap).forEach(symbol => {mappingTokenMap[symbol] = {}})

  if (tm.chain.multiCall) {
    const ids = {}
    // get ids
    await getTokenPairIds(tm, total, ids, tokenPairs)

    await getTokenPairDetails(tm, total, ids, tokenPairs, (tokenPair, id) => {
      if (mappingTokenMap[tokenPair.symbol]) {
        const toChainID = tokenPair.toChainID
        const tm2 = getMapTm(web3Tms, parseInt(toChainID))
        mappingTokenMap[tokenPair.symbol][tm2.chain.chainType] = tm2.chain.loadContractAt('MappingToken', tokenPair.toAccount.toLowerCase())
      }
    })
  } else {
    for(let i=0; i<total; i++) {
      const id = parseInt(await tm.mapTokenPairIndex(i));
      const tokenPairInfo = removeIndexField(await tm.getTokenPairInfo(id));
      const ancestorInfo = removeIndexField(await tm.getAncestorInfo(id));
      const tokenInfo = removeIndexField(await getMapTm(web3Tms, parseInt(tokenPairInfo.toChainID)).getTokenInfo(id))
      const tokenPair = {id: id}
      
      Object.assign(tokenPair, ancestorInfo, tokenPairInfo, 
        {mapName: tokenInfo.name, mapSymbol: tokenInfo.symbol, mapDecimals: tokenInfo.decimals});
      tokenPairs[id] = tokenPair;

      if (mappingTokenMap[tokenPair.symbol]) {
        const toChainID = tokenPair.toChainID
        const tm2 = getMapTm(web3Tms, parseInt(toChainID))
        mappingTokenMap[tokenPair.symbol][tm2.chain.chainType] = tm2.chain.loadContractAt('MappingToken', tokenPairInfo.toAccount.toLowerCase())
      }
    }
  }

  gTokenPairs = tokenPairs
  gMappingTokenMap = mappingTokenMap
  gTokenPairsCount = total
  return {
    tokenPairs,
    mappingTokenMap,
  }
}

// chain symbol => mappingToken contract
const getMappingTokenMap = async (web3Tms) => {
  const tmWan = web3Tms.find(tm => tm.chain.chainType === 'WAN')
  const total = parseInt(await tmWan.totalTokenPairs())
  // 获取storeMan, 支持的所有非合约链的token, 获取token对应的多个mapToken
  const { mappingTokenMap } = await getTokenPairsInfo(tmWan, total, web3Tms)

  return mappingTokenMap
}

const getDebts = () => {
  const debts = {}
  const allDebts = db.getAllDebt()
  for (let i = 0; i < allDebts.length; i++) {
    const debt = allDebts[i];
    if (!debts[debt.groupId]) {
      debts[debt.groupId] = {}
    }
    if (!debts[debt.groupId][debt.chainType]) {
      debts[debt.groupId][debt.chainType] = {}
    }

    debts[debt.groupId][debt.chainType] = {
      isDebtClean: debt.isDebtClean,
      totalSupply: debt.totalSupply,
      totalReceive: debt.totalReceive,
      lastReceiveTx: debt.lastReceiveTx,
    }
  }
  return debts
}

/*
const suppliesArrayToMap = (allSupplies) => {
  const supplies = {}
  allSupplies.forEach(supply => {
    if (!supplies[supply.chainType]) {
      supplies[supply.chainType] = {}
    }
    supplies[supply.chainType][supply.mapChainType] = supply
  })
  return supplies
}

const balancesArrayToMap = (allBalances) => {
  const balances = {}
  allBalances.forEach(balance => {
    if (!balances[balance.chainType]) {
      balances[balance.chainType] = balance
    }
  })
  return balances
}

// 获取某smg的所有资产的所有mapToken的totalSupply, 如果不存在,则初始化数据库
const getOrInitSupplies = async(groupId, tms, expectTime) => {
  let supplies = null
  const allSupplies = db.getSuppliesByGroupId({ groupId })
  // 没有过? 则初始化数据库VB  BN
  if (allSupplies.length === 0) {
    supplies = {}
    const mappingTokenMap = await getMappingTokenMap(tms)

    const initSuppliesDb = db.db.transaction((supplies, groupId, expectTime, mappingTokenMap) => {
      for (let symbol in mappingTokenMap) {
        const chainType = gNccTokenChainTypeMap[symbol]
        // ['BTC', 'LTC']
        if (!gNccChainTypes.find(i => i === chainType)) {
          // 如果还不支持, 则继续
          continue
        }
        // is support this chainType
        supplies[chainType] = {}
        const tokens = mappingTokenMap[symbol]
        for (let mapChainType in tokens) {
          const token = tokens[mapChainType]
          const address = token.address.toLowerCase()
          console.log(`mappingTokenMap ${groupId} ${chainType} ${mapChainType} ${expectTime}`)
          supplies[chainType][mapChainType] = db.modifySupply(groupId, chainType, mapChainType, address, expectTime)
          console.log(`mappingTokenMap2 ${JSON.stringify(supplies[chainType][mapChainType], null, 2)}`)
        }
      }
    })

    // 初始化db
    initSuppliesDb(supplies, groupId, expectTime, mappingTokenMap)
  } else {
    supplies = suppliesArrayToMap(allSupplies)
  }
  return supplies
}

// 获取某smg的所有资产的balance
const getOrInitBalances = async(sgs, groupId, expectTime) => {
  let balances = null
  const allBalances = db.getBalancesByGroupId({ groupId })
  if (allBalances.length === 0) {
    balances = {}
    // 初始化db
    const initBalanceDb = db.db.transaction((sgs, balances, groupId, expectTime) => {
      gNccChainTypes.forEach(chainType => {
        balances[chainType] = {}
        const chain = gNccChains[chainType].chain
        const address = chain.getAddressFromSmgId(groupId, sgs)
        console.log(`getOrInitBalances ${groupId} ${chainType} ${address} ${expectTime}`)
        balances[chainType] = db.modifyBalance(groupId, chainType, address, expectTime)
        console.log(`getOrInitBalances ${JSON.stringify(balances[chainType], null, 2)}`)
      })
    })
    
    initBalanceDb(sgs, balances, groupId, expectTime)
  } else {
    balances = balancesArrayToMap(allBalances)
  }
  return balances
}
*/

// 获取要检查的债务
const tryInitDebts = async(time) => {
  const sgs = db.getActiveSga();
  const debts = getDebts()

  const initDebtDb = db.db.transaction((sgs, time, debts) => {
    for (let i = 0; i < sgs.length; i++) {
      const sg = sgs[i]
      const groupId = sg.groupId
  
      if (sg.status >= 5) {
        if (time > sg.endTime) {
          if(!debts[groupId]) {
            debts[groupId] = {}
            gNccChainTypes.forEach((chainType) => {
              const newDebt = db.modifyDebt(groupId, chainType)
              debts[groupId][chainType] = newDebt
            })
          }
        }
      }
    }
  })

  initDebtDb(sgs, time, debts)

  return debts
}

/*
// save store man group's assets balance at the expectTime (sg.endTime)
const syncBalance = async (balances, groupId, _expectTime) => {
  if (!balances[groupId]) {
    balances[groupId] = {}
  }

  const mappingTokenMap = await getMappingTokenMap()
  const oldBalance = db.getAllBalance({groupId})

  let expectTime = _expectTime
  if (oldBalance.length > 0) {
    expectTime = oldBalance[0].expectTime
  }
  balances[groupId] = {}

  // storeMan的所有支持的token
  for (let symbol in mappingTokenMap) {
    const chainType = gNccTokenChainTypeMap[symbol]
    const oldSmgBalance = oldBalance.find(i => i.groupId === groupId && i.chainType === chainType)
    let smgBalance = oldSmgBalance
    if (!oldSmgBalance) {
      smgBalance = db.modifyBalance(groupId, chainType)
    }

    balances[groupId][chainType] = smgBalance
  }
  
  return balances
}

// save one asset's all mapTokens' totalSupply at a store man group's expectTime (sg.endTime)
const syncSupply = async (web3Tms, groupId, expectTime) => {
  if (!supplies) { supplies = []}

  const mappingTokenMap = await getMappingTokenMap(web3Tms)

  for (let symbol in mappingTokenMap) {
    if (!supplies[groupId]) {

    }
    const chainType = gNccTokenChainTypeMap[symbol]

    if (!supplies[groupId][chainType]) supplies[groupId][chainType] = {}

    const tokens = mappingTokenMap[symbol]
    for (let mapChainType in tokens) {
      
      let info = supplies[groupId][chainType][mapChainType]

      if (!info) {
        const token = tokens[mapChainType]
        const address = token.address.toLowerCase()
        
        setTimeout(async (groupId, chainType, mapChainType, expectTime, address, token) => {
          const blockNumber = await token.chain.getBlockNumber()
          const totalSupply = await token.getFun('totalSupply')

          log.info(`${symbol} token in chain ${mapChainType} totalSupply = ${totalSupply}`)
          db.modifySupply()
        }, 0)
      }
    }
  }

  return supplies[groupId]
}
*/

// 判断债务是该设置为已清空
// 1. 每天12点记录(数据库debt表)到期的storeMan各个币种的债务, 如果已经记录过某个storeMan,就不记录了
//    syncDebt
// 2. 各个币,扫链,把新storeMan所有接收钱的消息
//    scanMessages: [ ReceiveMessage ]
// 3. 处理收到的消息, 保存到msg表
//    handleMessages (处理完消息, 更新scan到的blockNumber到数据库)
// 4. 获取没有clean,且收到平账消息的债务项,检查余额为0,检查总资产是否大于mapToken
// 5. 如果该storeMan的所有币债务都被清空, 且余额为0, 则设置isDebtClean为true
//    syncIsDebtCleanToWan

// 第1步, 同步债务, 如果storeMan到了endTime, 我们获取原生币的所有各个mapToken的totalSupply之和作为该原生币的总债务

// 方案 1.原理 当前同时结算的某资产(比如btc)的smg的共同债务为
// btc的mapToken的总totalSupply - 状态为5的smg(除去儿子)的btc资产  - 处于结算中(状态为6)但非这个时间点结算的共同btc债务
// 之前为了方便验证扫描到转账交易大于债务, 采取的是类似这种方案, 但情况比较复杂
// 
// 方案 2. 原理 当旧组发生资产转移时,
// 验证 
// a. 状态为 5,6的smg的总资产 > 总mapToken
// b. 旧组的资产为 0
// 这种的基本能保证正确, 感觉也没啥问题, 目前正把方案切到这上面
// 1. 每天12点记录

// 第一步, 首先,到endTime后,第一时间,记录需要监测的smg的债务种类
const syncDebt = async function() {
  const time = Math.floor(new Date().getTime() / 1000);

  tryInitDebts(time)
}

// 第4步, 获取没有clean且,收到平账消息的债务项,检查balance是否为0,检查总资产是否大于mapToken
// const checkDebtClean = async function(sgaWan, oracleWan, web3Tms) {
const checkDebtClean = async function(web3Tms) {
  const debts = db.getUncleanDebts()
  const sgs = db.getActiveSga();
  const sgsWorking = sgs.filter(sg => sg.status === 5)

  for (let i = 0; i < debts.length; i++) {
    const debt = debts[i]
    const chain = gNccChains[debt.chainType].chain
    const sg = sgs.find(s => s.groupId === debt.groupId)
    // TODO: curveType === 0 时, 用gpk2, 
    const address = chain.getP2PKHAddress(sg.gpk2)
    const balance = BigNumber(await chain.getBalance(address))
    const minBalance = BigNumber(chain.minBalance)
    if (balance.gt(minBalance)) {
      log.error(`balance not 0! ${debt.groupId} ${debt.chainType} ${address} ${balance}`)
      continue
    } else {
      log.info(`balance is 0, ${debt.groupId} ${debt.chainType} ${address}`)
    }
    
    let assetsBalance = BigNumber(0)
    for (let j = 0; j < sgsWorking.length; j++) {
      const s = sgsWorking[j]
      const address = chain.getP2PKHAddress(s.gpk2)
      const b = await chain.getBalance(address)
      log.info(`${address} ${debt.chainType} asset balance is ${b.toString(10)}`)
      assetsBalance = assetsBalance.plus(b)
    }

    // 
    let totalSupply = BigNumber(0)
    const mappingTokenMap = await getMappingTokenMap(web3Tms)

    for (let symbol in mappingTokenMap) {
      const chainType = gNccTokenChainTypeMap[symbol]
      if (chainType !== debt.chainType) {
        continue
      }

      const tokens = mappingTokenMap[symbol]
      for (let mapChainType in tokens) {
        const token = tokens[mapChainType]
        const address = token.address.toLowerCase()
        const supply = await token.getFun('totalSupply')
        log.info(`${chainType} ${address} ${mapChainType} token supply is ${supply}`)
        totalSupply = totalSupply.plus(supply)
      }
      break
    }
    if (assetsBalance.gte(totalSupply)) {
      debt.isDebtClean = 1
      debt.totalSupply = totalSupply.toString(10)
      debt.totalReceive = assetsBalance.toString(10)
      db.modifyDebt(debt.groupId, debt.chainType, debt)
      log.info(`debt is good ${debt.groupId} ${debt.chainType} debt = ${totalSupply.toString(10)}, asset = ${assetsBalance.toString(10)}`)
    } else {
      log.info(`debt is bad ${debt.groupId} ${debt.chainType} debt = ${totalSupply.toString(10)}, asset = ${assetsBalance.toString(10)}`)
    }
  }
}

/*
const checkDebt2 = async function(sgaWan, oracleWan, web3Tms) {
  const time = Math.floor(new Date().getTime() / 1000);
  const isDebtCleans = {}
  const smgConfigs = {}

  // 获取数据库中的smg
  const sgs = db.getActiveSga();

  // 获取结算中的smg

  // 获取他们的balance
  getOrInitBalances(sgs, )

  // // 获取数据库中状态为4且startTime > time 的smg的状态, 如果status为5, 且gpk有值
  // const dirtySgs = sgs.filter(i => i.status === 4 && startTime < time)
  // const smgConfigsStr = {}
  // if (dirtySgs.length > 0) {
  //   await batchGetSmgConfigs(oracleWan, sgaWan, dirtySgs, smgConfigsStr, isDebtCleans)

  //   if (smgConfigsStr[groupId].status === '5') {
      
  //   }
  //   // for (let groupId in smgConfigsStr) {
  //   //   smgConfigs[groupId] = db.smgConfigToDbObj(smgConfigsStr[groupId])
  //   // }
  // }

  // 获取活跃的smg的btc的总量
  // 获取对应的总债务

  saveLiquidSgs(liquidSgs)
  for (let i = 0; i < sgs.length; i++) {
    const sg = sgs[i]
    const groupId = sg.groupId
    const isDebtClean = isDebtCleans[groupId]
    if (isDebtClean) {
      continue
    }

    if (sg.status >= 5) {
      if (time > sg.endTime) {
        // 这些才是需要关注的
        // 一次性生成debt表
        if(!debts[sg.groupId]) {
          debts[sg.groupId] = {}
          gNccChainTypes.forEach((groupId, chainType) => {
            const newDebt = db.modifyDebt(groupId, chainType)
            debts[groupId][chainType] = newDebt
          })
        }
      }
    }
  }
}
*/

/*
const syncDebt_old = async function(sgaWan, oracleWan, web3Tms) {
  const time = Math.floor(new Date().getTime() / 1000);
  const sgs = db.getActiveSga();
  const debts = getDebts()
  const isDebtCleans = {}
  const smgConfigs = {}


  const smgConfigsStr = {}
  await batchGetSmgConfigs(oracleWan, sgaWan, sgs, smgConfigsStr, isDebtCleans)
  for (let groupId in smgConfigsStr) {
    smgConfigs[groupId] = db.smgConfigToDbObj(smgConfigsStr[groupId])
  }

  // 根据链上数据,获取非终结的,且状态大于5的
  const sgsValid = []
  Object.keys(smgConfigs).forEach(groupId => {
    const sg = smgConfigs[groupId]
    if (isDebtCleans[sg.groupId]) {
      return false
    }

    const status = parseInt(sg.status)
    if (status >= 5 && status <= 6) {
      if (sg.gpk2.length !== 130) {
        log.error(`sg ${sg.groupId} gpk2 length !== 130`)
        return false
      }
      sgsValid.push(sg)
      return true
    }

    return false
  })

  // 获取活着的sg A
  const sgsAlive = sgsValid.filter(sg => {
    if (sg.startTime <= time && sg.endTime >= time) {
      if (sg.status === 5) {
        return true
      }
    }
    return false
  })

  // 获取处于清算中的 B
  const liquidSgs = sgsValid.filter(sg => {
    if (time > sg.endTime) {
      if (sg.status >= 5 && sg.status <= 6) {
        return true
      }
    }
    return false
  })

  // 找到清算中的 数据库中的 儿子们
  const liquidSgsDb = {}
  liquidSgs.forEach(lsg => {
    const sg = sgs.find(item => item.preGroupId === lsg.groupId)
    if (sg) {
      liquidSgsDb[sg.groupId] = sg
    }
  })

  // 获取处于清算中的 活跃的儿子们 C
  const liquidSgsSon = sgsAlive.filter(sg => {
    if (liquidSgsDb[sg.groupId]) {
      return true
    }
    return false
  })

  // 获取活跃的, 非清算中的儿子的 D
  const otherAliveSgs = sgsAlive.filter(sg => {
    if (liquidSgsSon.find(i => i.groupId === sg.groupId)) {
      return false
    }
    return true
  })

  // 处于清算中的 按支持的链, 如果没有初始化过, 将其初始化进debt表里
  const saveLiquidSgs = db.db.transaction((sgs) => {
    sgs.forEach(sg => {
      const groupId = sg.groupId
      gNccChainTypes.forEach(chainType => {
        if ( !debts[groupId] ) {
          debts[groupId] = {}
        }
        if (!debts[groupId][chainType]) {
          const newDebt = db.modifyDebt(groupId, chainType)
          debts[groupId][chainType] = newDebt
        }
      })
    })
  })
  saveLiquidSgs(liquidSgs)

  let lockAssets = null
  // 获取活跃的(且非清算中的儿子们)的balance D 的 balance
  const getOtherLockAssets = (symbol, groupId, lockAssets) => {
    const assets = lockAssets[symbol]
    const balance = Object.keys(assets).reduce((sum, gId) => {
      if (gId !== groupId) {
        return sum.plus(BigNumber(assets[gId]))
      } else {
        return sum
      }
    }, BigNumber(0))
    return balance.toString(10)
  }

  for (let i = 0; i<sgs.length; i++) {
    const sg = sgs[i];
    const groupId = sg.groupId;
    const config = smgConfigs[groupId];
    const isDebtClean = isDebtCleans[groupId]
    if (isDebtClean) {
      continue
    }

    // 测试网, 只关注dev_开头的storeMan
    // const groupName = web3.utils.hexToString(groupId)
    // if (process.env.NETWORK_TYPE !== 'testnet' || groupName.startsWith('dev_')) {
      if (config.status >= 5) {
        if (time > config.endTime) {
          log.info("isDebtClean2 time > endTime smgId", groupId)
          const debtToSave = {}
          debtToSave[groupId] = {}
          if (!debts[groupId]) {
            debts[groupId] = {}
          }
  
          const mappingTokenMap = await getMappingTokenMap()
          // storeMan的所有支持的token
          for (let symbol in mappingTokenMap) {
            const chainType = gNccTokenChainTypeMap[symbol]
            const oldDebt = debts[groupId][chainType]
            // if total debt is already exist in db, pass
            if (oldDebt && oldDebt.totalSupply !== '') {
              continue
            }

            const chainTokenMap = mappingTokenMap[symbol]

            let totalDebt = BigNumber(0)
            // 每个支持的token,对应很多个mapToken, 累加起来这些mapToken的totalSupply,为总的债务
            for (let chainSymbol in chainTokenMap) {
              const totalSupply = await chainTokenMap[chainSymbol].getFun('totalSupply')
              log.info(`${symbol} token in chain ${chainSymbol} totalSupply = ${totalSupply}`)
              totalDebt = totalDebt.plus(totalSupply)
            }
            if (process.env.NETWORK_TYPE === 'testnet') {
              // TODO: 减去别人的lockAccount金额, 这个貌似不能用getBalance获取啊
              if (!lockAssets) {
                lockAssets = {}
                const promises = batchGetLockAssetRequest(otherAliveSgs, lockAssets)
                await Promise.all(promises)
              }
  
              const otherDebt = getOtherLockAssets(chainType, groupId, lockAssets)
              // const ourAsset = lockAssets[chainType][groupId]
              let ourDebt = totalDebt.minus(otherDebt)
              if (totalDebt.comparedTo(otherDebt) < 0) {
                log.warn(`totalDebt < otherDebt! ${symbol} ${groupId} ${totalDebt.toString()} < ${otherDebt.toString()}`)
                ourDebt = BigNumber(0)
              }
              debtToSave[groupId][chainType] = ourDebt.toString(10)
            } else {
              debtToSave[groupId][chainType] = totalDebt.toString(10)
            }
          }
  
          const insertOneGroup = db.db.transaction((groupId, debtMap) => {
            for (const chainType in debtMap) {
              const newDebt = db.modifyDebt(groupId, chainType, {totalSupply: debtMap[chainType]})
              debts[groupId][chainType] = newDebt
            }
          })
          insertOneGroup(groupId, debtToSave[groupId])
        }
      }
    // }
  }
}
*/

// 第2,3步, 方案2的话,可以不用执行2,3步
// 2. 各个币,扫链,把新storeMan所有接收钱的消息
//    scanMessages: [ ReceiveMessage ]
// 3. 处理收到的消息, 保存到msg表
//    handleMessages (处理完消息, 更新scan到的blockNumber到数据库)
const scanAllChains = () => {
  const chains = gNccChains
  const chainTypes = gNccChainTypes
  
  for (let i = 0; i < chainTypes.length; i++) {
    const num = i
    setTimeout(async () => {
      await chains[chainTypes[num]].chain.scan(db)
    }, 0)
  }
}

// 第5步
// 如果该storeMan的所有币债务都被清空, 则设置isDebtClean为true, (且余额为0, 这个就不用了?)
const syncIsDebtCleanToWan = async function(sgaWan, oracleWan) {
  const time = Math.floor(new Date().getTime() / 1000);
  const sgs = db.getActiveSga();
  const isDebtCleans = {}
  const smgConfigs = {}
  await batchGetSmgConfigs(oracleWan, sgaWan, sgs, smgConfigs, isDebtCleans)

  // 获取groupId的某个资产类别的debt, 在链上从endTime开始监测转移事件
  for (let i = 0; i < sgs.length; i++) {
    const sg = sgs[i];
    const groupId = sg.groupId;
    const config = smgConfigs[groupId];
    const isDebtClean = isDebtCleans[groupId]
    if (isDebtClean) {
      continue
    }

    // 测试网, 只关注dev_开头的storeMan
    const status = parseInt(config.status)
    if (status >= 5) {
      if (time > parseInt(config.endTime)) {
        // 先从db里查找groupId的各项，
        const debts = db.getDebtsByGroupId(sg)
        // 如果debts信息还没被同步
        if (debts.length <= 0) {
          continue
        }

        let uncleanCount = 0
        let logStr = ''
        
        for (let j = 0; j < gNccChainTypes.length; j++) {
          const debt = debts.find(d => d.chainType === gNccChainTypes[j])
          let isDebtClean = false
          if (!debt || !debt.isDebtClean) {
            uncleanCount++
          } else {
            isDebtClean = true
          }
          logStr += ` ${gNccChainTypes[j]} ${isDebtClean}`
        }

        // 如果全都isDebtClean，则设置为debtClean
        if (uncleanCount === 0) {
          await oracleWan.setDebtClean(groupId, true);
          log.info("isDebtClean2 smgId", groupId, " all debt clean")
        }

        log.info("isDebtClean2 smgId", groupId, logStr)
      }
    }
  }
  
}

module.exports = {
  // only for test
  updatePrice,
  // for robot
  createScanEvent,
  doSchedule,
  syncConfigToOtherChain,
  updatePrice_WAN,
  // syncIsDebtCleanToWan_old,
  syncDebt,
  syncIsDebtCleanToWan,
  scanAllChains,
  getNccTokenChainTypeMap,
  // syncSupply,
  // getOrInitSupplies,
  // getOrInitBalances,
  tryInitDebts,
  checkDebtClean,
}
