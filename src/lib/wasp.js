const Web3 = require('web3');
const BigNumber = require('bignumber.js');
const { aggregate } = require('@makerdao/multicall')

const web3 = new Web3(new Web3.providers.HttpProvider('https://gwan-ssl.wandevs.org:56891'));
const abi = [{"constant":true,"inputs":[],"name":"getReserves","outputs":[{"internalType":"uint112","name":"_reserve0","type":"uint112"},{"internalType":"uint112","name":"_reserve1","type":"uint112"},{"internalType":"uint32","name":"_blockTimestampLast","type":"uint32"}],"payable":false,"stateMutability":"view","type":"function"}];

async function getWaspPriceFromContract(wanPrice) {
  // wasp/wwan
  const address = "0x29239a9b93a78decec6e0dd58ddbb854b7ffb0af";
  const sc = new web3.eth.Contract(abi, address);
  let ret = await sc.methods.getReserves().call();
  console.log('ret', ret);
  const wp = new BigNumber(wanPrice)
  const wsp = new BigNumber(ret._reserve1)
  const wan = new BigNumber(ret._reserve0)
  let p = wsp.div(wan).multipliedBy(wp).integerValue();

  console.log("p", p.toString());

  return '0x' + p.toString(16)
}

async function getFnxPriceFromContract(wanPrice) {
  // fnx/wwan
  const fnxWanPairAddress = '0x4bbbaaa14725d157bf9dde1e13f73c3f96343f3d'
  const sc = new web3.eth.Contract(abi, fnxWanPairAddress);
  let ret = await sc.methods.getReserves().call();
  console.log('ret', ret);
  const wp = new BigNumber(wanPrice)
  const fnx = new BigNumber(ret._reserve1)
  const wan = new BigNumber(ret._reserve0)
  let p = fnx.div(wan).multipliedBy(wp).integerValue();

  console.log("p", p.toString());

  return '0x' + p.toString(16)
}

async function getPhxPriceFromContract(waspPrice) {
  // wasp/phx
  const phxWaspPairAddress = '0x7f84994114c41191386b7cb5e9296896e44a41ed'
  const sc = new web3.eth.Contract(abi, phxWaspPairAddress);
  let ret = await sc.methods.getReserves().call();
  console.log('ret', ret);
  const wp = new BigNumber(waspPrice)
  const wasp = new BigNumber(ret._reserve0)
  const phx = new BigNumber(ret._reserve1)
  let p = wasp.div(phx).multipliedBy(wp).integerValue();

  console.log("p", p.toString());

  return '0x' + p.toString(16)
}

async function getZooPriceFromContract(waspPrice) {
  // zoo/wasp
  const zooWaspPairAddress = '0xa0cf1f16994ecd6d4613024b3ebb61b9f9c06f06'
  const sc = new web3.eth.Contract(abi, zooWaspPairAddress);
  let ret = await sc.methods.getReserves().call();
  console.log('ret', ret);
  const wp = new BigNumber(waspPrice)
  const wasp = new BigNumber(ret._reserve1)
  const zoo = new BigNumber(ret._reserve0)
  let p = wasp.div(zoo).multipliedBy(wp).integerValue();

  console.log("p", p.toString());

  return '0x' + p.toString(16)
}

async function getWandPriceFromContract(waspPrice) {
  // wand/wasp
  const wandWaspPairAddress = '0xcd326d196feb12471cef51c73d965b278c71a852'
  const sc = new web3.eth.Contract(abi, wandWaspPairAddress);
  let ret = await sc.methods.getReserves().call();
  console.log('ret', ret);
  const wp = new BigNumber(waspPrice)
  const wasp = new BigNumber(ret._reserve1)
  const wand = new BigNumber(ret._reserve0)
  let p = wasp.div(wand).multipliedBy(wp).integerValue();

  console.log("p", p.toString());

  return '0x' + p.toString(16)
}

const calcPrice = (_r1, _r0, r1Price) => {
  const r0 = new BigNumber(_r0)
  const r1 = new BigNumber(_r1)

  return r1.div(r0).multipliedBy(r1Price).integerValue()
}

const getContractPrices = async (wanPriceStr) => {
  const config = {
    rpcUrl: 'https://gwan-ssl.wandevs.org:56891',
    multicallAddress: '0xba5934ab3056fca1fa458d30fbb3810c3eb5145f',
  }
  const calls = [{
    // wasp/wwan
    target: '0x29239a9b93a78decec6e0dd58ddbb854b7ffb0af',
    call: ['getReserves()(uint112,uint112,uint32)'],
    returns: [
      ['wasp_wwan_r0', val => val],
      ['wasp_wwan_r1', val => val],
      ['wasp_wwan_time', val => val],
    ]
  }, {
    // zoo/wasp
    target: '0xa0cf1f16994ecd6d4613024b3ebb61b9f9c06f06',
    call: ['getReserves()(uint112,uint112,uint32)'],
    returns: [
      ['zoo_wasp_r0', val => val],
      ['zoo_wasp_r1', val => val],
      ['zoo_wasp_time', val => val],
    ]
  }, {
    // wand/wasp
    target: '0xcd326d196feb12471cef51c73d965b278c71a852',
    call: ['getReserves()(uint112,uint112,uint32)'],
    returns: [
      ['wand_wasp_r0', val => val],
      ['wand_wasp_r1', val => val],
      ['wand_wasp_time', val => val],
    ]
  }, {
    // wasp/phx
    target: '0x7f84994114c41191386b7cb5e9296896e44a41ed',
    call: ['getReserves()(uint112,uint112,uint32)'],
    returns: [
      ['wasp_phx_r0', val => val],
      ['wasp_phx_r1', val => val],
      ['wasp_phx_time', val => val],
    ]
  }]

  const ret = await aggregate(calls, config)

  const wanPrice = new BigNumber(wanPriceStr)
  const waspPrice = calcPrice(
    ret.results.transformed['wasp_wwan_r1'].toHexString(),
    ret.results.transformed['wasp_wwan_r0'].toHexString(),
    wanPrice)
  const zooPrice = calcPrice(
    ret.results.transformed['zoo_wasp_r1'].toHexString(),
    ret.results.transformed['zoo_wasp_r0'].toHexString(),
    waspPrice)
  const wandPrice = calcPrice(
    ret.results.transformed['wand_wasp_r1'].toHexString(),
    ret.results.transformed['wand_wasp_r0'].toHexString(),
    waspPrice)
  const phxPrice = calcPrice(
    ret.results.transformed['wasp_phx_r0'].toHexString(),
    ret.results.transformed['wasp_phx_r1'].toHexString(),
    waspPrice)

  return {
    waspPrice: '0x' + waspPrice.toString(16),
    zooPrice: '0x' + zooPrice.toString(16),
    wandPrice: '0x' + wandPrice.toString(16),
    phxPrice: '0x' + phxPrice.toString(16),
  }
}

// setTimeout(async () => {
//   const a = await getContractPrices('1000000000000000000')
//   console.log(a)
// }, 0)

module.exports = {
  // getWaspPriceFromGraphql,
  getWaspPriceFromContract,
  getFnxPriceFromContract,
  getZooPriceFromContract,
  getPhxPriceFromContract,
  getWandPriceFromContract,
  getContractPrices,
}