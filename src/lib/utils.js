const Web3 = require('web3');
const web3 = new Web3();
const wanUtil = require('wanchainjs-util');
const { aggregate } = require('@makerdao/multicall');

// TODO: delete chainIds
const chainIds = {
    ETH: 0x8000003c,
    WAN: 0x8057414e,
    BTC: 0x80000000,
    ETC: 0x8000003d,
    EOS: 0x800000c2,
    XRP: 0x80000090,
    BSC: 0x800002ca,
    LTC: 0x80000002,
    DOT: 0x80000162,
    AVAX: 0x80002328,
    [process.env.CHAINTYPE_DEV]: parseInt(process.env.BIP44_DEV),
}

function privateToAddress(sk) {
    return '0x' + wanUtil.privateToAddress(Buffer.from(sk, 'hex')).toString('hex');
}

function sleep(ms) {
	return new Promise(function (resolve, reject) {
		setTimeout(function () {
			resolve();
		}, ms);
	})
};

function isPromise(p) {
    return p && Object.prototype.toString.call(p) === "[object Promise]";
}

function promisify(func, paras=[], obj=null){
  return new Promise(function(success, fail){
      function _cb(err, result){
          if(err){
              fail(err);
          } else {
              success(result);
          }
      }
      paras.push(_cb);
      func.apply(obj, paras);
  });
}

function promiseEvent(func, paras=[], obj=null, event){
  return new Promise(function(success, fail){
      let res = func.apply(obj, paras);
      obj.on(event, function _cb(err){
          if(err){
              fail(err);
          } else {
              success(res);
          }
      })
  });
}

function fractionRatioToDecimalString(priceRaw, price_decimal, ratio) {
    const ratioPrice = fractionToDecimalString(priceRaw, price_decimal)
    const ratio_price = web3.utils.toBN(ratioPrice)
    const ratio_p = web3.utils.toBN(ratio)
    const price = web3.utils.toBN(ratioPrice).mul(web3.utils.toBN(ratio)).div(web3.utils.toBN(Math.pow(10, price_decimal)))
    return '0x' + price.toString('hex')
}

function fractionToDecimalString(priceRaw, _price_decimal) {
    const price_decimal = parseInt(_price_decimal);
    let decimal = 0;

    const priceRawSplit = (priceRaw + "").split('.');
    let priceStr = priceRawSplit[0];
    if (priceRawSplit.length > 1) {
        decimal = priceRawSplit[1].length;
        if (decimal > price_decimal) {
            // throw new Error(`${it} decimal > ${price_decimal}, price = ${symbolPriceMap[it]}`);
            decimal = price_decimal
            priceStr += priceRawSplit[1].substr(0, decimal);
        } else {
            priceStr += priceRawSplit[1];
        }
    }
    const price = web3.utils.toBN(priceStr);

    return '0x' + price.mul(web3.utils.toBN(Math.pow(10, price_decimal - decimal))).toString('hex');
}

function formatToFraction(oldDecimalString) {
    const padPrice = web3.utils.padLeft(oldDecimalString, 19, '0');
    return padPrice.substr(0, padPrice.length - 18)+ '.'+ padPrice.substr(padPrice.length - 18, 18);
}

const getAggregate = async (rpcUrl, multicallAddress, total, _step, buildCall, cb) => {
  const config = {
    rpcUrl,
    multicallAddress
  }

  let step = _step
  let loopNum = Math.floor((total + step - 1) / step)
  step = Math.floor((total + loopNum - 1) / loopNum)
  let j = 0
  let calls = []
  for (let i = 0; i < total; i++) {
    calls.push(
      ...buildCall(i)
    )

    if ((j === step - 1) || (i === total - 1)) {
      // send
      try {
        const ret = await aggregate(calls, config);
        // record
        cb(ret, i - j, i)
      } catch(e) {
        console.warn(`getAggregate exception ${rpcUrl} ${multicallAddress} ${JSON.stringify(calls, null, 2)}`, e)
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
const getSmgConfigs = async (oracle, sgAll, configs, isDebtCleans) => {
  await getAggregate(oracle.chain.rpc, oracle.chain.multiCall, sgAll.length, 10,
    (i) => {
      const sg = sgAll[i];
      const groupId = sg.groupId;
      return [{
        target: oracle.address,
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
        config.groupId = ret.results.transformed[`groupId-${i}`] + ' / ' + web3.utils.hexToString(ret.results.transformed[`groupId-${i}`])
        config.status = ret.results.transformed[`status-${i}`].toString(10)
        config.deposit = ret.results.transformed[`deposit-${i}`].toString(10)
        config.chain1 = ret.results.transformed[`chain1-${i}`] + ' / ' + web3.utils.toHex(ret.results.transformed[`chain1-${i}`])
        config.chain2 = ret.results.transformed[`chain2-${i}`] + ' / ' + web3.utils.toHex(ret.results.transformed[`chain2-${i}`])
        config.curve1 = ret.results.transformed[`curve1-${i}`].toString(10)
        config.curve2 = ret.results.transformed[`curve2-${i}`].toString(10)
        config.gpk1 = ret.results.transformed[`gpk1-${i}`]
        config.gpk2 = ret.results.transformed[`gpk2-${i}`]
        config.startTime = ret.results.transformed[`startTime-${i}`].toString(10)
        config.endTime = ret.results.transformed[`endTime-${i}`].toString(10)
        if (isDebtCleans) {
          config.isDebtClean = isDebtCleans[groupId].toString()
        }

        configs[groupId] = config
      }
    }
  )
}

const getSmgIsDebtCleans = async (oracle, sgAll, isDebtCleans) => {
  await getAggregate(oracle.chain.rpc, oracle.chain.multiCall, sgAll.length, 100,
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
}

const getTokenPairIds = async (tm, total, ids, tokenPairs) => {
  await getAggregate(tm.chain.rpc, tm.chain.multiCall, total, 100,
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
}
const getTokenPairDetails = async (tm, total, ids, tokenPairs, cb) => {
  await getAggregate(tm.chain.rpc, tm.chain.multiCall, total, 10,
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

        if (cb) {
          cb(tokenPair, id)
        }
      }
    }
  )
}

const getTokenInfos = async (tm, ids, tokenPairs) => {
  await getAggregate(tm.chain.rpc, tm.chain.multiCall, ids.length, 30,
    (i) => {
      const id = parseInt(ids[i])
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
        const id = parseInt(ids[i])
        tokenPairs[id].mapAddr = ret.results.transformed[`addr-${i}`]
        tokenPairs[id].mapName = ret.results.transformed[`name-${i}`]
        tokenPairs[id].mapSymbol = ret.results.transformed[`symbol-${i}`]
        tokenPairs[id].mapDecimals = ret.results.transformed[`decimals-${i}`].toString(10)
      }
    }
  )
}

module.exports = {
  sleep,
  promisify,
  promiseEvent,
  fractionToDecimalString,
  fractionRatioToDecimalString,
  web3,
  chainIds,
  privateToAddress,
  formatToFraction,
  getAggregate,
  getSmgIsDebtCleans,
  getSmgConfigs,
  getTokenPairIds,
  getTokenPairDetails,
  getTokenInfos,
}
