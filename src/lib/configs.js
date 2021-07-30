// standard chain config
module.exports = {
  'polygon': {
    'testnet': {
      chainType: 'MATIC',
      rpc: 'https://rpc-mumbai.maticvigil.com/',
      gasPrice: 0xba43b74000,
      gasLimit: 0x7a1200,
      chainId: 80001,
      curveType: '1',
      deployedFile: 'maticTestnet.json',
      bip44: 0x800003c6,
      ownerSk: '18f81910df8ddfd5cc4d93e554805b5268a494bc1ff0d28f09be2025fb87984c',
      chainKind: 'eth',

      symbol: 'MATIC',
      decimals: 8,
      chainName: 'polygon'
    }
  },
  'arbitrum': {
    'testnet': {
      chainType: 'ARB',
      rpc: 'https://rinkeby.arbitrum.io/rpc/',
      gasPrice: 0x2faf0800,
      gasLimit: 0x7a1200,
      chainId: 421611,
      curveType: '1',
      deployedFile: 'arbTestnet.json',
      bip44: 0x40000002,
      ownerSk: '18f81910df8ddfd5cc4d93e554805b5268a494bc1ff0d28f09be2025fb87984c',
      chainKind: 'eth',

      symbol: 'ETH',
      decimals: 18,
      chainName: 'arbitrum',

      explorer: 'https://rinkeby-explorer.arbitrum.io/#/',
    }
  },
}