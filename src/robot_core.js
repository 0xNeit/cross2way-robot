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
const nccConfigs = require('./lib/configs-ncc')

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

const getBalance = async (chain, groupId, address, asset) => {
  const balance = await chain.getBalance(address)
  asset[groupId] = balance
} 

const batchGetLockAssetRequest = (sgs, lockAssets) => {
  const promises = []
  const chains = gNccChains
  const chainTypes = gNccChainTypes

  for (let i = 0; i < chainTypes.length; i++) {
    const chainType = chainTypes[i]
    lockAssets[chainType] = {}
    for (let j = 0; j < sgs.length; j++) {
      const sg = sgs[j]
      const groupId = sg.groupId
      const chain = chains[chainType].chain
      const address = chain.getP2PKHAddress(sg.gpk2)
      promises.push(getBalance(chain, groupId, address, lockAssets[chainType]))
    }
  }
  return promises
}

async function updatePrice(oracle, pricesMap, symbolsStringArray) {
  log.info(`updatePrice ${oracle.core.chainType} begin`);

  const threshold = web3.utils.toBN(process.env.THRESHOLD);
  const maxThreshold = web3.utils.toBN(process.env.MAXTHRESHOLD);
  const maxThresholdCmp = web3.utils.toBN(process.env.MAXTHRESHOLD_CMP);
  
  if (pricesMap) {
    const symbols = Object.keys(pricesMap);

    if (symbols.length > 0) {
      // TODO: remove
      symbolsStringArray.push('FNX')
      
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

  // set current storeMan group 
  // const currentGroupIdKey1 = web3.utils.keccak256('MULTICOINSTAKE_RESERVED_KEY____1')
  // const currentGroupIdKey2 = web3.utils.keccak256('MULTICOINSTAKE_RESERVED_KEY____2')
  const curConfigs = []
  for (let j = 0; j < oracles.length; j++) {
    try {
      const configs = await oracles[j].getCurrentGroupIds()
      curConfigs.push(configs)
    } catch(e) {
      log.error(`chain ${oracles[j].chain.core.chainType} failed`, e)
      throw e
    }
  }
  const sgs = db.getActiveSga()
  
  const smgConfigs = {}
  await batchGetSmgConfigs(null, sgaContract, sgs, smgConfigs)

  const sgsValid = sgs.filter(sg => {
    const config = smgConfigs[sg.groupId]
    if (!config.gpk1 || !config.gpk2) {
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

    // is a current group
    const groupName = web3.utils.hexToString(groupId)
    const groupIdUint = new BigNumber(sg.groupId).toString(10)
    let isCurrentConfig = false
    if (process.env.NETWORK_TYPE !== 'testnet' || groupName.startsWith('dev_')) {
      if (config.status === '5') {
        isCurrentConfig = true
      }
    }
    // end
    
    if (config) {
      // ignore empty gpk
      if (config.status < 5) {
        if (sg.status !== parseInt(config.status)) {
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
          needWriteToDb = true
        } else if (config.status !== config_eth.status) {
          await setStoremanGroupStatus(oracle, groupId, config.status);
          needWriteToDb = true
        }
      }
      
      if (needWriteToDb) {
        writeToDB(config)
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
let gTokenPairs = {}
let gMappingTokenMap = {}
let gTotalTokenPairs = 0
let gNccTokenChainTypeMap = getNccTokenChainTypeMap()
async function getTokenPairsInfo(tm, total, web3Tms) {
  const tokenPairs = {}
  const mappingTokenMap = {}
  if (gTotalTokenPairs === total) {
    return {
      tokenPairs: gTokenPairs,
      mappingTokenMap: gMappingTokenMap,
    }
  }

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
  gTotalTokenPairs = total
  return {
    tokenPairs,
    mappingTokenMap,
  }
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

// 判断债务是该设置为已清空
// 1. 每天12点记录(数据库debt表)到期的storeMan各个币种的债务, 如果已经记录过某个storeMan,就不记录了
//    syncDebt
// 2. 各个币,扫链,把新storeMan所有接收钱的消息
//    scanMessages: [ ReceiveMessage ]
// 3. 处理收到的消息, 保存到msg表
//    handleMessages (处理完消息, 更新scan到的blockNumber到数据库)
// 4. 如果该storeMan的所有币债务都被清空, 且余额为0, 则设置isDebtClean为true
//    syncIsDebtCleanToWanV2

// 第1步, 同步债务, 如果storeMan到了endTime, 我们获取原生币的所有各个mapToken的totalSupply之和作为该原生币的总债务
const syncDebt = async function(sgaWan, oracleWan, web3Tms) {
  let curMappingTokenMap = null
  const getMappingTokenMap = async () => {
    if (!curMappingTokenMap) {
      const tmWan = web3Tms.find(tm => tm.chain.chainName === 'wan')
      const total = parseInt(await tmWan.totalTokenPairs())
      // 获取storeMan, 支持的所有非合约链的token, 获取token对应的多个mapToken
      const { mappingTokenMap } = await getTokenPairsInfo(tmWan, total, web3Tms)
      curMappingTokenMap = mappingTokenMap
    }
    return curMappingTokenMap
  }

  const time = parseInt(new Date().getTime() / 1000);
  // 0. 获取 wan chain 上活跃的 store man -- 记录在db里
  const sgs = db.getActiveSga();
  const debts = getDebts()
  const isDebtCleans = {}
  const smgConfigs = {}
  await batchGetSmgConfigs(oracleWan, sgaWan, sgs, smgConfigs, isDebtCleans)

  // 获取活着的sg
  const sgsAlive = sgs.filter(sg => {
    if (sg.startTime <= time && sg.endTime >= time) {
      if (sg.status === 5) {
        return true
      }
    }
    return false
  })

  let lockAssets = null
  const getOtherLockAssets = (symbol, groupId, lockAssets) => {
    const assets = lockAssets[symbol]
    const balance = Object.keys(assets).reduce((sum, gId) => {
      if (gId !== groupId) {
        return sum.plus(BigNumber(assets[groupId]))
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
        // if (time > config.endTime) {
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
            // TODO: 减去属于别人的mapToken, 即获取别人的lockAccount金额
            if (!lockAssets) {
              lockAssets = {}
              const promises = batchGetLockAssetRequest(sgsAlive, lockAssets)
              await Promise.all(promises)
            }
            const otherDebt = getOtherLockAssets(chainType, groupId, lockAssets)
            let ourDebt = totalDebt.minus(otherDebt)
            if (totalDebt.comparedTo(otherDebt) < 0) {
              log.warn(`totalDebt < otherDebt! ${symbol} ${groupId} ${totalDebt.toString()} < ${otherDebt.toString()}`)
              ourDebt = BigNumber(0)
            }
            debtToSave[groupId][chainType] = ourDebt.toString(10)
          }
  
          const insertOneGroup = db.db.transaction((groupId, debtMap) => {
            for (const chainType in debtMap) {
              const newDebt = db.modifyDebt(groupId, chainType, {totalSupply: debtMap[chainType]})
              debts[groupId][chainType] = newDebt
            }
          })
          insertOneGroup(groupId, debtToSave[groupId])
        // }
      }
    // }
  }
}

// 第2,3步
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

// 第4步
// 如果该storeMan的所有币债务都被清空, 则设置isDebtClean为true, (且余额为0, 这个就不用了?)
const syncIsDebtCleanToWanV2 = async function(sgaWan, oracleWan) {
  const time = parseInt(new Date().getTime() / 1000);
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
    if (config.status >= 5) {
      if (time > config.endTime) {
        // 先从db里查找groupId的各项，
        const debts = db.getDebtsByGroupId(sg)
        // 如果debts信息还没被同步
        if (debts.length <= 0) {
          continue
        }

        let uncleanCount = 0
        let logStr = ''
        for (let j = 0; j < debts.length; j++) {
          const debt = debts[j]
          if (!debt.isDebtClean) {
            uncleanCount++
          }
          logStr += ` ${debt.chainType} ${debt.isDebtClean}`
        }

        // 如果全都isDebtClean，则设置为debtClean
        if (uncleanCount === 0) {
          await oracleWan.setDebtClean(groupId, true);
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
  syncIsDebtCleanToWan,
  syncDebt,
  syncIsDebtCleanToWanV2,
  scanAllChains,
  getNccTokenChainTypeMap,
}
