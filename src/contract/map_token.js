const Contract = require('./contract');
const abiMapToken = require('../../abi/map-token.json');

class MapToken extends Contract {
  constructor(chain, address, ownerPV, ownerAddress) {
    super(chain, abiMapToken, address, ownerPV, ownerAddress);
  }

  async mint(addr, amount) {
    const data = this.contract.methods.mint(addr, amount).encodeABI();
    return await this.doOperator(this.mint.name, data, null, '0x00', this.retryTimes, this.pv_key, this.pv_address);
  }

  async burn(addr, amount) {
    const data = this.contract.methods.burn(addr, amount).encodeABI();
    return await this.doOperator(this.burn.name, data, null, '0x00', this.retryTimes, this.pv_key, this.pv_address);
  }

  async update(name, symbol) {
    const data = this.contract.methods.update(name, symbol).encodeABI();
    return await this.doOperator(this.update.name, data, null, '0x00', this.retryTimes, this.pv_key, this.pv_address);
  }
}

module.exports = MapToken;