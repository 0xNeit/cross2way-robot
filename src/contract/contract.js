const log = require('../lib/log');
const { sleep, privateToAddress } = require('../lib/utils');
const BigNumber = require('bignumber.js')

class Contract {
  constructor(chain, abi, contractAddress, ownerPrivateKey, ownerPrivateAddress) {
    this.address = contractAddress.toLowerCase();
    this.pv_key = ownerPrivateKey ? ownerPrivateKey.toLowerCase() : ownerPrivateKey;
    this.pv_address = ownerPrivateAddress ? ownerPrivateAddress.toLowerCase() : ownerPrivateAddress;
    this.price_decimal = parseInt(process.env.PRICE_DECIMAL);
    this.abi = abi;

    this.contract = new chain.web3.eth.Contract(abi, this.address);
    this.web3 = chain.web3;
    this.core = chain.core;
    this.signTx = chain.signTx;
    this.retryTimes = parseInt(process.env.RECEIPT_RETRY_TIMES);
    this.chain = chain;
  }

  async implementation() {
    return await this.core.getScFun("implementation", [], this.contract, this.abi);
  }

  async getOwner() {
    return await this.core.getScVar("owner", this.contract, this.abi);
  }

  async transferOwner(newOwner) {
    const data = this.contract.methods.transferOwner(newOwner).encodeABI();
    await this.doOperator("transferOwner", data, null, '0x00', this.retryTimes, this.pv_key, this.pv_address);
  }

  async acceptOwnership(newSk, newOwner) {
    const data2 = this.contract.methods.acceptOwnership().encodeABI();
    const obj2 = await this.doOperator("acceptOwnership", data2, null, '0x00', this.retryTimes, newSk, newOwner);
    if (obj2.status) {
      this.pv_key = newSk.toLowerCase();
      this.pv_address = newOwner.toLowerCase();
    }
  }

  async changeOwner(oldOwner, oldSk, newOwner, newSk) {
    const old = await this.getOwner();
    if (old.toLowerCase() === oldOwner.toLowerCase()) {
      const data = this.contract.methods.changeOwner(newOwner).encodeABI();
      const obj = await this.doOperator(this.changeOwner.name, data, null, '0x00', this.retryTimes, oldSk, oldOwner);
      if (obj.status) {
        await this.acceptOwnership(newSk, newOwner);
      }
    }
  }

  async upgradeTo(impl) {
    const data = this.contract.methods.upgradeTo(impl).encodeABI();
    this.doOperator(this.upgradeTo.name, data, null, '0x00', this.retryTimes, this.pv_key, this.pv_address);
  }

  async sendCoin(to, amount, count, privateKey) {
    const fromPriv = privateKey
    const from = privateToAddress(fromPriv)
    const nonce = await this.core.getTxCount(from);
    const moneyPrvKeyBuffer = Buffer.from(fromPriv, 'hex');
    const gasPrice = await this.core.getGasPrice();
    const value = "0x" + new BigNumber(this.web3.utils.toWei(amount).toString(16)).toString(16);
    const singedData = await this.signTx(21000, nonce, '0x', moneyPrvKeyBuffer, value, to, gasPrice)
    const txHash = await this.core.sendRawTxByWeb3(singedData);

    log.info(`${this.core.chainType} sendCoin hash: ${txHash}`);
    let receipt = null;
    let tryTimes = 0;
    do {
        await sleep(parseInt(process.env.RECEIPT_RETRY_INTERVAL));
        receipt = await this.core.getTransactionReceipt(txHash);
        tryTimes ++;
    } while (!receipt && tryTimes < count);
    if (!receipt) {
        const content = `${this.core.chainType} sendCoin failed to get receipt, tx=${txHash} receipt, data: ${singedData}, nonce:${nonce}`;
        log.error(content);
        throw new Error(content);
    }
    log.debug(`${this.core.chainType} sendCoin receipt: ${JSON.stringify(receipt)}`);
  }

  async doOperator(opName, data, gasLimit, value, count, privateKey, pkAddress) {
    log.debug(`${this.core.chainType} do operator: ${opName}`);
    const nonce = await this.core.getTxCount(pkAddress);

    const gas = gasLimit ? gasLimit : await this.core.estimateGas(pkAddress, this.address, value, data) + 400000;
    let gasPrice = await this.core.getGasPrice();
    log.debug(`current gas price = ${gasPrice}`)
    let rawTx = null
    // if (opName === 'setStoremanGroupConfig') {
    //   // setStoremanGroupConfig maxGasPrice is 400GW
    //   rawTx = await this.signTx(gas, nonce, data, privateKey, value, this.address, gasPrice, '0x5d21dba000');
    // } else {
    //   rawTx = await this.signTx(gas, nonce, data, privateKey, value, this.address, gasPrice);
    // }
    rawTx = await this.signTx(gas, nonce, data, privateKey, value, this.address, gasPrice);
    const txHash = await this.core.sendRawTxByWeb3(rawTx);

    log.info(`${this.core.chainType} ${opName} hash: ${txHash}`);
    let receipt = null;
    let tryTimes = 0;
    do {
        await sleep(parseInt(process.env.RECEIPT_RETRY_INTERVAL));
        receipt = await this.core.getTransactionReceipt(txHash);
        tryTimes ++;
    } while (!receipt && tryTimes < count);
    if (!receipt) {
        const content = `${opName} failed to get receipt, tx=${txHash} receipt, data: ${data}, nonce:${nonce}`;
        log.error(content);
        throw new Error(content);
    }

    log.debug(`${this.core.chainType} ${opName} receipt: ${JSON.stringify(receipt)}`);
    return  { status: receipt.status, logs: receipt.logs};
  }

  // normal quick test function
  async sendTx(opName, ...params) {
    const data = this.contract.methods[opName](...params).encodeABI();
    this.doOperator(this.upgradeTo.name, data, null, '0x00', this.retryTimes, this.pv_key, this.pv_address);
  }

  // normal quick test function
  async getFun(funcName, ...rest) {
    return await this.core.getScFun(funcName, rest, this.contract, this.abi);
  }

  // normal quick test function
  async getVar(varName) {
    return await this.core.getScVar(varName, this.contract, this.abi);
  }

  // normal quick test function
  async getMap(varName, key) {
    return await this.core.getScMap(varName, key, this.contract, this.abi);
  }
}

module.exports = Contract;
