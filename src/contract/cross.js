const Contract = require('./contract');
const abi = require('../../abi/abi.CrossDelegate.json');

class CrossDelegate extends Contract {
  constructor(chain, address, ownerPV, ownerAddress, _abi) {
    super(chain, _abi ? _abi : abi, address, ownerPV, ownerAddress);
  }

  // returns(address tokenManager, address smgAdminProxy, address smgFeeProxy, address quota, address sigVerifier)
  async getPartners() {
    return await this.getFun(this.getPartners.name)
  }

  // returns(uint lockFee, uint revokeFee)
  async getFees(fromChainId, toChainId) {
    return await this.getFun(this.getFees.name, fromChainId, toChainId)
  }

  // htlc time uint256
  async lockedTime() {
    return await this.getVar('lockedTime')
  }

  // 
  async getChainId() {
    // web3.utils.toHex("current"), web3.utils.toHex("chainID")
    return await this.getFun('getUintValue', '0x63757272656e74', '0x636861696e4944')
  }

  // smgFeeReceiverTimeout time uint256
  async smgFeeReceiverTimeout() {
    return await this.getVar('smgFeeReceiverTimeout')
  }
}

module.exports = CrossDelegate