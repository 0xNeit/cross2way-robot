const Contract = require('./contract');
const abiOracle = require('../../abi/abi.OracleDelegate.json');
const { web3, privateToAddress, formatToFraction } = require('../lib/utils');
const log = require('../lib/log');

const ether = web3.utils.toBN(Math.pow(10,18))
class Oracle extends Contract {
  static currentGroupIdKey1 = web3.utils.keccak256('MULTICOINSTAKE_RESERVED_KEY____1')
  static currentGroupIdKey2 = web3.utils.keccak256('MULTICOINSTAKE_RESERVED_KEY____2')
  constructor(chain, address, ownerPV, ownerAddress, abi) {
    super(chain, abi ? abi : abiOracle, address, ownerPV, ownerAddress);
    this.adminSK = ownerPV ? ownerPV.toLowerCase() : ownerPV
    this.adminAddress = ownerAddress ? ownerAddress.toLowerCase() : ownerAddress
    this.ownerSK = ownerPV ? ownerPV.toLowerCase() : ownerPV
    this.ownerAddress = ownerAddress ? ownerAddress.toLowerCase() : ownerAddress
  }

  async updatePrice(symbolPriceMap, oldMap, deltaMap) {
    const keys = Object.keys(symbolPriceMap);
    if (keys.length === 0) {
      return ;
    }
    const priceUintArray = [];
    const symbolByteArray = [];

    keys.forEach(it => {
      const priceUnit = symbolPriceMap[it];
      symbolByteArray.push(web3.utils.toHex(it));
      priceUintArray.push(priceUnit);
      if (oldMap && deltaMap) {
        log.info(`${this.core.chainType} ${it} will update from ${formatToFraction(oldMap[it])} to ${formatToFraction(web3.utils.toBN(priceUnit).toString(10))}, delta = ${deltaMap[it]}/${process.env.THRESHOLD_TIMES}`)
      }
    })

    const data = this.contract.methods.updatePrice(symbolByteArray, priceUintArray).encodeABI();
    return await this.doOperator(this.updatePrice.name, data, null, '0x00', this.retryTimes, this.adminSK, this.adminAddress);
  }

  async setCurrentGroupIds(values) {
    const data = this.contract.methods.updatePrice([Oracle.currentGroupIdKey1, Oracle.currentGroupIdKey2], values).encodeABI();
    return await this.doOperator('updatePrice', data, null, '0x00', this.retryTimes, this.adminSK, this.adminAddress);
  }

  async getCurrentGroupIds() {
    return await this.core.getScFun("getValues", [[Oracle.currentGroupIdKey1, Oracle.currentGroupIdKey2]], this.contract, this.abi);
  }

  setAdminSk(sk) {
    this.adminSK = sk
    this.adminAddress = privateToAddress(sk)
  }
  setOwnerSk(sk) {
    this.ownerSK = sk
    this.ownerAddress = privateToAddress(sk)
  }

  async setAdmin(addr) {
    const data = this.contract.methods.setAdmin(addr).encodeABI();
    return await this.doOperator(this.setAdmin.name, data, null, '0x00', this.retryTimes, this.ownerSK, this.ownerAddress);
  }

  async updateDeposit(smgID, amount) {
    const data = this.contract.methods.updateDeposit(smgID, amount).encodeABI();
    return await this.doOperator(this.updateDeposit.name, data, null, '0x00', this.retryTimes, this.adminSK, this.adminAddress);
  }

  async setStoremanGroupStatus(id, status) {
    const data = this.contract.methods.setStoremanGroupStatus(id, status).encodeABI();
    return await this.doOperator(this.setStoremanGroupStatus.name, data, null, '0x00', this.retryTimes, this.adminSK, this.adminAddress);
  }

  async setStoremanGroupConfig(id, status, deposit, chain, curve, gpk1, gpk2, startTime, endTime) {
    const data = this.contract.methods.setStoremanGroupConfig(id, status, deposit, chain, curve, gpk1, gpk2, startTime, endTime).encodeABI();
    return await this.doOperator(this.setStoremanGroupConfig.name, data, null, '0x00', this.retryTimes, this.adminSK, this.adminAddress);
  }

  async getValue(key) {
    return await this.core.getScFun("getValue", [web3.utils.toHex(key)], this.contract, this.abi);
  }

  async getValues(keys) {
    const symbolsStringArray = keys.replace(/\s+/g,"").split(',');
    const symbolsArray = symbolsStringArray.map(i => {return web3.utils.toHex(i);})
    return await this.core.getScFun("getValues", [symbolsArray], this.contract, this.abi);
  }

  async getValuesByArray(keysArray) {
    const symbolsArray = keysArray.map(i => {return web3.utils.toHex(i);})
    return await this.core.getScFun("getValues", [symbolsArray], this.contract, this.abi);
  }

  async getDeposit(smgID) {
    return await this.core.getScFun("getDeposit", [smgID], this.contract, this.abi);
  }

  async getStoremanGroupConfig(id) {
    return await this.core.getScFun("getStoremanGroupConfig", [id], this.contract, this.abi);
  }

  async admin() {
    return await this.core.getScVar('admin', this.contract, this.abi);
  }

  async setDebtClean(smgID, isClean) {
    const data = this.contract.methods.setDebtClean(smgID, isClean).encodeABI();
    return await this.doOperator(this.setDebtClean.name, data, null, '0x00', this.retryTimes, this.adminSK, this.adminAddress);
  }

  async isDebtClean(smgID) {
    return await this.core.getScFun('isDebtClean', [smgID], this.contract, this.abi)
  }
}

module.exports = Oracle;