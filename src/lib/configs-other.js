// standard chain config
module.exports = {
  'bitcoin': {
    'testnet': {
      chainType: 'WAN',
      rpc: 'https://gwan-ssl.wandevs.org:46891',
      gasPrice: 0x3b9aca00,
      gasLimit: 0x989680,
      chainId: 3,
      curveType: '1',
      deployedFile: 'testnet.json',
      bip44: 0x8057414e,
      ownerSk: '18f81910df8ddfd5cc4d93e554805b5268a494bc1ff0d28f09be2025fb87984c',
      chainKind: 'eth',

      symbol: 'WAN',
      decimals: 18,
      chainName: 'wan',
    },
  },
  'ltc': {

  },
  'xrp': {

  },
  'dot': {

  }
}