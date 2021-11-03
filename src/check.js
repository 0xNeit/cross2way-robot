const express = require('express')
const app = express()
const port = parseInt(process.env.CHECK_PORT)

const axios = require('axios')
const { getTestMessageUrl } = require('nodemailer');

const log = require('./lib/log');
const db = require('./lib/sqlite_db');

const { web3, sleep, chainIds } = require('./lib/utils');
const { loadContract, loadContractAt } = require('./lib/abi_address');

const chainWan = require(`./chain/${process.env.WAN_CHAIN_ENGINE}`);
const chainEth = require(`./chain/${process.env.ETH_CHAIN_ENGINE}`);

const iWanWan = require(`./chain/${process.env.IWAN_WAN_CHAIN_ENGINE}`);
const iWanEth = require(`./chain/${process.env.IWAN_ETH_CHAIN_ENGINE}`);

const oracleWanProxy = loadContract(chainWan, 'OracleProxy')
const oracleEthProxy = loadContract(chainEth, 'OracleProxy')

const tmWanProxy = loadContract(chainWan, 'TokenManagerProxy')
const tmEthProxy = loadContract(chainEth, 'TokenManagerProxy')

const oracleWan = loadContract(chainWan, 'OracleDelegate')
const oracleEth = loadContract(chainEth, 'OracleDelegate')
const iWanOracleWan = loadContract(iWanWan, 'OracleDelegate')
const iWanOracleEth = loadContract(iWanEth, 'OracleDelegate')

const tmWan = loadContract(chainWan, 'TokenManagerDelegate')
const tmEth = loadContract(chainEth, 'TokenManagerDelegate')

const sgaWan = loadContract(chainWan, 'StoremanGroupDelegate')
const iWanSgaWan = loadContract(iWanWan, 'StoremanGroupDelegate')

const quotaWan = loadContract(chainWan, 'QuotaDelegate')
const quotaEth = loadContract(chainEth, 'QuotaDelegate')

const crossWan = loadContract(chainWan, 'CrossDelegate')
const crossEth = loadContract(chainEth, 'CrossDelegate')

const reportUrl = "https://oapi.dingtalk.com/robot/send?access_token=1dc5dac099ef42e0ba17927593b24d0f7b79460d5d7c3887cd4a81b1b6d70d83"
const dingSend = async (msg) => {
  let format = {
    "msgtype": "text",
    "text": {
      "content": msg
    },
  };
  let ret = await axios.post(reportUrl, format);
  console.log(ret.data);
}

const chainId = chainIds

const ObjectType = {
  Normal: 0,
  StoreMan: 1,
  QuotaToken: 2,
}

let g_msg = '';
let bChecking = false
let CheckingAt = null;

let oldErrors = {};
let newErrors = {};

function reportError(msg) {
  newErrors[msg] = true;

  if (!oldErrors[msg]) {
    dingSend(msg)
  }
}

function writePrint(...message) {
  let color = 'color: gray;font-weight:bold;font-size:16px;'
  if (message[0].indexOf('pass check') != -1) {
    color = 'color: orange;font-weight:bold;font-size:16px;'
  } else if (message[0].indexOf('❌') != -1) {
    color = 'color: red;font-weight:bold;font-size:16px;'

    // reportError(message[0]);
  } else if (message[0].indexOf('✅') != -1) {
    color = 'color: green;font-weight:bold;font-size:16px;'
  }
  let space = ''
  for (let i = 0; i < message[0].length; i++) {
    if (message[0][i] === ' ') {
      space = space + '&nbsp;'
    } else {
      break;
    }
  }
  g_msg = `${g_msg} <div style="${color}">${space}${message[0]}</div>`
  console.log(...message)
}

//////////////////////////////////////////////
let g_store_man = {}
const getStoreMan = async () => {
  const quotaInst = await sgaWan.quotaInst()
  g_store_man.quotaInst = quotaInst.toLowerCase()
  return g_store_man;
}

let g_oracle = {}
const getOracle = async () => {
  const odAddr = await oracleWanProxy.implementation();
  const odAddr_eth = await oracleEthProxy.implementation();
  const tmAddr = await tmWanProxy.implementation();
  const tmAddr_eth = await tmEthProxy.implementation();

  const od = loadContractAt(chainWan, 'OracleDelegate', odAddr);
  const od_eth = loadContractAt(chainEth, 'OracleDelegate', odAddr_eth);
  const tm = loadContractAt(chainWan,'TokenManagerDelegate', odAddr);
  const tm_eth = loadContractAt(chainEth, 'TokenManagerDelegate', odAddr_eth);

  const prePricesArray = await oracleWan.getValues(process.env.SYMBOLS);
  const symbolsStringArray = process.env.SYMBOLS.replace(/\s+/g,"").split(',');
  const prePricesMap = {}
  symbolsStringArray.forEach((v,i) => {
    const padPrice = web3.utils.padLeft(prePricesArray[i], 19, '0');
    prePricesMap[v] = padPrice.substr(0, padPrice.length - 18)+ '.'+ padPrice.substr(padPrice.length - 18, 18);
  })

  const prePricesMap_Eth = {}
  const prePricesArray_Eth = await oracleEth.getValues(process.env.SYMBOLS);
  symbolsStringArray.forEach((v,i) => {
    const padPrice = web3.utils.padLeft(prePricesArray_Eth[i], 19, '0');
    prePricesMap_Eth[v] = padPrice.substr(0, padPrice.length - 18)+ '.'+ padPrice.substr(padPrice.length - 18, 18);
  })

  const sgs = {}
  const sgs_eth = {}
  const sgAll = db.getAllSga();
  for (let i = 0; i<sgAll.length; i++) {
    const sg = sgAll[i];
    const groupId = sg.groupId;
    const config = await sgaWan.getStoremanGroupConfig(groupId);
    const configEth = await oracleEth.getStoremanGroupConfig(groupId);
    const ks = Object.keys(config);

    // if (config.gpk1 !== null || configEth.gpk1 !== null) {
      for (let j = 0; j < ks.length/2; j++) {
        const str = j.toString();
        delete config[str];
        delete configEth[str];
      }
      sgs_eth[groupId] = configEth;
      sgs[groupId] = config;
    // }
  }

  const oracle = {
    'WanChain' : {
      oracleProxy: oracleWanProxy.address,
      oracleDelegator: odAddr,
      tokenManagerProxy: tmWanProxy.address,
      tokenManagerDelegator: tmAddr,

      oracleProxyOwner: await oracleWanProxy.getOwner(),
      oracleDelegatorOwner: await od.getOwner(),
      tokenManagerProxyOwner: await tmWanProxy.getOwner(),
      tokenManagerDelegatorOwner: await tm.getOwner(),

      prices: prePricesMap,
      sgs: sgs,
    },
    'Ethereum' : {
      oracleProxy: oracleEthProxy.address,
      oracleDelegator: odAddr_eth,
      tokenManagerProxy: tmEthProxy.address,
      tokenManagerDelegator: tmAddr_eth,

      oracleProxyOwner: await oracleEthProxy.getOwner(),
      oracleDelegatorOwner: await od_eth.getOwner(),
      tokenManagerProxyOwner: await tmEthProxy.getOwner(),
      tokenManagerDelegatorOwner: await tm_eth.getOwner(),

      prices: prePricesMap_Eth,
      sgs: sgs_eth,
    }
  }

  g_oracle = oracle;
  return oracle;
}

const getIWanOracle = async () => {
  const prePricesArray = await iWanOracleWan.getValues(process.env.SYMBOLS);
  const symbolsStringArray = process.env.SYMBOLS.replace(/\s+/g,"").split(',');
  const prePricesMap = {}
  symbolsStringArray.forEach((v,i) => {
    const padPrice = web3.utils.padLeft(prePricesArray[i], 19, '0');
    prePricesMap[v] = padPrice.substr(0, padPrice.length - 18)+ '.'+ padPrice.substr(padPrice.length - 18, 18);
  })

  const prePricesMap_Eth = {}
  const prePricesArray_Eth = await iWanOracleEth.getValues(process.env.SYMBOLS);
  symbolsStringArray.forEach((v,i) => {
    const padPrice = web3.utils.padLeft(prePricesArray_Eth[i], 19, '0');
    prePricesMap_Eth[v] = padPrice.substr(0, padPrice.length - 18)+ '.'+ padPrice.substr(padPrice.length - 18, 18);
  })

  const sgs = {}
  const sgs_eth = {}
  const sgAll = db.getAllSga();
  for (let i = 0; i<sgAll.length; i++) {
    const sg = sgAll[i];
    const groupId = sg.groupId;
    const config = await iWanSgaWan.getStoremanGroupConfig(groupId);
    const configEth = await iWanOracleEth.getStoremanGroupConfig(groupId);
    const ks = Object.keys(config);

    // if (config.gpk1 !== null || configEth.gpk1 !== null) {
      for (let j = 0; j < ks.length/2; j++) {
        const str = j.toString();
        delete config[str];
        delete configEth[str];
      }
      sgs_eth[groupId] = configEth;
      sgs[groupId] = config;
    // }
  }

  return {
    'WanChain' : {
      prices: prePricesMap,
      sgs: sgs,
    },
    'Ethereum' : {
      prices: prePricesMap_Eth,
      sgs: sgs_eth,
    }
  }
}

/////////////////////////////////////////////
function removeIndexField(obj) {
  const ks = Object.keys(obj)
  for (let j = 0; j < ks.length/2; j++) {
    const str = j.toString();
    delete obj[str];
  }
  return obj
}

async function getTokenPairs(tm, total) {
  const tokenPairs = {}
  for(let i=0; i<total; i++) {
    const id = parseInt(await tm.mapTokenPairIndex(i));
    const tokenPairInfo = removeIndexField(await tm.getTokenPairInfo(id));
    const ancestorInfo = removeIndexField(await tm.getAncestorInfo(id));
    const tokenPair = {id: id}
    
    Object.assign(tokenPair, ancestorInfo, tokenPairInfo);
    tokenPairs[id] = tokenPair;
  }
  return tokenPairs;
}

const getTokenManager = async () => {
  const totalTokenPairs = await tmWan.totalTokenPairs();
  const totalTokenPairs_eth = await tmEth.totalTokenPairs();
  
  const tokenPairs = await getTokenPairs(tmWan, totalTokenPairs)
  const tokenPairs_eth = await getTokenPairs(tmEth, totalTokenPairs_eth)

  const tokenManager = {
    'WanChain' : {
      total: totalTokenPairs,
      tokenPairs: tokenPairs,
    },
    'Ethereum' : {
      total: totalTokenPairs_eth,
      tokenPairs: tokenPairs_eth,
    }
  }

  return tokenManager;
}

/////////////////////////////////////////////
async function getQuotaTokenAmounts(quotaContract, tps, sgsIds) {
  const quotas = {}

  for (let j = 0; j < sgsIds.length; j++) {
    const storeManGroupId = sgsIds[j]
    quotas[storeManGroupId] = {}

    for(let i = 0; i < tps.length; i++) {
      const tokenId = tps[i]

      quotas[storeManGroupId][tokenId] = {}
      const quota = quotas[storeManGroupId][tokenId]

      quota.tokenId = tokenId
      quota.storeManGroupId = storeManGroupId

      quota.userMints = await quotaContract.getUserMintQuota(tokenId, storeManGroupId)
      quota.smgMints = await quotaContract.getSmgMintQuota(tokenId, storeManGroupId)
      quota.userBurns = await quotaContract.getUserBurnQuota(tokenId, storeManGroupId)
      quota.smgBurns = await quotaContract.getSmgBurnQuota(tokenId, storeManGroupId)

      quota.asset = removeIndexField(await quotaContract.getAsset(tokenId, storeManGroupId))
      quota.debt = removeIndexField(await quotaContract.getDebt(tokenId, storeManGroupId))
    }
  }

  return quotas;
}

async function getQuotaFee(quotaContract, status) {
  status[`fee ETH -> WAN`] = await quotaContract.getFees(chainId.ETH, chainId.WAN)
  status[`fee WAN -> ETH`] = await quotaContract.getFees(chainId.WAN, chainId.ETH)
}

async function getQuotaStatus(quotaContract) {
  const status = {}

  status.priceOracleAddress = (await quotaContract.priceOracleAddress()).toLowerCase()
  status.depositOracleAddress = (await quotaContract.depositOracleAddress()).toLowerCase()
  status.tokenManagerAddress = (await quotaContract.tokenManagerAddress()).toLowerCase()
  status.depositTokenSymbol = await quotaContract.depositTokenSymbol()

  // await getQuotaFee(quotaContract, status)

  return status
}

const getQuota = async (oracle, tokenManager) => {
  const tps = Object.keys(tokenManager.WanChain.tokenPairs)
  const tps_Eth = Object.keys(tokenManager.Ethereum.tokenPairs)
  const sgsIds = Object.keys(oracle.WanChain.sgs)
  const sgsIds_Eth = Object.keys(oracle.Ethereum.sgs)

  const quotaTokens = await getQuotaTokenAmounts(quotaWan, tps, sgsIds)
  const quotaTokens_Eth = await getQuotaTokenAmounts(quotaEth, tps_Eth, sgsIds_Eth)

  const status = await getQuotaStatus(quotaWan)
  const status_Eth = await getQuotaStatus(quotaEth)

  const quota = {
    'WanChain' : {
      quotaTokens: quotaTokens,
      status: status,
    },
    'Ethereum' : {
      quotaTokens: quotaTokens_Eth,
      status: status_Eth,
    }
  }

  return quota
}

const getCross = async () => {
  const partner = await crossWan.getPartners();
  const partner_eth = await crossEth.getPartners();

  const cross = {
    'WanChain' : {
      tokenManager: partner.tokenManager.toLowerCase(),
      smgAdminProxy: partner.smgAdminProxy.toLowerCase(),
      smgFeeProxy: partner.smgFeeProxy.toLowerCase(),
      quota: partner.quota,
      sigVerifier: partner.sigVerifier,
      'fee: wan -> eth': removeIndexField(await crossWan.getFees(chainId.WAN, chainId.ETH)),
      'fee: eth -> wan': removeIndexField(await crossWan.getFees(chainId.ETH, chainId.WAN)),
      lockedTime: await crossWan.lockedTime(),
      smgFeeReceiverTimeout: await crossWan.smgFeeReceiverTimeout(),
    },
    'Ethereum' : {
      tokenManager: partner_eth.tokenManager.toLowerCase(),
      smgAdminProxy: partner_eth.smgAdminProxy.toLowerCase(),
      smgFeeProxy: partner_eth.smgFeeProxy.toLowerCase(),
      quota: partner_eth.quota,
      sigVerifier: partner_eth.sigVerifier,
      'fee: wan -> eth': removeIndexField(await crossEth.getFees(chainId.WAN, chainId.ETH)),
      'fee: eth -> wan': removeIndexField(await crossEth.getFees(chainId.ETH, chainId.WAN)),
      lockedTime: await crossWan.lockedTime(),
      smgFeeReceiverTimeout: await crossWan.smgFeeReceiverTimeout(),
    }
  }

  return cross
}
/////////////////////////////////////////////////////
function checkValue(a, b, info) {
  if (a === b) {
    writePrint(`  ${info} ✅`)
    return true
  } else {
    writePrint(`  ${info} ❌, ${a} != ${b}`)
    return false
  }
}
function checkThreeValue(a, b, c, info) {
  if (a === b && a === c) {
    writePrint(`  ${info} ✅`)
    return true
  } else {
    writePrint(`  ${info} ❌, ${a} != ${ a === b ? c : b}`)
    return false
  }
}

function omitStoreManGroup(a, b) {
  if (!!a.storeManGroupId && !!b.storeManGroupId) {
    if (a.storeManGroupId === b.storeManGroupId) {
      if (g_oracle.WanChain.sgs[a.storeManGroupId].status < 4) {
        return true;
      }
    }
  }
  if (!!a.groupId && !!b.groupId) {
    if (a.groupId === b.groupId) {
      if (g_oracle.WanChain.sgs[a.groupId].status < 4) {
        return true;
      }
    }
  }
  return false
}

function checkDebtAsset(a, b, isDebt) {
  if (isDebt === 'debt') {
    return a.debt === b.asset && a.debt_receivable === b.asset_receivable && a.debt_payable === b.asset_payable
  } else if (isDebt === 'asset') {
    return b.debt === a.asset && b.debt_receivable === a.asset_receivable && b.debt_payable === a.asset_payable
  }
}

function checkObject(a, b, info, type) {
  const keys_a = Object.keys(a)
  const keys_b = Object.keys(b)

  if (!!keys_a && !!keys_b) {
    if (keys_a.length === keys_b.length) {
      for (let i = 0; i < keys_a.length; i++) {
        // for store man gpk1 should compare to gpk2
        let key_b = keys_b[i]
        // for store man --
        if (type) {
          if (type & ObjectType.StoreMan) {
            if (omitStoreManGroup(a, b)) {
              writePrint(`  ${info} storeman status < 4, pass check ✅`)
              return true;
            }

            if (keys_a[i] === 'gpk1') { key_b = 'gpk2' }
            else if (keys_a[i] === 'gpk2') { key_b = 'gpk1' }
            else if (keys_a[i] === 'curve1') { key_b = 'curve2' }
            else if (keys_a[i] === 'curve2') { key_b = 'curve1' }
            else if (keys_a[i] === 'chain1') { key_b = 'chain2' }
            else if (keys_a[i] === 'chain2') { key_b = 'chain1' }
          }

          if (type & ObjectType.QuotaToken) {
            let isDebt = null
            if (keys_a[i] === 'asset') { key_b = 'debt', isDebt = keys_a[i]}
            else if (keys_a[i] === 'debt') { key_b = 'asset', isDebt = keys_a[i]}
            if (isDebt) {
              if (!checkDebtAsset(a[keys_a[i]], b[key_b], isDebt)) {
                writePrint(`  ${info} ${isDebt} ❌, ${JSON.stringify(a[keys_a[i]], null, 2)} != ${JSON.stringify(b[key_b], null, 2)}`)
                return false
              } else {
                continue;
              }
            }

            if (keys_a[i] === 'userMints') { key_b = 'smgMints' }
            else if (keys_a[i] === 'userBurns') { key_b = 'smgBurns' }
            else if (keys_a[i] === 'smgMints') { key_b = 'userMints' }
            else if (keys_a[i] === 'smgBurns') { key_b = 'userBurns' }
          }
        }
        const type_b = typeof(b[key_b])
        const type_a = typeof(a[keys_a[i]])
        if (type_a === type_b) {
          if (a[keys_a[i]] !== b[key_b]) {
            // writePrint(`  ${info} ❌, ${JSON.stringify(a, null, 2)} != ${JSON.stringify(b, null, 2)}`)
            writePrint(`  ${info} ❌, ${a[keys_a[i]]} != ${b[key_b]}`)
            writePrint(`    ${JSON.stringify(a, null, 2)} != ${JSON.stringify(b, null, 2)}`)
            return false;
          }
        } else {
          writePrint(`  ${info} ❌, ${JSON.stringify(a, null, 2)} != ${JSON.stringify(b, null, 2)}`)
          return false;
        }
      }
      writePrint(`  ${info} ✅`)
      return true
    }
  }
  writePrint(`  ${info} ❌, ${JSON.stringify(a, null, 2)} != ${JSON.stringify(b, null, 2)}`)
  return false
}

function checkObjectObject(a, b, info, type) {
  const a_ = Object.entries(a)
  const b_ = Object.entries(b)

  if (!!a_ && !!b_) {
    if (a_.length === b_.length) {
      writePrint(`  ${info} check begin`)
      for (let i = 0; i < a_.length; i++) {
        if(a_[i][0] !== b_[i][0]) {
          writePrint(`  ${info} ❌, ${JSON.stringify(a_, null, 2)} != ${JSON.stringify(b_, null, 2)}`)
          continue;
          // return false
        } else {
          if (!checkObject(a_[i][1], b_[i][1], `${info} ${a_[i][0]}`, type)) {
            continue;
            // return false
          }
        }
      }
      writePrint(`  ${info} check end`)
      // return true
      return
    }
  }
  writePrint(`  ${info} ❌, ${JSON.stringify(a, null, 2)} != ${JSON.stringify(b, null, 2)}`)
  // return false
  return
}

function checkObjectObjectObject(a, b, info, type) {
  const a_ = Object.entries(a)
  const b_ = Object.entries(b)

  if (!!a_ && !!b_) {
    if (a_.length === b_.length) {
      writePrint(`-${info} check begin`)
      for (let i = 0; i < a_.length; i++) {
        if(a_[i][0] !== b_[i][0]) {
          writePrint(`  ${info} ❌, ${JSON.stringify(a_, null, 2)} != ${JSON.stringify(b_, null, 2)}`)
        } else {
          checkObjectObject(a_[i][1], b_[i][1], `${info} ${a_[i][0]}`, type)
        }
      }
      writePrint(`-${info} check end`)
      return true
    }
  }
  writePrint(`-${info} ❌, ${JSON.stringify(a, null, 2)} != ${JSON.stringify(b, null, 2)}`)
  return false
}

const checkInterval = 3600000
const check = async () => {
  if (!bChecking) {
    if (new Date().getTime() - CheckingAt > checkInterval) {
      bChecking = true
      newErrors = {}
      CheckingAt = new Date().getTime();
      g_msg = '<html><body>';
      writePrint(`you can use /force to get the latest state`)
    } else {
      // use old
      return
    }
  } else {
    while(bChecking) {
      await sleep(1000)
    }
    return
  }

  try {
    writePrint(`store man check`)
    const stm = await getStoreMan();

    const oracle = await getOracle();

    checkValue(stm.quotaInst, oracle.WanChain.oracleProxy, "storeman quotaInst == wanchain oracle")

    writePrint(`oracle check`)
    checkValue(oracle.WanChain.oracleProxyOwner, oracle.WanChain.oracleDelegatorOwner, "oracle proxy and delegator owner on WanChain")
    checkValue(oracle.Ethereum.oracleProxyOwner, oracle.Ethereum.oracleDelegatorOwner, "oracle proxy and delegator owner on Ethereum")

    checkValue(oracle.WanChain.tokenManagerProxyOwner, oracle.WanChain.tokenManagerDelegatorOwner, "token manager proxy and delegator owner on WanChain")
    checkValue(oracle.Ethereum.tokenManagerProxyOwner, oracle.Ethereum.tokenManagerDelegatorOwner, "token manager proxy and delegator owner on Ethereum")

    checkObject(oracle.WanChain.prices, oracle.Ethereum.prices, "oracle price")
    checkObjectObject(oracle.WanChain.sgs, oracle.Ethereum.sgs, "oracle store man group config", ObjectType.StoreMan)

    const tm = await getTokenManager();

    writePrint(`token manager check`)
    checkValue(tm.WanChain.total, tm.Ethereum.total, "token manager total token pair")
    checkObjectObject(tm.WanChain.tokenPairs, tm.Ethereum.tokenPairs, "token manager token pair")

    writePrint(`quota check`)
    const quota = await getQuota(oracle, tm);
    checkValue(quota.WanChain.status.priceOracleAddress, oracle.WanChain.oracleProxy, "quota priceOracleAddress on WanChain")
    checkValue(quota.WanChain.status.depositOracleAddress.toLowerCase(), sgaWan.address, "quota depositOracleAddress on WanChain")
    checkValue(quota.WanChain.status.tokenManagerAddress, oracle.WanChain.tokenManagerProxy, "quota tokenManagerAddress on WanChain")
    checkValue(quota.Ethereum.status.priceOracleAddress, oracle.Ethereum.oracleProxy, "quota priceOracleAddress on Ethereum")
    checkValue(quota.Ethereum.status.depositOracleAddress, oracle.Ethereum.oracleProxy, "quota depositOracleAddress on Ethereum")
    checkValue(quota.Ethereum.status.tokenManagerAddress, oracle.Ethereum.tokenManagerProxy, "quota tokenManagerAddress on Ethereum")
    checkThreeValue(quota.WanChain.status.depositTokenSymbol, quota.Ethereum.status.depositTokenSymbol, "WAN", "quota depositTokenSymbol")

    checkObjectObjectObject(quota.WanChain.quotaTokens, quota.Ethereum.quotaTokens, "quota token", ObjectType.QuotaToken | ObjectType.StoreMan)


    writePrint(`cross check`)
    const cross = await getCross();
    checkValue(cross.WanChain.tokenManager, oracle.WanChain.tokenManagerProxy, "  cross tokenManager check on WanChain")
    checkValue(cross.WanChain.smgAdminProxy.toLowerCase(), sgaWan.address, "  cross smgAdminProxy check on WanChain")
    checkValue(cross.WanChain.smgFeeProxy.toLowerCase(), sgaWan.address, "  cross smgFeeProxy check on WanChain")
    checkValue(cross.WanChain.quota.toLowerCase(), quotaWan.address, "  cross quota check on WanChain")
    checkValue(cross.Ethereum.tokenManager, oracle.Ethereum.tokenManagerProxy, "  cross tokenManager check on Ethereum")
    checkValue(cross.Ethereum.smgAdminProxy, oracle.Ethereum.oracleProxy, "  cross smgAdminProxy check on Ethereum")
    checkValue(cross.Ethereum.smgFeeProxy, "0x0000000000000000000000000000000000000000", "  cross smgFeeProxy check on Ethereum")
    checkValue(cross.Ethereum.quota.toLowerCase(), quotaEth.address, "  cross quota check on Ethereum")
    writePrint(`-cross sigVerifier on WanChain is ${cross.WanChain.sigVerifier}, on Ethereum is ${cross.Ethereum.sigVerifier}`)
    writePrint(`-fee: wan -> eth on WanChain is ${JSON.stringify(cross.WanChain['fee: wan -> eth'])}, on Ethereum is ${JSON.stringify(cross.Ethereum['fee: wan -> eth'])}`)
    writePrint(`-fee: eth -> wan on WanChain is ${JSON.stringify(cross.WanChain['fee: eth -> wan'])}, on Ethereum is ${JSON.stringify(cross.Ethereum['fee: eth -> wan'])}`)
    writePrint(`-lockedTime on WanChain is ${cross.WanChain['lockedTime']}, on Ethereum is ${cross.Ethereum['lockedTime']}`)
    writePrint(`-smgFeeReceiverTimeout on WanChain is ${cross.WanChain['smgFeeReceiverTimeout']}, on Ethereum is ${cross.Ethereum['smgFeeReceiverTimeout']}`)

    writePrint(`iWan sdk check`)
    const iWanOracle = await getIWanOracle()
    checkObject(oracle.WanChain.prices, iWanOracle.Ethereum.prices, "iWan wan chain oracle price")
    checkObject(oracle.Ethereum.prices, iWanOracle.WanChain.prices, "iWan wan chain oracle price")
    checkObjectObject(oracle.WanChain.sgs, iWanOracle.Ethereum.sgs, "iWan ethereum oracle store man group config", ObjectType.StoreMan)
    checkObjectObject(oracle.Ethereum.sgs, iWanOracle.WanChain.sgs, "iWan ethereum oracle store man group config", ObjectType.StoreMan)
  } catch (error) {
    writePrint(` ❌, exception: `, error)
  }
  
  bChecking = false
  oldErrors = newErrors
  writePrint(`checking At ${new Date(CheckingAt).toLocaleString()}`)
  g_msg = g_msg + '</body></html>'
};

const forceCheck = async () => {
  if (!bChecking) {
    CheckingAt = 0;
  }
  await check();
}

setInterval(async () => {
  await check();
}, checkInterval)

setTimeout(async () => {
  // const oracle = await getOracle();
  // const iWanOracle = await getIWanOracle()
  // checkObject(oracle.WanChain.prices, iWanOracle.Ethereum.prices, "iWan wan chain oracle price")
  // checkObject(oracle.Ethereum.prices, iWanOracle.WanChain.prices, "iWan wan chain oracle price")
  // checkObjectObject(oracle.WanChain.sgs, iWanOracle.Ethereum.sgs, "iWan ethereum oracle store man group config", ObjectType.StoreMan)
  // checkObjectObject(oracle.Ethereum.sgs, iWanOracle.WanChain.sgs, "iWan ethereum oracle store man group config", ObjectType.StoreMan)
  // await dingSend("Hello DingTalk")
  await check();
}, 0);

app.get('/', async (req, res) => {
  await check();
  res.send(g_msg)
})
app.get('/force', async (req, res) => {
  await forceCheck();
  res.send(g_msg)
})

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
})

process.on('unhandledRejection', (err) => {
  console.log(`deploy unhandledRejection ${err}`);
});