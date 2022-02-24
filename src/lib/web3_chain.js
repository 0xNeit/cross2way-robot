const Web3 = require("web3");
const { promisify } = require("./utils");

class Web3Chain {
  constructor(rpc_url, chainType) {
    this.chainType = chainType;
    // this.chainId = chainIds[chainType];
    this.rpcType = process.env.RPC_WEB3;
    
    this.lastBlockNumber = 0
    this.lastBlockTime = 0

    this.web3 = this.createApi(rpc_url)
  }

  createApi(rpc_url) {
    const options = {
      timeout: 30000, // ms
  
      clientConfig: {
          // Useful if requests are large
          maxReceivedFrameSize: 100000000,   // bytes - default: 1MiB
          maxReceivedMessageSize: 100000000, // bytes - default: 8MiB
  
          // Useful to keep a connection alive
          keepalive: true,
          keepaliveInterval: -1 // ms
      },
  
      // Enable auto reconnection
      reconnect: {
          auto: true,
          delay: 1000, // ms
          maxAttempts: 10,
          onTimeout: false
      }
    };

    let provider = null
    if (rpc_url.indexOf('http') == 0) {
      provider = new Web3.providers.HttpProvider(rpc_url, options);
    } else if (rpc_url.indexOf('ws') == 0) {
      provider = new Web3.providers.WebsocketProvider(rpc_url, options);
      provider.on('connect', () => log.info(`provider connect ${rpc_url}`));
      provider.on('error', () => {
        log.info(`provider connect error ${rpc_url}`);
        provider.disconnect();
      });
      provider.on('close', () => {
        log.info(`provider connect close ${rpc_url}`);
      });
    }

    const web3 = new Web3(provider)
    
    return web3
  }

  async sGetBlockNumber(web3) {
    return await web3.eth.getBlockNumber();
  }

  async setApi(newWeb3) {
    if(this.web3 && this.web3.currentProvider) {
      this.web3.currentProvider.disconnect()
    }

    this.web3 = newWeb3
  }

  sendRawTxByWeb3(singedData) {
    return new Promise((resolve, reject) => {
      if (this.web3.currentProvider.connected) {
        this.web3.eth.sendSignedTransaction(singedData, (error, hash) => {
          if (error) {
            reject(error);
          } else {
            resolve(hash);
          }
        });
      } else {
        reject("web3 is not connected");
      }
    });
  };

  async getTxCount(addr) {
    return await this.web3.eth.getTransactionCount(addr);
  };

  async getBalance(addr) {
    return await this.web3.eth.getBalance(addr);
  };

  async getGasPrice() {
    return Number(await this.web3.eth.getGasPrice());
  }

  async getScVar(name, contract, abi) {
    return await contract.methods[name]().call();
  }

  async getScMap(name, key, contract, abi) {
    return await contract.methods[name](key).call();
  }

  async getScFun(name, args, contract, abi, defaultBlock=null) {
    return await contract.methods[name](...args).call(null,defaultBlock);
  }

  async getBlockNumber() {
    return await this.web3.eth.getBlockNumber();
  };

  async getChainId() {
    return await this.web3.eth.getChainId();
  }

  async getTransactionReceipt(txHash) {
    return await this.web3.eth.getTransactionReceipt(txHash);
  }

  async getBlock(blockNumber) {
    return await this.web3.eth.getBlock(blockNumber);
  }

  async estimateGas(from, to, value, data) {
    return await this.web3.eth.estimateGas({from, to, value, data});
  }

  // get txs on address between [fromBlock, toBlock]
  async getTxsBetween(address, from, to) {
    // scan all blocks
    const blocksPromise = [];
    for (let j = from; j <= to; j++) {
      // blocksPromise.push(new promisify(web3.eth.getBlock, [j, true], web3.eth));
      blocksPromise.push(new promisify(this.web3.eth.getBlock, [j, true], this.web3.eth));
    }
    const blocks = await Promise.all(blocksPromise);

    // scan all jackpot txs
    const receiptsPromise = [];
    if (blocks) {
      blocks.forEach((block) => {
        if (block.transactions) {
          if (!block.transactions) {
            console.log("transactions null")
          }
          block.transactions.forEach(tx => {
            if (tx.to !== null && address === tx.to.toLowerCase()) {
              receiptsPromise.push(new promisify(this.web3.eth.getTransactionReceipt, [tx.hash], this.web3.eth));
            }
          })
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

  // web3--1.20, new interface, only web3 support
  async getPastEvents(address, from, to, contract, eventName = 'allEvents') {
    const options = {
      fromBlock: from, 
      toBlock: to, 
      address: address, 
    }
    return await contract.getPastEvents(eventName, options);
  }

  async getPastLogs(opts) {
    const options = {
      fromBlock: opts.from, 
      toBlock: opts.to, 
      address: opts.address,
      topics: opts.topics, 
    }
    return await this.web3.eth.getPastLogs(options);
  }
  
  // close
  closeEngine() {
  }
  ////////////////////////////////////////////////////////////////////
  // only rpc support, iWan not support
  getSlot(key, slot, offset = 0) {
    const dynSlot = this.web3.utils.soliditySha3(this.web3.utils.toBN(key), this.web3.utils.toBN(slot));
    const newSlot = this.web3.utils.toBN(dynSlot).add(this.web3.utils.toBN(offset));
    return "0x" + newSlot.toString("hex");
  }

  async unlockAccount(addr, password, duration) {
    return await this.web3.eth.personal.unlockAccount(addr, password, duration);
  }

  async getSmartMap(key, slt) {
    const sltStr = slt.toString();
    const slot = "0".repeat(64 - sltStr.length) + sltStr;

    const result = await this.web3.eth.getStorageAt(
        this.address,
        slot
    );

    return result;
  }

  async getBalanceByBlockNumber(addr, blockNumber) {
    return await this.web3.eth.getBalance(addr, blockNumber);
  };

  async getScMember(slot, blockNumber) {
    const result = await this.web3.eth.getStorageAt(
      this.address,
      slot,
      blockNumber
    );
  
    return result;
  }

  async getScPositionMember(position, blockNumber) {
    const positionSlot = "0x" + this.web3.utils.leftPad(position.toString(16).replace(/^0x/i,''), 64);
    const result = await getScMember(positionSlot, blockNumber);
    return result;
  }

  // console.log(JSON.stringify(results, null, 2));
  // [
  //   {
  //     "address": "0x0C04A1FbF7ede6C23e5Da17FD3EfFA20544212EF",
  //     "blockNumber": 354690,
  //     "transactionHash": "0x37517fc99c6d6590d908afd60ff7e2ab5054cc353a3b58a59ab6a95f4a055790",
  //     "transactionIndex": 0,
  //     "blockHash": "0xd6e11252333949eb78d19f163c4bb0bb10fe4385300fcc2e40d6169bfe04222e",
  //     "logIndex": 0,
  //     "removed": false,
  //     "id": "log_18dcd1d7",
  //     "returnValues": {
  //       "groupId": "0x111122223333444455556666777788889999aaaabbbbccccddddeeeeffffcccc",
  //       "workStart": "1",
  //       "workDuration": "2",
  //       "registerDuration": "3",
  //       "preGroupId": "0x0000000000000000000000000000000000000000000000000000000000000000"
  //     },
  //     "event": "registerStartEvent",
  //     "signature": "0x7f783b8887d89cbb332b296a95486e5b866f88434833c836c184970f6c8db1bf",
  //     "raw": {
  //       "data": "0x000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003",
  //       "topics": [
  //         "0x7f783b8887d89cbb332b296a95486e5b866f88434833c836c184970f6c8db1bf",
  //         "0x111122223333444455556666777788889999aaaabbbbccccddddeeeeffffcccc",
  //         "0x0000000000000000000000000000000000000000000000000000000000000000"
  //       ]
  //     }
  //   }
  // ]
}

module.exports = Web3Chain;