const { web3 } = require('../src/lib/utils');
const hexToBytes = web3.utils.hexToBytes;
const aAccount = hexToBytes("0x0000000000000000000000000000000000000000");
const fromAccount = hexToBytes('0x0000000000000000000000000000000000000000');

const chainId = {
  ETH: 0x8000003c,
  WAN: 0x8057414e,
  BTC: 0x80000000,
  ETC: 0x8000003d,
  EOS: 0x800000c2,
}

module.exports = {
  ETH2WAN: {
    originChain: 'ETH',
    originToken: {name: 'Ethereum', symbol: 'ETH', decimals: 18},
    mapChain: 'WAN',
    mapToken: {name: 'wanETH@Wanchain', symbol: 'wanETH', decimals: 18},
    pair: {
      id: 1,
      aInfo: [aAccount, "Ethereum", "ETH", 18, chainId.ETH],
      fromChainID: chainId.ETH,
      fromAccount: fromAccount,
      toChainID: chainId.WAN,
      tokenAddress: '0xFABd5d341dd3b933Ea9906d921Df7BE79c156E8D',
    },
  },
  WAN2ETH: {
    originChain: 'WAN',
    originToken: {name: 'Wanchain', symbol: 'WAN', decimals: 18},
    mapChain: 'ETH',
    mapToken: {name: 'WAN@Ethereum', symbol: 'WAN', decimals: 18},
    pair: {
      id: 2,
      aInfo: [aAccount, "Wanchain", "WAN", 18, chainId.WAN],
      fromChainID: chainId.WAN,
      fromAccount: fromAccount,
      toChainID: chainId.ETH,
      tokenAddress: '0xf832a671af322a28493b26D56c952795C05d7B11',
    },
  },
  LINK2WAN: {
    originChain: 'ETH',
    originToken: {name: 'Chain Link', symbol: 'LINK', decimals: 18},
    mapChain: 'WAN',
    mapToken: {name: 'wanLINK@Wanchain', symbol: 'wanLINK', decimals: 18},
    pair: {
      id: 3,
      aInfo: [hexToBytes("0x01be23585060835e02b77ef475b0cc51aa1e0709"), "Chain Link", "LINK", 18, chainId.ETH],
      fromChainID: chainId.ETH,
      fromAccount: hexToBytes("0x01be23585060835e02b77ef475b0cc51aa1e0709"),
      toChainID: chainId.WAN,
      tokenAddress: '0x6e7bC85ab206965a4118DA06C9E66Bd49bDc33B8',
    },
  },
  FNX2ETH: {
    originChain: 'WAN',
    originToken: {name: 'FinNexus ', symbol: 'FNX', decimals: 18},
    mapChain: 'ETH',
    mapToken: {name: 'wanFNX@Ethereum', symbol: 'wanFNX', decimals: 18},
    pair: {
      id: 4,
      aInfo: [hexToBytes("0x2283d27be033D183F0F46E70992Ebc1356f6e8b3"), "FinNexus", "FNX", 18, chainId.WAN],
      fromChainID: chainId.WAN,
      fromAccount: hexToBytes("0x2283d27be033D183F0F46E70992Ebc1356f6e8b3"),
      toChainID: chainId.ETH,
      tokenAddress: '0xf9a9Ef6078Bd6679d530ad61c6108AB3Ea3b1bA8',
    },
  },

  BTC2ETH: {
    originChain: 'WAN',
    originToken: {name: 'Bitcoin', symbol: 'BTC', decimals: 8},
    mapChain: 'ETH',
    mapToken: {name: 'wanBTC@Ethereum', symbol: 'wanBTC', decimals: 8},
    pair: {
      id: 5,
      aInfo: [hexToBytes('0xC978c14020b4a5965337fb141D2187f387De5Ce8'), "Bitcoin", "BTC", 8, chainId.WAN],
      fromChainID: chainId.WAN,
      fromAccount: hexToBytes('0xC978c14020b4a5965337fb141D2187f387De5Ce8'),
      toChainID: chainId.ETH,
      tokenAddress: '0x1c5E5C977f95681923A026AB1ED72fF1a12b0737',
    },
  },

  EOS2ETH: {
    originChain: 'WAN',
    originToken: {name: 'EOS', symbol: 'EOS', decimals: 4},
    mapChain: 'ETH',
    mapToken: {name: 'wanEOS@Ethereum', symbol: 'wanEOS', decimals: 4},
    pair: {
      id: 6,
      aInfo: [hexToBytes('0x31DdD0Bd73bb1fD4068ACC91c966B99C24B016D8'), "EOS", "EOS", 4, chainId.WAN],
      fromChainID: chainId.WAN,
      fromAccount: hexToBytes('0x31DdD0Bd73bb1fD4068ACC91c966B99C24B016D8'),
      toChainID: chainId.ETH,
      tokenAddress: '0xdD8AD504B0FFbF5188C69EF8914f9bd3B5b8E4Df',
    },
  },
}