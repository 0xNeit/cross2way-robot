const iWanClient = require('iwan-sdk');
const BigNumber = require("bignumber.js");
const { promisify, sleep, web3, chainIds } = require("./utils");

class IWan {
  static sApiClient = null;
  static getApiClient() {
    if (IWan.sApiClient === null) {
      const option = {
        url: process.env.IWAN_URL,
        port: parseInt(process.env.IWAN_PORT),
        flag: process.env.IWAN_FLAG,
        version: process.env.IWAN_VERSION,
        timeout: parseInt(process.env.IWAN_TIMEOUT),
      };
      IWan.sApiClient = new iWanClient(process.env.IWAN_APIKEY, process.env.IWAN_SECRETKEY, option);
    }
    return IWan.sApiClient;
  }

  constructor(chainType) {
    this.apiClient = IWan.getApiClient();
    this.web3 = web3;
    this.chainType = chainType;
    // this.chainId = chainIds[chainType];
    this.rpcType = process.env.RPC_IWAN;
  }

  async sendRawTxByWeb3(singedData) {
      return await this.apiClient.sendRawTransaction(this.chainType, singedData);
  };

  async getTxCount(addr) {
    return parseInt(await this.apiClient.getNonce(this.chainType, addr), 16);
  }

  async getBalance(addr) {
    return await this.apiClient.getBalance(this.chainType, addr);
  }

  async getGasPrice() {
    return Number(await this.apiClient.getGasPrice(this.chainType));
  }

  web0ToWeb1(name, result, contract, args) {
    if (result instanceof Array) {
      const method = contract.methods[name](...args);
      const rt = {};
      for (let i=0; i<method._method.outputs.length; i++) {
        const rtType = method._method.outputs[i].type;
        // web0.20 === delegatePool = "1.05e+21", BN not support
        if (rtType === "uint256" || rtType === "uint") {
          rt[i] = new BigNumber(result[i]).toString(10);
        }
        else if (rtType === "uint256[]") {
          const tmp = [];
          result.forEach((v) => {tmp.push(new BigNumber(v).toString(10));} )
          rt[i] = tmp;

          if (method._method.outputs.length === 1) {
            return tmp;
          }
        } else {
          rt[i] = result[i];
        }
        rt[method._method.outputs[i].name] = rt[i];
      }
      
      return rt;
    } else {
      const method = contract.methods[name](...args);
      const rtType = method._method.outputs[0].type;
      if (rtType === "uint256" || rtType === "uint") {
        return new BigNumber(result).toString(10)
      } else {
        return result;
      }
    }
    return rt;
  }
  async getScVar(name, contract, abi) {
    const result = await this.apiClient.getScVar(this.chainType, contract._address.toLowerCase(), name, abi);
    return this.web0ToWeb1(name, result, contract, []);
  }
  async getScMap(name, key, contract, abi) {
    const result = await this.apiClient.getScMap(this.chainType, contract._address.toLowerCase(), name, key, abi);
    return this.web0ToWeb1(name, result, contract, [key]);
  }

  async getScFun(name, args, contract, abi) {
    const result = await this.apiClient.callScFunc(this.chainType, contract._address.toLowerCase(), name, args, abi);
    return this.web0ToWeb1(name, result, contract, args);
  }

  async getBlockNumber() {
    return await this.apiClient.getBlockNumber(this.chainType);
  };

  async getChainId() {
    return await this.apiClient.getChainId(this.chainType);
  }

  async getTransactionReceipt(txHash) {
    try {
      return await this.apiClient.getTransactionReceipt(this.chainType, txHash);
    } catch (e) {
      return null;
    }
  }

  async getBlock(blockNumber) {
    return await this.apiClient.getBlockByNumber(this.chainType, blockNumber);
  }

  async estimateGas(from, to, value, data) {
    return Number(await this.apiClient.estimateGas(this.chainType, {from, to, value, data}))
  }

  async getTxsBetween(address, fromBlock, toBlock) {
    const txs = await this.apiClient.getTransByAddressBetweenBlocks(this.chainType, address, fromBlock, toBlock);
    const receiptsPromise = [];
    if (txs) {
      txs.forEach(tx => {
        if (address === tx.to.toLowerCase()) {
          receiptsPromise.push(new promisify(this.apiClient.getTransactionReceipt, [this.chainType, tx.hash], this.apiClient));
        }
      })
    }

    const receipts = await Promise.all(receiptsPromise);
    if (receipts.length > 1) {
      receipts.sort((a, b) => {
        if (a.blockNumber < b.blockNumber) {
          return -1;
        } else if (a.blockNumber > b.blockNumber) {
          return 1;
        } else if (a.blockNumber === b.blockNumber) {
          a.transactionIndex > b.transactionIndex ? 1 : -1;
        }
      })
    }
    return receipts;
  }

  async getPastEvents(address, from, to, contract, eventName = 'allEvents') {
    const options = {
      fromBlock: from, 
      toBlock: to, 
      address: address, 
    }
    
    const event = eventName === 'allEvents' ? contract.allEvents() : contract.events[eventName]();
    const topic = event.arguments[0].topics[0]
    const logs = await this.apiClient.getScEvent(this.chainType, address, [topic], options);
    logs.forEach(log => {
      if (!log.returnValues) {
        log.returnValues = event._formatOutput(log).returnValues;
      }
    })
    return logs;
  }

  closeEngine() {
    if (!this.apiClient.isClosing() && !this.apiClient.isClosed()) {
      if (this.apiClient.isOpen()) {
        return this.apiClient.close();
      }
      // return this.apiClient.close();
    }
  }

  ///////////////////////////////////////////////////
  //  pos
  async getStakerInfo(blockNumber) {
    return await this.apiClient.getStakerInfo(this.chainType, blockNumber);
  };
  ///////////////////////////////////////////////////////////
  // pos only for test
  async getRandom(epochId, blockNumber) {
    return await this.apiClient.getRandom(this.chainType, epochId, blockNumber);
  }

  async getEpochID() {
    return await this.apiClient.getEpochID(this.chainType);
  }

  async getTimeByEpochID(epochId) {
    return await this.apiClient.getTimeByEpochID(this.chainType, epochId);
  }

  async getRegTokens() {
    return await this.apiClient.getRegTokens(this.chainType)
  }
}

module.exports = IWan;