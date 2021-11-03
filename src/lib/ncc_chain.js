'use strict'

const { default: BigNumber } = require('bignumber.js');
const log = require('./log')
// Non-contract chains : btc, ltc, xrp, dot
class NccChain {
  constructor(config, network) {
    Object.assign(this, config)
    this.network = network
    this.coinUnit = new BigNumber(10).pow(config.decimals)

    this.smgId2Address = {}
    this.address2smgId = {}

    this.preSmgId2Address = {}
  }

  getBlockNumber() {
    throw new Error(`getBlockNumber not implemented`)
  }

  async getBalance(address) {
    throw new Error('getBalance not implemented')
  }

  async scanMessages() {
    throw new Error('scanMessages not implemented')
  }

  toWei(ether) {
    const wei = BigNumber(ether).times('1e' + this.decimals)
    return wei.toString(10)
  }

  toEther(wei) {
    const ether = BigNumber(wei).div('1e' + this.decimals)
    return ether.toString(10)
  }

  getP2PKHAddress(gpk) {
    throw new Error(`getP2PKHAddress not implemented`)
  }

  getAddressFromSmgId(groupId, sgs) {
    if (!groupId || (groupId === '0x0000000000000000000000000000000000000000000000000000000000000000')) {
      log.error(`getAddressFromSmgId groupId is ${groupId} `)
      return null
    }

    if (!this.smgId2Address[groupId]) {
      const sg = sgs.find(sg => sg.groupId === groupId)
      if (!sg) {
        log.error(`getAddressFromSmgId groupId ${groupId} is not exist in sgs `)
        return null
      }
      
      // 数据库中,读的是wan链的状态, wan链上curve为1, 所以gpk1对应的是bn128的, gpk2是secp256的
      const gpk = this.curveType === 0 ? sg.gpk2 : sg.gpk1
      if (!gpk) {
        log.error(`getAddressFromSmgId groupId ${groupId} gpk is empty ${gpk} `)
        return null
      }

      const address = this.getP2PKHAddress(gpk)
      this.smgId2Address[groupId] = address

      if (sg.preGroupId && (sg.preGroupId !== '0x0000000000000000000000000000000000000000000000000000000000000000')) {
        this.preSmgId2Address[sg.preGroupId] = {
          address,
          groupId: sg.groupId,
        }
      }
    }

    return this.smgId2Address[groupId]
  }

  getSmgInfoFromPreSmgId(preGroupId, sgs) {
    if (!preGroupId || (preGroupId === '0x0000000000000000000000000000000000000000000000000000000000000000')) {
      log.info(`getSmgInfoFromPreSmgId preGroupId is ${preGroupId} `)
      return null
    }

    if (!this.preSmgId2Address[preGroupId]) {
      const sg = sgs.find(sg => sg.preGroupId === preGroupId)
      if (!sg) {
        log.info(`getSmgInfoFromPreSmgId preGroupId ${preGroupId} is not exist in sgs `)
        return null
      }
      const gpk = this.curveType === 0 ? sg.gpk2 : sg.gpk1
      if (!gpk || gpk.length < 130) {
        log.info(`getSmgInfoFromPreSmgId groupId ${sg.groupId} preGroupId ${preGroupId} gpk is empty ${gpk} `)
        return null
      }

      const address = this.getP2PKHAddress(gpk)
      this.smgId2Address[sg.groupId] = address
      this.preSmgId2Address[preGroupId] = {
        address,
        groupId: sg.groupId,
      }
    }

    return this.preSmgId2Address[preGroupId]
  }


  handleMessages = (msgs, db, next) => {
    if (!msgs) {
      return
    }

    // insert to msg db
    const insertMsgs = db.db.transaction((items, next) => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const {groupId, chainType} = item
        db.insertMsg({
          groupId,
          chainType,
          receive: item.value,
          tx: item.tx,
        })

        const assets = db.getMsgsByGroupId(item)
        const reducer = (sum, asset) => sum.plus(BigNumber(asset.receive))
        const totalAssets = assets.reduce(reducer, BigNumber(0))
        db.modifyDebt(groupId, chainType, {totalReceive: totalAssets.toString(10), lastReceiveTx: item.tx})
      }
      db.updateScan({chainType: this.chainType, blockNumber: next});
    })
    insertMsgs(msgs, next)

    console.log(`${this.chainType} handleMessages finished`)
  }


  _doScan = async (db, sgs, from, step, to) => {
    // console.trace(`_doScan`)
    let next = from + step - 1;
    if (next > to) {
      next = to
    }

    // 扫描获取感兴趣的事件
    const msgs = await this.scanMessages(from, next, sgs)
    // 处理这些事件, 一次性写db
    this.handleMessages(msgs, db, next)

    if (next < to) {
      setTimeout( async () => {
        await this._doScan(db, sgs, next + 1, step, to)
      }, 0)
    } else {
      // _doScan finished? try again scanInterval seconds later
      setTimeout(async () => {
        await this.scan(db)
      }, this.scanInterval * 1000)
    }
  }

  scan = async (db, _from, _to) => {
    try {
      const sgs = db.getActiveSga();
      const blockNumber = await this.getBlockNumber()
  
      const from = _from ? _from : db.getScan(this.chainType).blockNumber + 1
      const step = this.scanStep
      const to = _to ? _to : blockNumber - this.safeBlockCount
      // const to = from + 10 - this.safeBlockCount
  
      if (from > to) {
        setTimeout(async () => {
          await this.scan(db)
        }, this.scanInterval * 1000)
        return
      }
  
      log.info(`scan chain=${this.chainType}, from=${from}, to=${to}`);
  
      await this._doScan(db, sgs, from, step, to)
    } catch (e) {
      log.error(e)
      log.error(`scan ${this.chainType} exception: ${e}`)
      setTimeout(async () => {
        await this.scan(db)
      }, this.scanInterval * 1000)
    }
  }
}

module.exports = NccChain