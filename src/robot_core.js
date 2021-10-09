"use strict"
const log = require('./lib/log');
const { sleep, web3 } = require('./lib/utils');
const logAndSendMail = require('./lib/email');
const ScanEvent = require('./scan_event');
const db = require('./lib/sqlite_db');
const xrp = require('./lib/xrp');
const dot = require('./lib/dot');
const btc = require('./lib/btc');
const ltc = require('./lib/ltc');
const { default: BigNumber } = require('bignumber.js');
const { aggregate } = require('@makerdao/multicall');
const getCryptPrices = require('./lib/crypto_compare')
const nonContractChainConfigs = require('./lib/configs-ncc')

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
      log.error(`chain ${oracles[j].chain.core.chainType} failed`)
      throw e
    }
  }
  // const curTimestamp = Math.floor(Date.now() / 1000)
  // end

  const sgs = db.getAllSga();
  for (let i = 0; i<sgs.length; i++) {
    const sg = sgs[i];
    if (sg.status === 7) {
      continue;
    }
    const groupId = sg.groupId;
    const config = await sgaContract.getStoremanGroupConfig(groupId);

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
      if (!config.gpk1 || !config.gpk2) {
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
const isBtcDebtCleanV2 = async function(chainBtc, sg) {
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
    const address = dot.longPubKeyToAddress(gpk, process.env.NETWORK_TYPE)
    const balanceStr = await dot.dotChain.getBalance(address)

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

async function getAggregate(tm, total, _step, buildCall, work) {
  const config = {
    rpcUrl: tm.chain.rpc,
    multicallAddress: tm.chain.multiCall
  }

  let step = _step
  let loopNum = Math.floor((total + step - 1) / step)
  step = Math.floor((total + loopNum - 1) / loopNum)
  let j = 0
  let calls = []
  let result = {}
  for (let i = 0; i < total; i++) {
    calls.push(
      ...buildCall(i)
    )

    if ((j === step - 1) || (i === total - 1)) {
      // send
      try {
        const ret = await aggregate(calls, config);
        // record
        work(ret, i - j, i)
      } catch(e) {
        log.error(e)
        throw e
      }

      // reset
      j = 0
      calls = []
    } else {
      j++
    }
  }
}

// btc => chains
let gTokenPairs = {}
let gSymbolChainTokenMap = {}
let gTotalTokenPairs = 0
async function getTokenPairsAndSymbolTms(tm, total, web3Tms) {
  const tokenPairs = {}
  const symbolChainTokenMap = {}
  if (gTotalTokenPairs === total) {
    return {
      tokenPairs: gTokenPairs,
      symbolChainTokenMap: gSymbolChainTokenMap,
    }
  }

  process.env.SYMBOLS_NONCONTRACT.split(',').forEach(symbol => {symbolChainTokenMap[symbol] = {}})

  if (tm.chain.multiCall) {
    const ids = {}
    // get ids
    await getAggregate(tm, total, 100,
      (i) => ([{
        target: tm.address,
        call: ['mapTokenPairIndex(uint256)(uint256)', i],
        returns: [
          [`id-${i}`, val => val],
        ],
      }]),
      (ret, start, end) => {
        for (let k = start; k <= end; k++) {
          const id = parseInt(ret.results.transformed[`id-${k}`].toString(10))
          ids[k] = id
          tokenPairs[id] = {id}
        }
      }
    )

    await getAggregate(tm, total, 10,
      (i) => ([{
        target: tm.address,
        call: ['getTokenPairInfo(uint256)(uint256,bytes,uint256,bytes)', ids[i]],
        returns: [
          [`fromChainID-${i}`, val => val],
          [`fromAccount-${i}`, val => val],
          [`toChainID-${i}`, val => val],
          [`toAccount-${i}`, val => val],
        ],
      }, {
        target: tm.address,
        call: ['getAncestorInfo(uint256)(bytes,string,string,uint8,uint256)', ids[i]],
        returns: [
          [`account-${i}`, val => val],
          [`name-${i}`, val => val],
          [`symbol-${i}`, val => val],
          [`decimals-${i}`, val => val],
          [`chainId-${i}`, val => val],
        ],
      }]),
      (ret, start, end) => {
        for (let i = start; i <= end; i++) {
          const id = ids[i]
          const tokenPair = tokenPairs[id]
          tokenPair.account = ret.results.transformed[`account-${i}`]
          tokenPair.name = ret.results.transformed[`name-${i}`]
          tokenPair.symbol = ret.results.transformed[`symbol-${i}`]
          tokenPair.decimals = ret.results.transformed[`decimals-${i}`].toString(10)
          tokenPair.chainId = ret.results.transformed[`chainId-${i}`].toString(10)
          tokenPair.fromChainID = ret.results.transformed[`fromChainID-${i}`].toString(10)
          tokenPair.fromAccount = ret.results.transformed[`fromAccount-${i}`]
          tokenPair.toChainID = ret.results.transformed[`toChainID-${i}`].toString(10)
          tokenPair.toAccount = ret.results.transformed[`toAccount-${i}`]

          if (symbolChainTokenMap[tokenPair.symbol]) {
            const toChainID = tokenPair.toChainID
            const tm = getMapTm(web3Tms, parseInt(toChainID))
            symbolChainTokenMap[tokenPair.symbol][tm.chain.chainType] = tm.chain.loadContractAt('MappingToken', tokenPair.toAccount.toLowerCase())
          }
        }
      }
    )
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

      if (symbolChainTokenMap[tokenPair.symbol]) {
        const toChainID = tokenPair.toChainID
        const tm = getMapTm(web3Tms, parseInt(toChainID))
        symbolChainTokenMap[tokenPair.symbol][tm.chain.chainType] = tm.chain.loadContractAt('MappingToken', tokenPairInfo.toAccount.toLowerCase())
      }
    }
  }

  gTokenPairs = tokenPairs
  gSymbolChainTokenMap = symbolChainTokenMap
  gTotalTokenPairs = total
  return {
    tokenPairs,
    symbolChainTokenMap,
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
    if (!debts[debt.groupId][debt.coinType]) {
      debts[debt.groupId][debt.coinType] = {}
    }

    debts[debt.groupId][debt.coinType] = {
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
// 2. 各个币,扫链,把新storeMan所有接收钱的消息保存下来(数据库msg表)
//    scanAssetTransfer: [ ReceiveMessage ]
// 3. 处理收钱消息, 把各个币的债务与收钱消息做对比,如果收的钱大于等于债务,则该债务被清空(更新debt表)
//    doReceiveMessage (没实现, 因为只有一种消息, 我们就不把消息保存了, 直接更新入)
// 注意: 我们的实现这里把2-3合并成scanNonContractChainMsgs,省略了msg表,只要新storeMan有收钱消息,
//        就认为是上storeMan的债务,
//        直接更新到上个storeMan的debt表中
// 4. 如果该storeMan的所有币债务都被清空, 且余额为0, 则设置isDebtClean为true
//    syncIsDebtCleanToWanV2

// 第1步
const syncDebt = async function(sgaWan, oracleWan, web3Tms) {
  const time = parseInt(new Date().getTime() / 1000);
  // 0. 获取 wan chain 上活跃的 store man -- 记录在db里
  const sgs = db.getAllSga();
  const debts = getDebts()
  for (let i = 0; i<sgs.length; i++) {
    const sg = sgs[i];
    const groupId = sg.groupId;
    if (sg.status === 7) {
      continue;
    }
    const config = await sgaWan.getStoremanGroupConfig(groupId);

    const isDebtClean = await oracleWan.isDebtClean(groupId)
    if (isDebtClean) {
      continue
    }

    if (config.status >= 5) {
      if (time > config.endTime) {
        log.info("isDebtClean2 time > endTime smgId", groupId)
        const debtToSave = {}
        if (debts[groupId]) {
          continue
        } else {
          debts[groupId] = {}
          debtToSave[groupId] = {}
        }

        const tmWan = web3Tms.find(tm => tm.chain.chainName === 'wan')
        const total = parseInt(await tmWan.totalTokenPairs())
        const { symbolChainTokenMap } = await getTokenPairsAndSymbolTms(tmWan, total, web3Tms)

        for (let symbol in symbolChainTokenMap) {
          const chainTokenMap = symbolChainTokenMap[symbol]
          if (!debts[groupId][symbol]) {
            debts[groupId][symbol] = {
              isDebtClean: 0,
              totalSupply: "0",
              totalReceive: "",
              lastReceiveTx: "",
            }
            debtToSave[groupId][symbol] = debts[groupId][symbol]
          }
          for (let chainSymbol in chainTokenMap) {
            const totalSupply = await chainTokenMap[chainSymbol].getFun('totalSupply')
            log.info(`token ${symbol} in chain ${chainSymbol} totalSupply = ${totalSupply}`)
            debts[groupId][symbol].totalSupply = new BigNumber(totalSupply).plus(debts[groupId][symbol].totalSupply).toString(10)
            debtToSave[groupId][symbol].totalSupply = debts[groupId][symbol].totalSupply
          }
        }

        if (debtToSave[groupId]) {
          const insertOneGroup = db.db.transaction((gId, debtMap) => {
            for (const coinType in debtMap) {
              db.insertDebt({
                groupId: gId,
                coinType,
                ...debtMap[coinType]
              });
            }
          })
          insertOneGroup(groupId, debtToSave[groupId])
        }
      }
    }
  }
}

// 第2,3步
const doScan = async (chain, sgs, from, step, to) => {
  let next = from + step;
  if (next > to) {
    next = to
  }

  // 扫描获取感兴趣的事件
  const msgs = await chain.scanMessages(from, to, sgs)
  // 处理这些事件
  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i]
  }
  db.updateScan({chainType: chain.chainType, blockNumber: next});

  if (next < to) {
    setTimeout( async () => {
      await doScan(chain, next + 1, step, to)
    }, 0)
  } else {
    // doScan finished? try again scanInterval seconds later
    setTimeout(async () => {
      await scan(chain)
    }, chain.scanInterval * 1000)
  }
}

const scan = async (chain) => {
  const sgs = db.getActiveSga();
  const blockNumber = await chain.getBlockNumber()

  const from = await chain.loadStartBlockNumber()
  const step = chain.scanStep
  const to = blockNumber - chain.safeBlockCount

  if (from > to) {
    return []
  }

  log.info(`scan chain=${chain.chainType}, from=${from}, to=${to}`);

  await doScan(chain, sgs, from, step, to)
}

const scanAllChains = () => {
  const chains = [btc, ltc, xrp, dot]

  // 并发扫链
  for (let i = 0; i < chains.length; i++) {
    setTimeout(async () => {
      await scan(chains[i])
    }, 0)
  }
}

// 第4步
const syncIsDebtCleanToWanV2 = async function() {
  const sgs = db.getAllSga();
  const allDebts = db.getAllDebt()
  console.log(`${JSON.stringify(allDebts)}`)
  // 获取groupId的某个资产类别的debt, 在链上从endTime开始监测转移事件
  for (let i = 0; i < sgs.length; i++) {
    const sg = sgs[i];
    const groupId = sg.groupId;
    const config = await sgaWan.getStoremanGroupConfig(groupId);

    const isDebtClean = await oracleWan.isDebtClean(groupId)
    if (isDebtClean) {
      continue
    }

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
          logStr += ` ${debt.coinType} ${debt.isDebtClean}`
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
}
