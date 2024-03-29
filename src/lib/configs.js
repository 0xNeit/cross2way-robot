// standard chain config
module.exports = {
  'wanchain': {
    'testnet': {
      chainType: 'WAN',
      rpc: 'https://gwan-ssl.wandevs.org:46891',
      gasPrice: 0x3b9aca00,
      gasLimit: 0x989680,
      chainId: 999,
      curveType: '1',
      deployedFile: 'testnet.json',
      bip44: 0x8057414e,
      ownerSk: 'b6a03207128827eaae0d31d97a7a6243de31f2baf99eabd764e33389ecf436fc',
      chainKind: 'eth',

      symbol: 'WAN',
      decimals: 18,
      chainName: 'wan',

      multiCall: '0x14095a721Dddb892D6350a777c75396D634A7d97'.toLowerCase(),
    },
    'mainnet': {
      chainType: 'WAN',
      rpc: 'https://gwan-ssl.wandevs.org:56891',
      gasPrice: 0x3b9aca00,
      gasLimit: 0x989680,
      chainId: 888,
      curveType: '1',
      deployedFile: 'mainnet.json',
      bip44: 0x8057414e,
      ownerSk: 'b6a03207128827eaae0d31d97a7a6243de31f2baf99eabd764e33389ecf436fc',
      chainKind: 'eth',

      symbol: 'WAN',
      decimals: 18,
      chainName: 'wan',

      multiCall: '0xBa5934Ab3056fcA1Fa458D30FBB3810c3eb5145f'.toLowerCase(),
    },
  },
  'ethereum': {
    'testnet': {
      chainType: 'ETH',
      rpc: 'http://geth-testnet-op.wandevs.org:36892',
      gasPrice: 0xe8d4a51000,
      gasLimit: 0x7a1200,
      chainId: 4,
      curveType: '1',
      deployedFile: 'rinkeby.json',
      bip44: 0x8000003c,
      ownerSk: '18f81910df8ddfd5cc4d93e554805b5268a494bc1ff0d28f09be2025fb87984c',
      chainKind: 'eth',

      symbol: 'ETH',
      decimals: 18,
      chainName: 'ethereum',

      multiCall: '0x42ad527de7d4e9d9d011ac45b31d8551f8fe9821'.toLowerCase(),
    },
    'mainnet': {
      chainType: 'ETH',
      rpc: 'http://geth-mainnet-op.wandevs.org:26892',
      gasPrice: 0x174876e800,
      gasLimit: 0x7a1200,
      chainId: 1,
      curveType: '1',
      deployedFile: 'ethereum.json',
      bip44: 0x8000003c,
      ownerSk: '18f81910df8ddfd5cc4d93e554805b5268a494bc1ff0d28f09be2025fb87984c',
      chainKind: 'eth',

      symbol: 'ETH',
      decimals: 18,
      chainName: 'ethereum',

      multiCall: '0xeefba1e63905ef1d7acba5a8513c70307c1ce441'.toLowerCase(),
    },
  },
  'bsc': {
    'testnet': {
      chainType: 'BSC',
      rpc: 'https://data-seed-prebsc-2-s1.binance.org:8545/',
      gasPrice: 0xe8d4a51000,
      gasLimit: 0x7a1200,
      chainId: 97,
      curveType: '1',
      deployedFile: 'testnet_bsc.json',
      bip44: 0x800002ca,
      ownerSk: '18f81910df8ddfd5cc4d93e554805b5268a494bc1ff0d28f09be2025fb87984c',
      chainKind: 'eth',

      symbol: 'BSC',
      decimals: 18,
      chainName: 'bsc',

      multiCall: '0x54b738619DE4770A17fF3D6bA4c2b591a886A062'.toLowerCase(),
    },
    'mainnet': {
      chainType: 'BSC',
      rpc: 'https://bsc-dataseed1.binance.org/',
      gasPrice: 0xe8d4a51000,
      gasLimit: 0x7a1200,
      chainId: 56,
      curveType: '1',
      deployedFile: 'bsc.json',
      bip44: 0x800002ca,
      ownerSk: '18f81910df8ddfd5cc4d93e554805b5268a494bc1ff0d28f09be2025fb87984c',
      chainKind: 'eth',

      symbol: 'BSC',
      decimals: 18,
      chainName: 'bsc',

      multiCall: '0x023a33445F11C978f8a99E232E1c526ae3C0Ad70'.toLowerCase(),
    },
  },
  'avalanche': {
    'testnet': {
      chainType: 'AVAX',
      rpc: 'https://api.avax-test.network/ext/bc/C/rpc',
      gasPrice: 0x6d6e2edc00,
      gasLimit: 0x2dc6c0,
      chainId: 43113,
      curveType: '1',
      deployedFile: 'testnet_avax.json',
      bip44: 0x80002328,
      ownerSk: '18f81910df8ddfd5cc4d93e554805b5268a494bc1ff0d28f09be2025fb87984c',
      chainKind: 'eth',

      symbol: 'AVAX',
      decimals: 18,
      chainName: 'avax',

      multiCall: '0x0EA414bAAf9643be59667E92E26a87c4Bae3F33a'.toLowerCase(),
    },
    // 'mainnet': {
    //   chainType: 'AVAX',
    //   rpc: 'https://api.avax.network/ext/bc/C/rpc',
    //   gasPrice: 0x6d6e2edc00,
    //   gasLimit: 0x2dc6c0,
    //   chainId: 43113,
    //   curveType: '1',
    //   deployedFile: 'avalancheMainnet.json',
    //   bip44: 0x80002328,
    //   ownerSk: '18f81910df8ddfd5cc4d93e554805b5268a494bc1ff0d28f09be2025fb87984c',
    //   chainKind: 'eth',

    //   symbol: 'AVAX',
    //   decimals: 18,
    //   chainName: 'avax',

    //   multiCall: '0xA4726706935901fe7dd0F23Cf5D4fb19867dfc88'.toLowerCase(),
    // }
  },
  'moonbeam': {
    'testnet': {
      chainType: 'DEV',
      rpc: 'https://rpc.testnet.moonbeam.network',
      gasPrice: 0xba43b74000,
      gasLimit: 0x7a1200,
      chainId: 1287,
      curveType: '1',
      deployedFile: 'moonbeamTestnet.json',
      bip44: 0x40000001,
      ownerSk: '18f81910df8ddfd5cc4d93e554805b5268a494bc1ff0d28f09be2025fb87984c',
      chainKind: 'eth',

      symbol: 'DEV',
      decimals: 18,
      chainName: 'moonbeam',

      multiCall: '0x136333217C18Cd6E018B85Aaf8Bd563EB72E97Fd'.toLowerCase(),
    },
  },
  'polygon': {
    'testnet': {
      chainType: 'MATIC',
      rpc: 'https://rpc-mumbai.maticvigil.com',
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
      chainName: 'polygon',

      multiCall: '0x905B3237B2367B2DdEBdF54D4F5320429710850a'.toLowerCase(),
    }
  },
  'arbitrum': {
    'testnet': {
      chainType: 'ARB',
      rpc: 'https://rinkeby.arbitrum.io/rpc',
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

      multiCall: '0x06c6b65A8d5F52FA1E6d90bDB3Bdd4CB85F4587f'.toLowerCase(),

      explorer: 'https://rinkeby-explorer.arbitrum.io/#/',
    }
  },
}