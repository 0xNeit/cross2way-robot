// get price from graphql
// const { fractionRatioToDecimalString } = require('./utils');
const Web3 = require('web3');
const BigNumber = require('bignumber.js');

// const fetch = require('node-fetch')
// const { ApolloClient } = require('apollo-client')
// const { InMemoryCache } = require('apollo-cache-inmemory')
// const { createHttpLink } = require('apollo-link-http')
// const gql = require('graphql-tag')
// // price
// // {
// //   "finnexus": {
// //     "usd": 0.120816
// //   },
// //   "wanchain": {
// //     "usd": 0.370103
// //   }
// // }

// function TOKEN_DATA() {
//   return gql`query tokens {
//     tokens(where:{symbol: "WASP"}) {
//       id
//       symbol
//       derivedETH
//     }
//   }`
// }

// const client = new ApolloClient({
//   link: new createHttpLink({
//     uri: 'https://graph.wanswap.finance/subgraphs/name/wanswap/wanswap-subgraph-3',
//     fetch: fetch
//   }),
//   cache: new InMemoryCache(),
//   shouldBatch: true,
// })

// async function getWaspPriceFromGraphql() {
//   const query = TOKEN_DATA()
//   const p = await client.query({
//     query: query,
//     fetchPolicy: 'cache-first',
//   })
//   console.log(JSON.stringify(p, null, 2))
//   const waspPrice = fractionRatioToDecimalString(p.data.tokens[0].derivedETH, 18, priceMap['WAN'])
//   return waspPrice
// }

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


module.exports = {
  // getWaspPriceFromGraphql,
  getWaspPriceFromContract,
  getFnxPriceFromContract,
  getZooPriceFromContract,
  getPhxPriceFromContract,
}