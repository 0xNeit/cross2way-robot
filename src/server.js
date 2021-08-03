const express = require('express')
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
const Oracle = require('./contract/oracle');
const TokenManager = require('./contract/token_manager');
const OracleProxy = require('./contract/oracle_proxy');
const TokenManagerProxy = require('./contract/token_manager_proxy');
const SGA = require('./contract/storeman_group_admin');
const Quota = require('./contract/quota');
const Cross = require('./contract/cross');
const db = require('./lib/sqlite_db');
const { getChains } = require('./lib/web3_chains')

const chainWan = require(`./chain/${process.env.WAN_CHAIN_ENGINE}`);
const chainEth = require(`./chain/${process.env.ETH_CHAIN_ENGINE}`);
const chainBsc = require(`./chain/${process.env.CHAIN_ENGINE_BSC}`);
const chainAvax = require(`./chain/${process.env.AVAX_CHAIN_ENGINE}`);
const chainDev = require(`./chain/${process.env.CHAIN_ENGINE_DEV}`);
// const chainWan = require(`./chain/${process.env.IWAN_WAN_CHAIN_ENGINE}`);
// const chainEth = require(`./chain/${process.env.IWAN_ETH_CHAIN_ENGINE}`);

const web3Chains = getChains(process.env.NETWORK_TYPE)

const { loadContract } = require('./lib/abi_address');

const oracleWanProxy = loadContract(chainWan, 'OracleProxy')
const oracleEthProxy = loadContract(chainEth, 'OracleProxy')
const oracleBscProxy = loadContract(chainBsc, 'OracleProxy')
const oracleAvaxProxy = loadContract(chainAvax, 'OracleProxy')
const oracleDevProxy = loadContract(chainDev, 'OracleProxy')

const tmWanProxy = loadContract(chainWan, 'TokenManagerProxy')
const tmEthProxy = loadContract(chainEth, 'TokenManagerProxy')
const tmBscProxy = loadContract(chainBsc, 'TokenManagerProxy')
const tmAvaxProxy = loadContract(chainAvax, 'TokenManagerProxy')
const tmDevProxy = loadContract(chainDev, 'TokenManagerProxy')

const oracleWan = loadContract(chainWan, 'OracleDelegate')
const oracleEth = loadContract(chainEth, 'OracleDelegate')
const oracleBsc = loadContract(chainBsc, 'OracleDelegate')
const oracleAvax = loadContract(chainAvax, 'OracleDelegate')
const oracleDev = loadContract(chainDev, 'OracleDelegate')

const tmWan = loadContract(chainWan, 'TokenManagerDelegate')
const tmEth = loadContract(chainEth, 'TokenManagerDelegate')
const tmBsc = loadContract(chainBsc, 'TokenManagerDelegate')
const tmAvax = loadContract(chainAvax, 'TokenManagerDelegate')
const tmDev = loadContract(chainDev, 'TokenManagerDelegate')

const crossWan = loadContract(chainWan, 'CrossDelegate')
const crossEth = loadContract(chainEth, 'CrossDelegate')
const crossBsc = loadContract(chainBsc, 'CrossDelegate')
const crossAvax = loadContract(chainAvax, 'CrossDelegate')
const crossDev = loadContract(chainDev, 'CrossDelegate')

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

const sgaWan = loadContract(chainWan, 'StoremanGroupDelegate')

const schedule = require('node-schedule');
const { createScanEvent} = require('./robot_core');
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
  schedule.scheduleJob('0 */5 * * * *', scanNewStoreMan);
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
  if (tmWan.core.chainId === toChainId) {
    return tmWan
  } else if (tmEth.core.chainId === toChainId) {
    return tmEth
  } else if (tmBsc.core.chainId === toChainId) {
    return tmBsc
  } else if (tmAvax.core.chainId === toChainId) {
    return tmAvax
  } else if (tmDev.core.chainId === toChainId) {
    return tmDev
  } else {
    const tm = web3Tms.find(tm => {
      return tm.core.bip44 === toChainId
    })
    if (!tm) {
      return null
    }
    return tm;
  }
}
async function getTokenPairs(tm, _total) {
  const tokenPairs = {}
  const total = parseInt(_total)
  for(let i=0; i<total; i++) {
    const id = parseInt(await tm.mapTokenPairIndex(i));
    const tokenPairInfo = removeIndexField(await tm.getTokenPairInfo(id));
    const ancestorInfo = removeIndexField(await tm.getAncestorInfo(id));
    let tokenInfo = removeIndexField(await getMapTm(parseInt(tokenPairInfo.toChainID)).getTokenInfo(id))
    const tokenPair = {id: id}
    
    Object.assign(tokenPair, ancestorInfo, tokenPairInfo, 
      {mapName: tokenInfo.name, mapSymbol: tokenInfo.symbol, mapDecimals: tokenInfo.decimals});
    tokenPairs[id] = tokenPair;
  }
  return tokenPairs;
}

let tmsResult = {};
let oracleResult = null;
let chainsResult = null;
let quotaResult = {};
let crossResult = {};

async function refreshTMS() {
  const totalTokenPairs = await tmWan.totalTokenPairs();
  const totalTokenPairs_eth = await tmEth.totalTokenPairs();
  const totalTokenPairs_bsc = await tmBsc.totalTokenPairs();
  const totalTokenPairs_avax = await tmAvax.totalTokenPairs();
  const totalTokenPairs_dev = await tmDev.totalTokenPairs();

  const tokenPairs = await getTokenPairs(tmWan, totalTokenPairs)
  const tokenPairs_eth = await getTokenPairs(tmEth, totalTokenPairs_eth)
  const tokenPairs_bsc = await getTokenPairs(tmBsc, totalTokenPairs_bsc)
  const tokenPairs_avax = await getTokenPairs(tmAvax, totalTokenPairs_avax)
  const tokenPairs_dev = await getTokenPairs(tmDev, totalTokenPairs_dev)

  tokenPairs.chainId = web3.utils.toHex(tokenPairs.chainId)
  tokenPairs.fromChainID = web3.utils.toHex(tokenPairs.fromChainID)
  tokenPairs.toChainID = web3.utils.toHex(tokenPairs.toChainID)

  tokenPairs_eth.chainId = web3.utils.toHex(tokenPairs_eth.chainId)
  tokenPairs_eth.fromChainID = web3.utils.toHex(tokenPairs_eth.fromChainID)
  tokenPairs_eth.toChainID = web3.utils.toHex(tokenPairs_eth.toChainID)

  tokenPairs_bsc.chainId = web3.utils.toHex(tokenPairs_bsc.chainId)
  tokenPairs_bsc.fromChainID = web3.utils.toHex(tokenPairs_bsc.fromChainID)
  tokenPairs_bsc.toChainID = web3.utils.toHex(tokenPairs_bsc.toChainID)

  totalTokenPairs_avax.chainId = web3.utils.toHex(totalTokenPairs_avax.chainId)
  totalTokenPairs_avax.fromChainID = web3.utils.toHex(totalTokenPairs_avax.fromChainID)
  totalTokenPairs_avax.toChainID = web3.utils.toHex(totalTokenPairs_avax.toChainID)

  tokenPairs_dev.chainId = web3.utils.toHex(tokenPairs_dev.chainId)
  tokenPairs_dev.fromChainID = web3.utils.toHex(tokenPairs_dev.fromChainID)
  tokenPairs_dev.toChainID = web3.utils.toHex(tokenPairs_dev.toChainID)
  

  const result = {
    'WanChain' : {
      tokenPairs: tokenPairs,
    },
    'Ethereum' : {
      tokenPairs: tokenPairs_eth,
    },
    'Bsc' : {
      tokenPairs: tokenPairs_bsc,
    },
    'Avax' : {
      tokenPairs: tokenPairs_avax,
    },
    'MoonBeam' : {
      tokenPairs: tokenPairs_dev,
    }
  }

  for (let i = 0; i < web3Tms.length; i++) {
    const tm = web3Tms[i]
    const total = await tm.totalTokenPairs()
    const tokenPairsWeb3 = await getTokenPairs(tm, total)

    tokenPairsWeb3.chainId = web3.utils.toHex(tokenPairsWeb3.chainId)
    tokenPairsWeb3.fromChainID = web3.utils.toHex(tokenPairsWeb3.fromChainID)
    tokenPairsWeb3.toChainID = web3.utils.toHex(tokenPairsWeb3.toChainID)

    result[tm.chain.chainName] = {
      tokenPairs : tokenPairsWeb3
    }
  }
  // tmsResult = result;
  const chainNames = Object.keys(result);
  const tmColumns = ['name'];
  let tmsTmp = [];
  if (chainNames.length > 0) {
    tmColumns.push(...chainNames);
    const ids = Object.keys(result.WanChain.tokenPairs);
    ids.forEach(id => {
      if(!result.WanChain.tokenPairs[id]) {
        log.error(`wan chain, token pair id = ${id}, not exist`)
      }
      const fields = Object.keys(result.WanChain.tokenPairs[id]);
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
  const WAN_SYMBOLS = process.env.SYMBOLS + (mapStr.length > 0 ? ',' : "") + mapStr;
  const prePricesArray = await oracleWan.getValues(WAN_SYMBOLS);
  const symbolsStringArray = WAN_SYMBOLS.replace(/\s+/g,"").split(',');
  const prePricesMap = {}
  symbolsStringArray.forEach((v,i) => {
    const padPrice = web3.utils.padLeft(prePricesArray[i], 19, '0');
    prePricesMap[v] = padPrice.substr(0, padPrice.length - 18)+ '.'+ padPrice.substr(padPrice.length - 18, 18);
  })

  const mapStrEth = mapStr2str(process.env.SYMBOLS_MAP_ETH)
  const ETH_SYMBOLS = process.env.SYMBOLS_ETH + (mapStrEth.length > 0 ? "," : "") + mapStrEth
  const prePricesMap_Eth = {}
  const prePricesArray_Eth = await oracleEth.getValues(ETH_SYMBOLS);
  const symbolsStringArray_Eth = ETH_SYMBOLS.replace(/\s+/g,"").split(',');
  symbolsStringArray_Eth.forEach((v,i) => {
    const padPrice = web3.utils.padLeft(prePricesArray_Eth[i], 19, '0');
    prePricesMap_Eth[v] = padPrice.substr(0, padPrice.length - 18)+ '.'+ padPrice.substr(padPrice.length - 18, 18);
  })

  const sgs = {}
  const sgs_eth = {}
  const sgs_bsc = {}
  const sgs_avax = {}
  const sgs_dev = {}
  const sgAll = db.getAllSga();
  for (let i = 0; i<sgAll.length; i++) {
    const sg = sgAll[i];
    const groupId = sg.groupId;
    const config = await sgaWan.getStoremanGroupConfig(groupId);
    const configEth = await oracleEth.getStoremanGroupConfig(groupId);
    const configBsc = await oracleBsc.getStoremanGroupConfig(groupId);
    const configAvax = await oracleAvax.getStoremanGroupConfig(groupId);
    const configDev = await oracleDev.getStoremanGroupConfig(groupId);
    const ks = Object.keys(config);

    // if (config.gpk1 !== null || configEth.gpk1 !== null) {
      for (let j = 0; j < ks.length/2; j++) {
        const str = j.toString();
        delete config[str];
        delete configEth[str];
        delete configBsc[str];
        delete configAvax[str];
        delete configDev[str];
      }
      config.groupId = web3.utils.hexToString(groupId)
      configEth.groupId = web3.utils.hexToString(groupId)
      configBsc.groupId = web3.utils.hexToString(groupId)
      configAvax.groupId = web3.utils.hexToString(groupId)
      configDev.groupId = web3.utils.hexToString(groupId)

      config.chain1 = web3.utils.toHex(config.chain1)
      config.chain2 = web3.utils.toHex(config.chain2)
      configEth.chain1 = web3.utils.toHex(configEth.chain1)
      configEth.chain2 = web3.utils.toHex(configEth.chain2)
      configBsc.chain1 = web3.utils.toHex(configBsc.chain1)
      configBsc.chain2 = web3.utils.toHex(configBsc.chain2)
      configAvax.chain1 = web3.utils.toHex(configAvax.chain1)
      configAvax.chain2 = web3.utils.toHex(configAvax.chain2)
      configDev.chain1 = web3.utils.toHex(configDev.chain1)
      configDev.chain2 = web3.utils.toHex(configDev.chain2)

      configDev.isDebtClean = (await oracleDev.isDebtClean(groupId)).toString()
      configAvax.isDebtClean = (await oracleAvax.isDebtClean(groupId)).toString()
      configBsc.isDebtClean = (await oracleBsc.isDebtClean(groupId)).toString()
      configEth.isDebtClean = (await oracleEth.isDebtClean(groupId)).toString()
      config.isDebtClean = (await oracleWan.isDebtClean(groupId)).toString()
      sgs_dev[groupId] = configDev;
      sgs_avax[groupId] = configAvax;
      sgs_bsc[groupId] = configBsc;
      sgs_eth[groupId] = configEth;
      sgs[groupId] = config;
    // }
  }

  const result = {
    'WanChain' : {
      prices: prePricesMap,
      sgs: sgs,
    },
    'Ethereum' : {
      prices: prePricesMap_Eth,
      sgs: sgs_eth,
    },
    'Bsc' : {
      prices: {},
      sgs: sgs_bsc,
    },
    'Avax' : {
      prices: {},
      sgs: sgs_avax,
    },
    'MoonBeam' : {
      prices: {},
      sgs: sgs_dev,
    }
  }

  for (let i = 0; i < web3Oracles.length; i++) {
    const oracle = web3Oracles[i]
    const web3Sgs = {}
    for (let i = 0; i<sgAll.length; i++) {
      const sg = sgAll[i];
      const groupId = sg.groupId;
      const config = await oracle.getStoremanGroupConfig(groupId);
      const ks = Object.keys(config);
      for (let j = 0; j < ks.length/2; j++) {
        const str = j.toString();
        delete config[str];
      }
      config.groupId = web3.utils.hexToString(groupId)
      config.chain1 = web3.utils.toHex(config.chain1)
      config.chain2 = web3.utils.toHex(config.chain2)
      config.isDebtClean = (await oracle.isDebtClean(groupId)).toString()
      web3Sgs[groupId] = config
    }
    result[oracle.chain.chainName] = {
      prices: {},
      sgs: web3Sgs
    }
  }

  // oracleResult = result;
  const priceColumns = ['name'];
  const chainNames = Object.keys(result);
  let priceData = [];
  priceColumns.push(...chainNames);
  priceData = Object.keys(result.WanChain.prices).map(field => {
    const obj = {name: field}
    chainNames.forEach(i => (obj[i] = result[i].prices[field]))
    return obj;
  })

  const sgColumns = ['name'];
  const sgsTmp = [];
  if (chainNames.length > 0) {
    sgColumns.push(...chainNames);
    const groupIds = Object.keys(result.WanChain.sgs);
    groupIds.forEach(id => {
      const fields = Object.keys(result.WanChain.sgs[id]);
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
  const odAddr = await oracleWanProxy.implementation();
  const odAddr_eth = await oracleEthProxy.implementation();
  const odAddr_bsc = await oracleBscProxy.implementation();
  const odAddr_avax = await oracleAvaxProxy.implementation();
  const odAddr_dev = await oracleDevProxy.implementation();
  const od = new Oracle(chainWan, odAddr);
  const od_eth = new Oracle(chainEth, odAddr_eth);
  const od_bsc = new Oracle(chainBsc, odAddr_bsc);
  const od_avax = new Oracle(chainAvax, odAddr_avax);
  const od_dev = new Oracle(chainDev, odAddr_dev);

  const oracleWan = loadContract(chainWan, 'OracleDelegate')
  const oracleEth = loadContract(chainEth, 'OracleDelegate')
  const oracleBsc = loadContract(chainBsc, 'OracleDelegate')
  const oracleAvax = loadContract(chainAvax, 'OracleDelegate')
  const oracleDev = loadContract(chainDev, 'OracleDelegate')

  const curIdsWan = await oracleWan.getCurrentGroupIds()
  const curIdsEth = await oracleEth.getCurrentGroupIds()
  const curIdsBsc = await oracleBsc.getCurrentGroupIds()
  const curIdsAvax = await oracleAvax.getCurrentGroupIds()
  const curIdsDev = await oracleDev.getCurrentGroupIds()

  const tmAddr = await tmWanProxy.implementation();
  const tmAddr_eth = await tmEthProxy.implementation();
  const tmAddr_bsc = await tmBscProxy.implementation();
  const tmAddr_avax = await tmAvaxProxy.implementation();
  const tmAddr_dev = await tmDevProxy.implementation();
  const tm = new TokenManager(chainWan, odAddr);
  const tm_eth = new TokenManager(chainEth, odAddr_eth);
  const tm_bsc = new TokenManager(chainBsc, odAddr_bsc);
  const tm_avax = new TokenManager(chainAvax, odAddr_avax);
  const tm_dev = new TokenManager(chainDev, odAddr_dev);

  const storeOwner = (await sgaWan.getOwner()).toLowerCase();
  const storeOwnerConfig = sgaWan.pv_address;
  const result = {
    'WanChain' : {
      blockNumber: await chainWan.core.getBlockNumber(),

      oracleProxy: oracleWanProxy.address,
      oracleDelegator: odAddr,
      tokenManagerProxy: tmWanProxy.address,
      tokenManagerDelegator: tmAddr,

      oracleProxyOwner: await oracleWanProxy.getOwner(),
      oracleDelegatorOwner: await od.getOwner(),
      tokenManagerProxyOwner: await tmWanProxy.getOwner(),
      tokenManagerDelegatorOwner: await tm.getOwner(),

      storeManProxy: sgaWan.address,
      storeManProxyOwner: await sgaWan.getOwner(),

      currentStoreman0: web3.utils.hexToString(web3.utils.toHex(curIdsWan[0])),
      currentStoreman1: web3.utils.hexToString(web3.utils.toHex(curIdsWan[1])),
      chainId: web3.utils.toHex(await chainWan.core.getChainId()),
      crossChainId: web3.utils.toHex(await crossWan.getChainId()),
    },
    'Ethereum' : {
      blockNumber: await chainEth.core.getBlockNumber(),

      oracleProxy: oracleEthProxy.address,
      oracleDelegator: odAddr_eth,
      tokenManagerProxy: tmEthProxy.address,
      tokenManagerDelegator: tmAddr_eth,

      oracleProxyOwner: await oracleEthProxy.getOwner(),
      oracleDelegatorOwner: await od_eth.getOwner(),
      tokenManagerProxyOwner: await tmEthProxy.getOwner(),
      tokenManagerDelegatorOwner: await tm_eth.getOwner(),

      storeManProxy: "no contract",
      storeManProxyOwner: storeOwner ===  storeOwnerConfig? "equal" : storeOwnerConfig,

      currentStoreman0: web3.utils.hexToString(web3.utils.toHex(curIdsEth[0])),
      currentStoreman1: web3.utils.hexToString(web3.utils.toHex(curIdsEth[1])),
      chainId: web3.utils.toHex(await chainEth.core.getChainId()),
      crossChainId: web3.utils.toHex(await crossEth.getChainId()),
    },
    'Bsc' : {
      blockNumber: await chainBsc.core.getBlockNumber(),

      oracleProxy: oracleBscProxy.address,
      oracleDelegator: odAddr_bsc,
      tokenManagerProxy: tmBscProxy.address,
      tokenManagerDelegator: tmAddr_bsc,

      oracleProxyOwner: await oracleBscProxy.getOwner(),
      oracleDelegatorOwner: await od_bsc.getOwner(),
      tokenManagerProxyOwner: await tmBscProxy.getOwner(),
      tokenManagerDelegatorOwner: await tm_bsc.getOwner(),

      storeManProxy: "no contract",
      storeManProxyOwner: storeOwner ===  storeOwnerConfig? "equal" : storeOwnerConfig,

      currentStoreman0: web3.utils.hexToString(web3.utils.toHex(curIdsBsc[0])),
      currentStoreman1: web3.utils.hexToString(web3.utils.toHex(curIdsBsc[1])),
      chainId: web3.utils.toHex(await chainBsc.core.getChainId()),
      crossChainId: web3.utils.toHex(await crossBsc.getChainId()),
    },
    'Avax' : {
      blockNumber: await chainAvax.core.getBlockNumber(),

      oracleProxy: oracleAvaxProxy.address,
      oracleDelegator: odAddr_avax,
      tokenManagerProxy: tmAvaxProxy.address,
      tokenManagerDelegator: tmAddr_avax,

      oracleProxyOwner: await oracleAvaxProxy.getOwner(),
      oracleDelegatorOwner: await od_avax.getOwner(),
      tokenManagerProxyOwner: await tmAvaxProxy.getOwner(),
      tokenManagerDelegatorOwner: await tm_avax.getOwner(),

      storeManProxy: "no contract",
      storeManProxyOwner: storeOwner ===  storeOwnerConfig? "equal" : storeOwnerConfig,

      currentStoreman0: web3.utils.hexToString(web3.utils.toHex(curIdsAvax[0])),
      currentStoreman1: web3.utils.hexToString(web3.utils.toHex(curIdsAvax[1])),
      chainId: web3.utils.toHex(await chainAvax.core.getChainId()),
      crossChainId: web3.utils.toHex(await crossAvax.getChainId()),
    },
    'MoonBeam' : {
      blockNumber: await chainDev.core.getBlockNumber(),

      oracleProxy: oracleDevProxy.address,
      oracleDelegator: odAddr_dev,
      tokenManagerProxy: tmDevProxy.address,
      tokenManagerDelegator: tmAddr_dev,

      oracleProxyOwner: await oracleDevProxy.getOwner(),
      oracleDelegatorOwner: await od_dev.getOwner(),
      tokenManagerProxyOwner: await tmDevProxy.getOwner(),
      tokenManagerDelegatorOwner: await tm_dev.getOwner(),

      storeManProxy: "no contract",
      storeManProxyOwner: storeOwner ===  storeOwnerConfig? "equal" : storeOwnerConfig,

      currentStoreman0: web3.utils.hexToString(web3.utils.toHex(curIdsDev[0])),
      currentStoreman1: web3.utils.hexToString(web3.utils.toHex(curIdsDev[1])),
      chainId: web3.utils.toHex(await chainDev.core.getChainId()),
      crossChainId: ''// web3.utils.toHex(await crossDev.getChainId()),
    },

  }

  for (let i = 0; i < web3Chains.length; i++) {
    const chain = web3Chains[i]
    const curIds = await web3Oracles[i].getCurrentGroupIds()
    result[chain.chainName] = {
      blockNumber: await chain.core.getBlockNumber(),

      oracleProxy: await web3OracleProxies[i].address,
      oracleDelegator: await web3OracleProxies[i].implementation(),
      tokenManagerProxy: await web3TmProxies[i].address,
      tokenManagerDelegator: await web3TmProxies[i].implementation(),

      oracleProxyOwner: await web3OracleProxies[i].getOwner(),
      oracleDelegatorOwner: await web3Oracles[i].getOwner(),
      tokenManagerProxyOwner: await web3TmProxies[i].getOwner(),
      tokenManagerDelegatorOwner: await web3Tms[i].getOwner(),

      storeManProxy: "no contract",
      storeManProxyOwner: storeOwner ===  storeOwnerConfig? "equal" : storeOwnerConfig,

      currentStoreman0: web3.utils.hexToString(web3.utils.toHex(curIds[0])),
      currentStoreman1: web3.utils.hexToString(web3.utils.toHex(curIds[1])), 
      chainId: web3.utils.toHex(await chain.core.getChainId()),
      crossChainId: web3.utils.toHex(await web3Cross[i].getChainId()),
    }
  }
  // chainsResult = result;

  const chainInfoColumns = ['name'];
  const chainsNames = Object.keys(result);
  chainInfoColumns.push(...chainsNames);
  const chainInfoData = Object.keys(result.WanChain).map(field => {
    const obj = {name: field}
    chainsNames.forEach(i => (obj[i] = result[i][field]))
    return obj;
  })

  chainsResult = {
    columns: chainInfoColumns,
    data: chainInfoData
  };
}

async function refreshQuota() {
  // const result = {
  //   'WanChain' : {
  //     'getPartners': {
  //       'tokenManager': 
  //     }
  //   },
  //   'Ethereum' : {

  //   }
  // }

  // quotaResult = {
  //   columns: col,
  //   data: data
  // }
}

async function refreshCross() {
  // const result = {
  //   'WanChain' : {

  //   },
  //   'Ethereum' : {
      
  //   }
  // }

  // quotaResult = {
  //   columns: col,
  //   data: data
  // }
}

let gTip = false
setTimeout(async function() {
  try {
    if (gTip) return
    gTip = true
    await refreshTMS();
    await refreshOracles();
    await refreshChains();
    await refreshQuota();
    await refreshCross();
    gTip = false
  } catch(e) {
    console.log(e);
    gTip = false
  }
}, 0);


setInterval(async function() {
  try {
    if (gTip) return
    gTip = true
    await refreshTMS();
    await refreshOracles();
    await refreshChains();
    await refreshQuota();
    await refreshCross();
    gTip = false
  } catch(e) {
    console.log(e);
    gTip = false
  }
}, 60000);

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