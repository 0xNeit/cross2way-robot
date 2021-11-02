"use strict"
const express = require('express')
const { getSmgIsDebtCleans, getSmgConfigs, getTokenPairIds, getTokenPairDetails, getTokenInfos } = require('./lib/utils');
const app = express()
const port = parseInt(process.env.SERVER_PORT)

app.all('*', (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  res.header("Access-Control-Allow-Methods","PUT,POST,GET,DELETE,OPTIONS");
  res.header("X-Powered-By",' 3.2.1')
  res.header("Content-Type", "application/json;charset=utf-8");
  next();
});

const log = require('./lib/log');
const { web3, sleep } = require('./lib/utils');
const db = require('./lib/sqlite_db');
const { getChains, getChain } = require('./lib/web3_chains')

const web3Chains = getChains(process.env.NETWORK_TYPE)

const web3Oracles = []
const web3OracleProxies = []
const web3Tms = []
const web3TmProxies = []
const web3Cross = []

web3Chains.forEach(web3Chain => {
  if (!!web3Chain.deployedFile) {
    const oracleProxy = web3Chain.loadContract('OracleProxy')
    if (!oracleProxy) {
      log.error(`${web3Chain.chainType} has not deployed OracleProxy`)
    }
    web3OracleProxies.push(oracleProxy)
  
    const oracle = web3Chain.loadContract('OracleDelegate')
    if (!oracle) {
      log.error(`${web3Chain.chainType} has not deployed OracleDelegate`)
    }
    web3Oracles.push(oracle)

    const tmProxy = web3Chain.loadContract('TokenManagerProxy')
    if (!tmProxy) {
      log.error(`${web3Chain.chainType} has not deployed TokenManagerProxy`)
    }
    web3TmProxies.push(tmProxy)

    const tm = web3Chain.loadContract('TokenManagerDelegate')
    if (!tm) {
      log.error(`${web3Chain.chainType} has not deployed TokenManagerDelegate`)
    }
    web3Tms.push(tm)

    const cross = web3Chain.loadContract('CrossDelegate')
    if (!cross) {
      log.error(`${web3Chain.chainType} has not deployed CrossDelegate`)
    }
    web3Cross.push(cross)
  }
})

//
const chainWan = getChain('wanchain', process.env.NETWORK_TYPE)
const oracleWan =  chainWan.loadContract('OracleDelegate')
const sgaWan = chainWan.loadContract('StoremanGroupDelegate')

const schedule = require('node-schedule');
const { createScanEvent} = require('./robot_core');
const { default: BigNumber } = require('bignumber.js');
const scanInst = createScanEvent(
  sgaWan,
  process.env.REGISTER_START_EVENT,
  process.env.CHAINTYPE_WAN,
  parseInt(process.env.SCAN_STEP),
  parseInt(process.env.SCAN_UNCERTAIN_BLOCK),
  parseInt(process.env.SCAN_DELAY),
);

const scanNewStoreMan = () => {
  scanInst.scanEvent();
}

const robotSchedules = function() {
  // sync sga to sga database, 1 / 5min
  schedule.scheduleJob('30 */5 * * * *', scanNewStoreMan);
};
scanNewStoreMan()
robotSchedules()

function removeIndexField(obj) {
  const ks = Object.keys(obj)
  for (let j = 0; j < ks.length/2; j++) {
    const str = j.toString();
    delete obj[str];
  }
  return obj
}

function getMapTm(toChainId) {
  const tm = web3Tms.find(tm => {
    return tm.core.bip44 === toChainId
  })
  if (!tm) {
    return null
  }
  return tm;
}

function itemFieldToHex(tokenPairs) {
  for (let i in tokenPairs) {
    const tokenPair = tokenPairs[i]
    tokenPair.chainId = tokenPair.chainId + ' / ' + web3.utils.toHex(tokenPair.chainId) 
    tokenPair.fromChainID = tokenPair.fromChainID + ' / ' + web3.utils.toHex(tokenPair.fromChainID) 
    tokenPair.toChainID = tokenPair.toChainID + ' / ' + web3.utils.toHex(tokenPair.toChainID) 
  }
}

async function getTokenPairs(tm, _total) {
  const tokenPairs = {}
  const toChainPairIds = {}
  const total = parseInt(_total)

  if (tm.chain.multiCall) {
    const ids = {}
    // get ids
    await getTokenPairIds(tm, total, ids, tokenPairs)

    await getTokenPairDetails(tm, total, ids, tokenPairs, (tokenPair) => {
      if (!toChainPairIds[tokenPair.toChainID]) {
        toChainPairIds[tokenPair.toChainID] = {}
      }
      toChainPairIds[tokenPair.toChainID][id] = true
    })

    // 每种tm上需要查的token
    const toIds = Object.keys(toChainPairIds)
    for (let index in toIds) {
      const tm2 = getMapTm(parseInt(toIds[index]))
      const validIds = Object.keys(toChainPairIds[toIds[index]])
      await getTokenInfos(tm2, validIds, tokenPairs)
    }
  } else {
    for(let i=0; i<total; i++) {
      const id = parseInt(await tm.mapTokenPairIndex(i));
      const tokenPairInfo = removeIndexField(await tm.getTokenPairInfo(id));
      const ancestorInfo = removeIndexField(await tm.getAncestorInfo(id));
      const tokenInfo = removeIndexField(await getMapTm(parseInt(tokenPairInfo.toChainID)).getTokenInfo(id))
      const tokenPair = {id: id}
      
      Object.assign(tokenPair, ancestorInfo, tokenPairInfo, 
        {mapName: tokenInfo.name, mapSymbol: tokenInfo.symbol, mapDecimals: tokenInfo.decimals});
      tokenPairs[id] = tokenPair;
    }
  }

  return tokenPairs;
}

let tmsResult = {};
let oracleResult = null;
let chainsResult = null;

async function refreshTMS() {
  const result = {}

  for (let i = 0; i < web3Tms.length; i++) {
    const tm = web3Tms[i]
    const total = await tm.totalTokenPairs()
    const tokenPairsWeb3 = await getTokenPairs(tm, total)

    itemFieldToHex(tokenPairsWeb3)

    result[tm.chain.chainName] = {
      tokenPairs : tokenPairsWeb3
    }
  }

  const chainNames = Object.keys(result);
  const tmColumns = ['name'];
  let tmsTmp = [];
  if (chainNames.length > 0) {
    tmColumns.push(...chainNames);
    const ids = Object.keys(result.wan.tokenPairs);
    ids.forEach(id => {
      if(!result.wan.tokenPairs[id]) {
        log.error(`wan chain, token pair id = ${id}, not exist`)
      }
      const fields = Object.keys(result.wan.tokenPairs[id]);
      const data = fields.map(field => {
        const obj = {name: field}
        chainNames.forEach(i => {
          if (result[i].tokenPairs[id]) {
            obj[i] = result[i].tokenPairs[id][field]
          } else {
            obj[i] = 'empty'
          }
        })
        return obj;
      })
      tmsTmp.push({
        title: `TokenPairID: ${id}`,
        columns: tmColumns,
        data: data
      })
    })
  }

  tmsResult = {
    tms: tmsTmp,
  }
}

function mapStr2str(symbolsMapStr) {
  const wanSymbols = [];
  symbolsMapStr.replace(/\s+/g,"").split(',').forEach(i => {
    const kv = i.split(':');
    if (kv.length === 2) {
      wanSymbols.push(kv[0]);
    }
  })

  if (wanSymbols.length > 0) {
    return wanSymbols.toString()
  } else {
    return ''
  }
}

async function refreshOracles() {
  const mapStr = mapStr2str(process.env.SYMBOLS_MAP);
  const WAN_SYMBOLS = process.env.SYMBOLS_3RD + ',' + process.env.SYMBOLS_SWAP + (mapStr.length > 0 ? ',' : "") + mapStr;

  const prePricesArray = await oracleWan.getValues(WAN_SYMBOLS);
  const symbolsStringArray = WAN_SYMBOLS.replace(/\s+/g,"").split(',');
  const prePricesMap = {}
  symbolsStringArray.forEach((v,i) => {
    const padPrice = web3.utils.padLeft(prePricesArray[i], 19, '0');
    prePricesMap[v] = padPrice.substr(0, padPrice.length - 18)+ '.'+ padPrice.substr(padPrice.length - 18, 18);
  })

  const result = {
  }

  for (let i = 0; i < web3Oracles.length; i++) {
    const oracle = web3Oracles[i]
    const oracleStoreman = oracle.chain.chainName === 'wan' ? sgaWan : oracle
    const web3Sgs = {}
    const sgAll = db.getAllSga();
    if (oracleStoreman.chain.multiCall) {
      const isDebtCleans = {}
      await getSmgIsDebtCleans(oracle, sgAll, isDebtCleans)
      await getSmgConfigs(oracleStoreman, sgAll, web3Sgs, isDebtCleans)
    } else {
      for (let i = 0; i<sgAll.length; i++) {
        const sg = sgAll[i];
        const groupId = sg.groupId;
        const config = await oracleStoreman.getStoremanGroupConfig(groupId);
        const ks = Object.keys(config);
        for (let j = 0; j < ks.length/2; j++) {
          const str = j.toString();
          delete config[str];
        }
        config.groupId = web3.utils.hexToString(groupId)
        config.chain1 = config.chain1 + ' / ' + web3.utils.toHex(config.chain1)
        config.chain2 = config.chain2 + ' / ' + web3.utils.toHex(config.chain2)
        config.isDebtClean = (await oracle.isDebtClean(groupId)).toString()
        web3Sgs[groupId] = config
      }
    }
    
    result[oracle.chain.chainName] = {
      prices: oracle.chain.chainName !== 'wan' ? {} : prePricesMap,
      sgs: web3Sgs
    }
  }

  // oracleResult = result;
  const priceColumns = ['name'];
  const chainNames = Object.keys(result);
  let priceData = [];
  priceColumns.push(...chainNames);
  priceData = Object.keys(result.wan.prices).map(field => {
    const obj = {name: field}
    chainNames.forEach(i => (obj[i] = result[i].prices[field]))
    return obj;
  })

  const sgColumns = ['name'];
  const sgsTmp = [];
  if (chainNames.length > 0) {
    sgColumns.push(...chainNames);
    const groupIds = Object.keys(result.wan.sgs);
    groupIds.forEach(id => {
      const fields = Object.keys(result.wan.sgs[id]);
      const data = fields.map(field => {
        const obj = {name: field}
        chainNames.forEach(i => {
          if (result[i].sgs[id]) {
            obj[i] = result[i].sgs[id][field] ? result[i].sgs[id][field] : 'empty'
          } else {
            obj[i] = 'empty'
          }
        })
        return obj;
      })
      
      sgsTmp.push({
        title: `StoreManGroupID: ${id}`,
        columns: sgColumns,
        data: data,
      })
    })
  }

  oracleResult = {
    prices: {
      title: "Prices",
      columns: priceColumns,
      data: priceData
    },
    sgs: sgsTmp,
  }
}

async function refreshChains() {
  const result = {
  }
  for (let i = 0; i < web3Chains.length; i++) {
    const chain = web3Chains[i]
    const curIds = await web3Oracles[i].getCurrentGroupIds()
    let crossChainId = ''
    try {
      crossChainId = await web3Cross[i].getChainId()
    } catch (e) {
      log.error(`${chain.chainName} cross getChainId failed ${e}`)
    }
    result[chain.chainName] = {
      blockNumber: await chain.core.getBlockNumber(),

      oracleProxy: web3OracleProxies[i].address,
      oracleDelegator: await web3OracleProxies[i].implementation(),
      tokenManagerProxy: web3TmProxies[i].address,
      tokenManagerDelegator: await web3TmProxies[i].implementation(),

      oracleProxyOwner: await web3OracleProxies[i].getOwner(),
      oracleDelegatorOwner: await web3Oracles[i].getOwner(),
      tokenManagerProxyOwner: await web3TmProxies[i].getOwner(),
      tokenManagerDelegatorOwner: await web3Tms[i].getOwner(),

      storeManProxy: "no contract",

      currentStoreman0: web3.utils.hexToString(web3.utils.toHex(curIds[0])),
      currentStoreman1: web3.utils.hexToString(web3.utils.toHex(curIds[1])), 
      chainId: await chain.core.getChainId(),
      crossChainId: crossChainId + ' / ' + web3.utils.toHex(crossChainId),
    }
  }
  // chainsResult = result;

  const chainInfoColumns = ['name'];
  const chainsNames = Object.keys(result);
  chainInfoColumns.push(...chainsNames);
  const chainInfoData = Object.keys(result.wan).map(field => {
    const obj = {name: field}
    chainsNames.forEach(i => (obj[i] = result[i][field]))
    return obj;
  })

  chainsResult = {
    columns: chainInfoColumns,
    data: chainInfoData
  };
}

let gTip = false

const doRefresh = async () => {
  try {
    if (gTip) return
    gTip = true
    await refreshTMS();
    await refreshOracles();
    await refreshChains();
    gTip = false
  } catch(e) {
    console.log(e);
    gTip = false
  }
}

setTimeout(doRefresh, 0);
setInterval(doRefresh, 360000);

app.get('/tms', (req, res) => {
  res.send(tmsResult);
})

app.get('/oracles', async (req, res) => {
  res.send(oracleResult);
})

app.get('/chains', async (req, res) => {
  res.send(chainsResult)
})

app.get('/quotas', async (req, res) => {
  res.send(quotasResult)
})
app.get('/crosses', async (req, res) => {
  res.send(crossesResult)
})

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
})

process.on('unhandledRejection', (err) => {
  log.error(`unhandledRejection ${err}`);
});