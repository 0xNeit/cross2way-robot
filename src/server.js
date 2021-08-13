const express = require('express')
const { aggregate } = require('@makerdao/multicall');
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
    tokenPair.chainId = web3.utils.toHex(tokenPair.chainId) 
    tokenPair.fromChainID = web3.utils.toHex(tokenPair.fromChainID) 
    tokenPair.toChainID = web3.utils.toHex(tokenPair.toChainID) 
  }
}

//
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
      const ret = await aggregate(calls, config);
      // record
      work(ret, i - j, i)

      // reset
      j = 0
      calls = []
    } else {
      j++
    }
  }
}
async function getTokenPairs(tm, _total) {
  const tokenPairs = {}
  const toChainPairIds = {}
  const total = parseInt(_total)

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

    await getAggregate(tm, total, 20,
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
          tokenPairs[id].account = ret.results.transformed[`account-${i}`]
          tokenPairs[id].name = ret.results.transformed[`name-${i}`]
          tokenPairs[id].symbol = ret.results.transformed[`symbol-${i}`]
          tokenPairs[id].decimals = ret.results.transformed[`decimals-${i}`].toString(10)
          tokenPairs[id].chainId = ret.results.transformed[`chainId-${i}`].toString(10)
          tokenPairs[id].fromChainID = ret.results.transformed[`fromChainID-${i}`].toString(10)
          tokenPairs[id].fromAccount = ret.results.transformed[`fromAccount-${i}`]
          tokenPairs[id].toChainID = ret.results.transformed[`toChainID-${i}`].toString(10)
          tokenPairs[id].toAccount = ret.results.transformed[`toAccount-${i}`]

          if (!toChainPairIds[tokenPairs[id].toChainID]) {
            toChainPairIds[tokenPairs[id].toChainID] = {}
          }

          toChainPairIds[tokenPairs[id].toChainID][id] = true
        }
      }
    )

    // 每种tm上需要查的token
    const toIds = Object.keys(toChainPairIds)
    for (let index in toIds) {
      const tm = getMapTm(parseInt(toIds[index]))
      const validIds = Object.keys(toChainPairIds[toIds[index]])
      await getAggregate(tm, validIds.length, 50,
        (i) => {
          const id = validIds[i]
          return [{
            target: tm.address,
            call: ['getTokenInfo(uint256)(address,string,string,uint8)', id],
            returns: [
              [`addr-${i}`, val => val],
              [`name-${i}`, val => val],
              [`symbol-${i}`, val => val],
              [`decimals-${i}`, val => val],
            ],
          }]
        },
        (ret, start, end) => {
          for (let i = start; i <= end; i++) {
            const id = validIds[i]
            tokenPairs[id].mapAddr = ret.results.transformed[`addr-${i}`]
            tokenPairs[id].mapName = ret.results.transformed[`name-${i}`]
            tokenPairs[id].mapSymbol = ret.results.transformed[`symbol-${i}`]
            tokenPairs[id].mapDecimals = ret.results.transformed[`decimals-${i}`].toString(10)
          }
        }
      )
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
  const WAN_SYMBOLS = process.env.SYMBOLS + (mapStr.length > 0 ? ',' : "") + mapStr;

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
      await getAggregate(oracle, sgAll.length, 100,
        (i) => {
          const sg = sgAll[i];
          const groupId = sg.groupId;
          return [{
            target: oracle.address,
            call: ['isDebtClean(bytes32)(bool)', groupId],
            returns: [
              [`isDebtClean-${i}`, val => val]
            ]
          }]
        },
        (ret, start, end) => {
          for (let i = start; i <= end; i++) {
            const groupId = sgAll[i].groupId
            isDebtCleans[groupId] = ret.results.transformed[`isDebtClean-${i}`]
          }
        }
      )
      await getAggregate(oracleStoreman, sgAll.length, 20,
        (i) => {
          const sg = sgAll[i];
          const groupId = sg.groupId;
          return [{
            target: oracleStoreman.address,
            // bytes gpk1, bytes gpk2, uint startTime, uint endTime
            call: ['getStoremanGroupConfig(bytes32)(bytes32,uint8,uint256,uint256,uint256,uint256,uint256,bytes,bytes,uint256,uint256)', groupId],
            returns: [
              [`groupId-${i}`, val => val],
              [`status-${i}`, val => val],
              [`deposit-${i}`, val => val],
              [`chain1-${i}`, val => val],
              [`chain2-${i}`, val => val],
              [`curve1-${i}`, val => val],
              [`curve2-${i}`, val => val],
              [`gpk1-${i}`, val => val],
              [`gpk2-${i}`, val => val],
              [`startTime-${i}`, val => val],
              [`endTime-${i}`, val => val],
            ],
          }]
        },
        (ret, start, end) => {
          for (let i = start; i <= end; i++) {
            const groupId = sgAll[i].groupId
            const config = {}
            config.groupId = web3.utils.hexToString(ret.results.transformed[`groupId-${i}`])
            config.status = ret.results.transformed[`status-${i}`].toString(10)
            config.deposit = ret.results.transformed[`deposit-${i}`].toString(10)
            config.chain1 = web3.utils.toHex(ret.results.transformed[`chain1-${i}`])
            config.chain2 = web3.utils.toHex(ret.results.transformed[`chain2-${i}`])
            config.curve1 = ret.results.transformed[`curve1-${i}`].toString(10)
            config.curve2 = ret.results.transformed[`curve2-${i}`].toString(10)
            config.gpk1 = ret.results.transformed[`gpk1-${i}`]
            config.gpk2 = ret.results.transformed[`gpk2-${i}`]
            config.startTime = ret.results.transformed[`startTime-${i}`].toString(10)
            config.endTime = ret.results.transformed[`endTime-${i}`].toString(10)
            config.isDebtClean = isDebtCleans[groupId]
  
            web3Sgs[groupId] = config
          }
        }
      )
      // 
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
        config.chain1 = web3.utils.toHex(config.chain1)
        config.chain2 = web3.utils.toHex(config.chain2)
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
      crossChainId: web3.utils.toHex(await web3Cross[i].getChainId()),
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
setInterval(doRefresh, 60000);

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