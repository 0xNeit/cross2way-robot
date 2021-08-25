const assert = require('assert')
const { describe, it } = require('mocha')
const bitcoin = require('bitcoinjs-lib')
const regtestUtils = require('./_regtest')

const bs58 = require('bs58')
const ecc = require('tiny-secp256k1');
const bech32 = require('bech32')

const dhttp = regtestUtils.dhttp;
const TESTNET = bitcoin.networks.testnet;
const MAINNET = bitcoin.networks.bitcoin;
const PRIVATENET = bitcoin.networks.regtest;

// 交易类型 : p2pkh, p2pk, p2ms, p2sh, op_return, p2wpkh, p2wsh
//   p2pkh :
//   p2pk
//   p2ms
//   p2sh
//   op_return
//

// 私钥格式 : K = k * G, k
//   16进制私钥 : 256bit = 64Byte = 128hex
//   wif压缩格式私钥 : k = k+01 带入下式 
//   wif格式私钥 : k1 = 80(版本号)+k    Base58( k1 + first4Byte( sha256( sha256(k1) ) ) )
//   16进制私钥：      1e99423a4ed27608a15a2616a2b0e9e52ced330ac530edcc32c8ffc6a526aedd
//   WIF压缩格式私钥：  KxFC1jmwwCoACiCAWZ3eXa96mBM6tb3TYzGmf6YwgdGWZgawvrtJ
//   WIF非压缩格式私钥： 5J3mBbAH58CpQ3Y5RNJpUKPE62SQ5tfcvU2JpbnkeyhfsYB1Jcn
function toWif(sk, bCompress) {
  let end = bCompress ? '01' : ''
  
  const k = Buffer.from('80' + sk + end, 'hex');
  console.log(`step 1: ${k.toString('hex')}`)

  const Hash =  bitcoin.crypto.hash256
  // hash256 = sha256(sha256)
  const s2 = Hash(k).slice(0, 4)
  console.log(`step 2: ${s2.toString('hex')}`)
  const s4 = Buffer.concat([k, s2])

  // const Hash =  bitcoin.crypto.sha256
  // const s2 = Hash(k)
  // console.log(`step 2: ${s2.toString('hex')}`)
  // const s3 = Hash(s2).slice(0, 4)
  // console.log(`step 3: ${s3.toString('hex')}`)
  // const s4 = Buffer.concat([k, s3])

  const result = bs58.encode(s4).toString('hex')
  console.log(`step 4: ${result}`)
  return result
}

function wifToSK(wif) {
  const s4 = bs58.decode(wif)
  console.log(`step 4: ${s4.toString('hex')}`)

  const s2 = s4.slice(1, 1 + 32)
  console.log(`step 2: ${s2.toString('hex')}`)
  return s2
}

const mySk = '1e99423a4ed27608a15a2616a2b0e9e52ced330ac530edcc32c8ffc6a526aedd'
const wif = toWif(mySk, true)
const wif2 = toWif(mySk)

wifToSK(wif)
wifToSK(wif2)

// 公钥格式 : 非压缩， 压缩
//   非压缩格式， 04 + 64B (x) + 64B (y)
//   压缩格式,   03 + 64B (x)   且y为奇数
//              02 + 64B (x)   且x为奇数
function toPK(sk, bCompress) {
  // K = sk * G = (x, y)
  // PK = 04 + x + y,    PK = 03 + x (y奇数)  PK = 02 + x

  const pk = ecc.pointFromScalar(Buffer.from(sk, 'hex'), bCompress)
  // 04f028892bad7ed57d2fb57bf33081d5cfcf6f9ed3d3d7f159c2e2fff579dc341a07cf33da18bd734c600b96a72bbc4749d5141c90ec8ac328ae52ddfe2e505bdb
  // 03f028892bad7ed57d2fb57bf33081d5cfcf6f9ed3d3d7f159c2e2fff579dc341a
  console.log(pk.toString('hex'))

  return pk
}

const pkN = toPK(mySk, false)
const pkC = toPK(mySk, true)
toPK(mySk)

// 地址格式 : chainId， pk
//  非压缩公钥
//    MAINNET
//    TESTNET
//    PRIVATENET
//  压缩公钥
//    MAINNET
//    TESTNET
//    PRIVATENET
const addressTypes = {
  0x00: {
    type: 'p2pkh',
    network: 'mainnet'
  },

  0x6f: {
    type: 'p2pkh',
    network: 'testnet'
  },

  0x05: {
    type: 'p2sh',
    network: 'mainnet'
  },

  0xc4: {
    type: 'p2sh',
    network: 'testnet'
  }
};

// bech32 编码实际上由两部分组成：一部分是bc这样的前缀，被称为HRP（Human Readable Part，用户可读部分），
//                          另一部分是特殊的Base32编码，使用字母表qpzry9x8gf2tvdw0s3jn54khce6mua7l，中间用1连接。对一个公钥进行Bech32编码的代码如下：
// regtest = testnet
const addressVersion = {
  "mainnet" : {
    // base58 编码
    "p2pkh": 0x00,            // 1        17VZNX1SN5NtKa8UQFxwQbFeFc3iqRYhem
    "p2sh": 0x05,             // 3        3EktnHQD7RiAE6uzMj2ZifT9YgRrkSgzQX
    "p2wifSk": 0x80,          // 5        5Hwgr3u458GLafKBgxtssHSPqJnYoGrSzgQsPwLFhLNYskDPyyA
    "p2wifPk": 0x80,          // K / L    L1aW4aubDFB7yfras2S1mN3bqg9nwySY8nkoLmJebSLD5BWv3ENZ
    "p2bip32pk": 0x0488B21E,  // xpub     xpub661MyMwAqRbcEYS8w7XLSVeEsBXy79zSzH1J8vCdxAZningWLdN3 zgtU6LBpB85b3D2yc8sfvZU521AAwdZafEz7mnzBBsz4wKY5e4cp9LB
    "p2bip32sk": 0x0488ADE4,  // xprv     xprv9s21ZrQH143K24Mfq5zL5MhWK9hUhhGbd45hLXo2Pq2oqzMMo63o StZzF93Y5wvzdUayhgkkFoicQZcP3y52uPPxFnfoLZB21Teqt1VvEHx
  },
  "testnet" : {
    // base58 编码
    "p2pkh": 0x6f,            // m / n    mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn
    "p2sh": 0xc4,             // 2        2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc
    "p2wifSk": 0xef,          // 9        92Pg46rUhgTT7romnV7iGW6W1gbGdeezqdbJCzShkCsYNzyyNcc
    "p2wifPk": 0xef,          // c        cNJFgo1driFnPcBdBX8BrJrpxchBWXwXCvNH5SoSkdcF6JXXwHMm
    "p2bip32pk": 0x043587CF,  // tpub     tpubD6NzVbkrYhZ4WLczPJWReQycCJdd6YVWXubbVUFnJ5KgU5MDQrD9 98ZJLNGbhd2pq7ZtDiPYTfJ7iBenLVQpYgSQqPjUsQeJXH8VQ8xA67D
    "p2bip32sk": 0x04358394,  // tprv     tprv8ZgxMBicQKsPcsbCVeqqF1KVdH7gwDJbxbzpCxDUsoXHdb6SnTPY xdwSAKDC6KKJzv7khnNWRAJQsRA8BBQyiSfYnRt6zuu4vZQGKjeW4YF
  }
}
// 地址的生成: 隔离见证
//  准备解锁脚本
//    p2wpkh: 
//        op_0 <20-bytes hash>
//    p2wsh : 
//        op_hash160 <32-bytes hash> op_equal，地址32字节，其余地址20字节
//      mainnet: bc
//      testnet: tb
//      regtest: bcrt
//
//    为了满足旧钱包的需求，将wpkh、wsh对应的锁定脚本,转到普通的p2sh地址格式
//    p2sh-p2wpkh
//    p2sh-p2wsh
//      mainnet: 0x05
//      testnet: 0xc4
//      regtest: 0xc4

// 锁定脚本的结构
//   p2pkh: 是利用公钥的哈希，相对来说比较简单，现在新版本的钱包应用的越来越少, 25字节长度
//      OP_DUP OP_HASH160 OPCODE_LEN ADDR OP_EQUALVERIFY OP_CHECKSIG
//       0x76    0xa9        0x14  20字节地址     0x88        0xac
//   p2sh: 脚本的哈希, 23字节长度
//      OP_HASH160 OPCODE_LEN ADDR OP_EQUAL
//         0xa9      0x14   20字节地址 0x87
//   p2wpkh: 是隔离见证中公钥地址的表示，格式主要是为了与非隔离见证的锁定脚本区别。旧钱包是不支持的， 22字节长度
//      VER   OPCODE_LEN  ADDR
//      0x00     0x14    20字节地址
//   p2wsh: 是隔离见证中脚本地址的表示，34字节长度
//      VER   OPCODE_LEN  ADDR
//      0x00     0x20    32字节地址
//   p2sh-p2wpkh: 对P2WPKH进行HASH160得到20字节地址, 23字节长度
//   p2sh-p2wsh: 对P2WSH进行HASH160得到20字节地址, 23字节长度
//      OP_HASH160 OPCODE_LEN ADDR OP_EQUAL
//         0xa9      0x14   20字节地址 0x87

// 比特币地址类型：
// 比特币地址类型分为3中格式： legacy p2sh-segwit bech32

// legacy类型实际上就是取公钥或脚本的HASH160值得到20位字节地址。

// p2sh-segwit：对应生成P2SH-P2WPKH 和 P2SH-P2WSH中的地址

// bech32：对应生成P2WPKH 和 P2WSH中的地址
function toAddress(pk, bSegwit, version) {
  // hash160 = ripemd160(sha256())
  const hash160 = bitcoin.crypto.hash160
  // hash256 = sha256(sha256)
  const hash256 = bitcoin.crypto.hash256

  const b20 = hash160(Buffer.from(pk, 'hex'))

  if (bSegwit) {
    let words = bech32.toWords(b20);

    const v = version ? version : 0
    words.unshift(v);

    const address = bech32.encode('bc', words);

    console.log(`seg wit ${address}`)

    return address
  } else {
    const v = Buffer.from([version ? version : 0])
    const content = Buffer.concat([v, b20])
  
    const end = hash256(content).slice(0, 4)
  
    const address = bs58.encode(Buffer.concat([content, end])).toString('hex')
  
    console.log(address)
  
    return address
  }
}
toAddress(pkN)
toAddress(pkC)
toAddress(pkN, true)
toAddress(pkC, true)

const wif5 = 'KyamxxEaa4idX9RGocBzDPjNFbKkU6eA155CcW7cCvs9euu5D7g6'
const sk5 = wifToSK(wif5)
const pk = toPK(sk5, true)
// bc1qxwrmaesyve53tynmn02jz4cc8qeu25d2afxww8
const addr = toAddress(pk, true)
if (addr === "bc1qxwrmaesyve53tynmn02jz4cc8qeu25d2afxww8") {
  console.log("haha good")
}

// 地址的生成
//  准备解锁脚本
//    p2wpkh: op_0 <20-bytes hash>
//    p2wsh : op_hash160 <32-bytes hash> op_equal
// https://juejin.cn/post/6844904003302588423
function generateSegWitAddress(pk, type, chainType) {
  let hrp = 'bc'
  switch(chainType) {
    case 'testnet':
      hrp = 'tb'
      break
    case 'regtest':
      hrp = 'bcrt'
      break
  }
  if (type === 'p2wpkh') {
    // op_0 <20-bytes hash>
    // hash160 = ripemd160(sha256())
    const hash160 = bitcoin.crypto.hash160
    // hash256 = sha256(sha256)
    const hash256 = bitcoin.crypto.hash256

    // 20-bytes hash
    const b20 = hash160(Buffer.from(pk, 'hex'))

    let words = bech32.toWords(b20);
    // op_0 ?
    words.unshift(0);

    const address = bech32.encode(hrp, words);

    console.log(`seg wit ${address}`)

    return address
  } else if (type === 'p2wsh') {
    // op_hash160 <32-bytes hash> op_equal
  }

}

const pubKeyStr = '0x2e9ad92f5f541b6c2ddb672a70577c252aaa8b9b8dfdff9a5381912395985d12dc18f19ecb673a3b675697ae97913fcb69598c089f6d66ae7a3f6dc179e4da56'


function convertToCompressPublicKey(rawKey) {
  let start = 0
  if (rawKey.startsWith("0x")) {
    start = 2
  }
  const end = parseInt(rawKey.charAt(rawKey.length - 1))

  let prefix = '02'
  if (end & 1 === 1) {
    prefix = '03'
  }
  const xRaw = rawKey.substr(start, 64);

  return prefix + xRaw
}

const allNets = [MAINNET, TESTNET, PRIVATENET]
// 
// const allAddressFormat = {'p2pkh', 'p2sh', ''}

describe('bitcoinjs-lib (addresses)', function () {
  this.timeout(16000000);
  it('can generate a random address [and support the retrieval of transactions for that address (via 3PBP)]', async () => {
    console.log('aaa')
    // const keyPair = bitcoin.ECPair.makeRandom();

    const pubKey = Buffer.from(convertToCompressPublicKey(pubKeyStr), 'hex')
    const keyPair = bitcoin.ECPair.fromPublicKey(pubKey, {network: MAINNET})
    const account = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey })

    console.log(`p2pkh address is ${account.address}`)
    // bitcoin P2PKH addresses start with a '1'
    assert.strictEqual(account.address.startsWith('1'), true);
  })
});

// 一个签名　＝　长度48 + 72字节内容 = 73字节
// 48 + 3045022100884d142d86652a3f47ba4746ec719bbfbd040a570b1deccbb6498c75c4ae24cb02204b9f039ff08df09cbe9f6addac960298cad530a863ea8f53982c09db8f6e381301
// 
// tx-> hex
// nVersion + len(tx.vin) + tx.vin + len(tx.vout) + tx.vout + tx.nLockTime
// nVersion + len(tx.vin) + [hash,n,scriptSig,nSequence] + len(tx.vout) + [nValue, scriptPubKey] + tx.nLockTime
// 01000000       01  186f9f998a5aa6f048e51dd8419a14d8a0f1a8a2836dd734d2804fe65fa35779 00000000                8b                               483045022100884d142d86652a3f47ba4746ec719bbfbd040a570b1deccbb6498c75c4ae24cb02204b9f039ff08df09cbe9f6addac960298cad530a863ea8f53982c09db8f6e381301410484ecc0d46f1918b30928fa0e4ed99f16a0fb4fde0735e7ade8416ab9fe423cc5412336376789d172787ec3457eee41c04f4938de5cc17b4a10fa336a8d752adf          ffffffff       02               60e3160000000000          19         76a914ab68025513c3dbd2f7b92a94e0581f5d50f654e788ac   d0ef800000000000        19        76a9147f9b1a7fb68d60c536c2fd8aeaa53a8f3cc025a888ac      00000000
// version(4) + [vin(的长度1-9)             +     vin的txid(32,反序)                 + vOutIndex(4)  +   解锁脚本长度(139,接下来的139字节为解锁脚本  +                                                                                                                           解锁脚本　　                                                                                                                                                          nSequence    ＋　tx.vout的长度    +      第一笔的.nValue     + 锁定脚本长度  +                           锁定脚本内容         +          第二笔的nValue  第二笔的锁定脚本长度       锁定脚本内容                                     + nLockTime
                                                                                                          // 读取首字节, 如果小于253,本字节为长度,
                                                                                                          //           如果等于253, 接着的2字节为长度,
                                                                                                          //           如果等于254, 接着的4字节为长度
                                                                                                          //           如果等于255, 接着的8字节为长度     
// 锁定脚本内容  76   a9      147f9b1a7fb68d60c536c2fd8aeaa53a8f3cc025a8    88          ac
//            Dup Hash160          (Pubkey Hash)                       EqualVerify CheckSig

// 解锁脚本内容 [48                    30         45         02 21 00884d142d86652a3f47ba4746ec719bbfbd040a570b1deccbb6498c75c4ae24cb 02 20 4b9f039ff08df09cbe9f6addac960298cad530a863ea8f53982c09db8f6e3813   01]                  [41 04 84ecc0d46f1918b30928fa0e4ed99f16a0fb4fde0735e7ade8416ab9fe423cc5412336376789d172787ec3457eee41c04f4938de5cc17b4a10fa336a8d752adf]
//            [sig] (48 长度72字节  30 push48字节 45 序列的长度    21长度       R 33字节                                                     长度    S 32字节                                                      后缀SIGHASH_ALL)                                      [pubkey] (总长度65, 非压缩, 32 + 32)

// P2PKH => 解锁脚本[(Sig)(PubKey)] + 锁定脚本[Dup Hash160 (Pubkey Hash) EqualVerify CheckSig]
// p2SH => 解锁脚本[(Sig)(PubKey) CheckSig ] + 锁定脚本[(Hash160 (scrip Hash) EqualVerify)]


// class COutPoint {
//   uint256 hash;
//   uint32_t n;
//   (obj.hash, obj.n)
// }

// typedef prevector<28, unsigned char> CScriptBase;  ==> 字节数组
// class CScript : public CScriptBase

// class CTxIn {
//   COutPoint prevout;
//   CScript scriptSig; // 解锁脚本
//   uint32_t nSequence;
//   CScriptWitness scriptWitness;
/* (obj.prevout, obj.scriptSig, obj.nSequence) */
/* => (obj.hash, obj.n, obj.scriptSig, obj.nSequence)  */
// }

/** An output of a transaction.  It contains the public key that the next input must be able to sign with to claim it. */
// class CTxOut
// {
//     CAmount nValue; // int64_t
//     CScript scriptPubKey;
//     SERIALIZE_METHODS(CTxOut, obj) { READWRITE(obj.nValue, obj.scriptPubKey); }
// }

// class CTransaction {
//   version = 2
//  const std::vector<CTxIn> vin;
//  const std::vector<CTxOut> vout;
//  const int32_t nVersion;
//  const uint32_t nLockTime;
// }

// class CMutableTransaction{
//   std::vector<CTxIn> vin;
//   std::vector<CTxOut> vout;
//   int32_t nVersion;
//   uint32_t nLockTime;
// }
// ｖersion默认为２, ＆　0x40000000表示包含witness
// nVersion  [如果包含witness  + vector<CTxIn>空对象　+ flag(01)]   +  s << tx.vin + s << tx.vout + [s << tx.vin[i].scriptWitness.stack] + s << tx.nLockTime
// nVersion                                                      +  s << tx.vin + s << tx.vout                                        + s << tx.nLockTime 
// => nVersion + len(tx.vin) + tx.vin + len(tx.vout) + tx.vout + tx.nLockTime
// template<typename Stream, typename TxType>
// inline void SerializeTransaction(const TxType& tx, Stream& s) {
//     const bool fAllowWitness = !(s.GetVersion() & SERIALIZE_TRANSACTION_NO_WITNESS);

//     s << tx.nVersion;
//     unsigned char flags = 0;
//     // Consistency check
//     if (fAllowWitness) {
//         /* Check whether witnesses need to be serialized. */
//         if (tx.HasWitness()) {
//             flags |= 1;
//         }
//     }
//     if (flags) {
//         /* Use extended format in case witnesses are to be serialized. */
//         std::vector<CTxIn> vinDummy;
//         s << vinDummy;
//         s << flags;
//     }
//     s << tx.vin;
//     s << tx.vout;
//     if (flags & 1) {
//         for (size_t i = 0; i < tx.vin.size(); i++) {
//             s << tx.vin[i].scriptWitness.stack;
//         }
//     }
//     s << tx.nLockTime;
// }
// Alice -> Bob 0.015
// {
//   "version": 1,
//   "locktime": 0,
//   "vin": [ --- 解锁
//     {
//       "txid":"7957a35fe64f80d234d76d83a2a8f1a0d8149a41d81de548f0a65a8a999f6f18",
//       "vout": 0,
//       "scriptSig": "3045022100884d142d86652a3f47ba4746ec719bbfbd040a570b1deccbb6498c75c4ae24cb02204b9f039ff08df09cbe9f6addac960298cad530a863ea8f53982c09db8f6e3813[ALL] 0484ecc0d46f1918b30928fa0e4ed99f16a0fb4fde0735e7ade8416ab9fe423cc5412336376789d172787ec3457eee41c04f4938de5cc17b4a10fa336a8d752adf",
//       "sequence": 4294967295
//     }
//  ],
//   "vout": [  --- 锁定
//     {
//       "value": 0.01500000,
//       "scriptPubKey": "OP_DUP OP_HASH160 ab68025513c3dbd2f7b92a94e0581f5d50f654e7 OP_EQUALVERIFY OP_CHECKSIG"
//     },
//     {
//       "value": 0.08450000,
//       "scriptPubKey": "OP_DUP OP_HASH160 7f9b1a7fb68d60c536c2fd8aeaa53a8f3cc025a8 OP_EQUALVERIFY OP_CHECKSIG",
//     }
//   ]
// }

// p2pkh
// 7957a35fe64f80d234d76d83a2a8f1a0d8149a41d81de548f0a65a8a999f6f18
// 0100000001524d288f25cada331c298e21995ad070e1d1a0793e818f2f7cfb5f6122ef3e71000000008c493046022100a59e516883459706ac2e6ed6a97ef9788942d3c96a0108f2699fa48d9a5725d1022100f9bb4434943e87901c0c96b5f3af4e7ba7b83e12c69b1edbfe6965f933fcd17d014104e5a0b4de6c09bd9d3f730ce56ff42657da3a7ec4798c0ace2459fb007236bc3249f70170509ed663da0300023a5de700998bfec49d4da4c66288a58374626c8dffffffff0180969800000000001976a9147f9b1a7fb68d60c536c2fd8aeaa53a8f3cc025a888ac00000000
// {
// 	"result": {
// 		"txid": "7957a35fe64f80d234d76d83a2a8f1a0d8149a41d81de548f0a65a8a999f6f18",
// 		"hash": "7957a35fe64f80d234d76d83a2a8f1a0d8149a41d81de548f0a65a8a999f6f18",
// 		"version": 1,
// 		"size": 225,
// 		"vsize": 225,
// 		"weight": 900,
// 		"locktime": 0,
// 		"vin": [{
// 			"txid": "713eef22615ffb7c2f8f813e79a0d1e170d05a99218e291c33daca258f284d52",
// 			"vout": 0,
// 			"scriptSig": {
// 				"asm": "3046022100a59e516883459706ac2e6ed6a97ef9788942d3c96a0108f2699fa48d9a5725d1022100f9bb4434943e87901c0c96b5f3af4e7ba7b83e12c69b1edbfe6965f933fcd17d[ALL] 04e5a0b4de6c09bd9d3f730ce56ff42657da3a7ec4798c0ace2459fb007236bc3249f70170509ed663da0300023a5de700998bfec49d4da4c66288a58374626c8d",
// 				"hex": "493046022100a59e516883459706ac2e6ed6a97ef9788942d3c96a0108f2699fa48d9a5725d1022100f9bb4434943e87901c0c96b5f3af4e7ba7b83e12c69b1edbfe6965f933fcd17d014104e5a0b4de6c09bd9d3f730ce56ff42657da3a7ec4798c0ace2459fb007236bc3249f70170509ed663da0300023a5de700998bfec49d4da4c66288a58374626c8d"
// 			},
// 			"sequence": 4294967295
// 		}],
// 		"vout": [{
// 			"value": 0.10000000,
// 			"n": 0,
// 			"scriptPubKey": {
// 				"asm": "OP_DUP OP_HASH160 7f9b1a7fb68d60c536c2fd8aeaa53a8f3cc025a8 OP_EQUALVERIFY OP_CHECKSIG",
// 				"hex": "76a9147f9b1a7fb68d60c536c2fd8aeaa53a8f3cc025a888ac",
// 				"reqSigs": 1,
// 				"type": "pubkeyhash",
// 				"addresses": ["1Cdid9KFAaatwczBwBttQcwXYCpvK8h7FK"]
// 			}
// 		}]
// 	},
// 	"error": null,
// 	"id": 1
// }

// p2sh
// {
// 	"result": {
// 		"txid": "40eee3ae1760e3a8532263678cdf64569e6ad06abc133af64f735e52562bccc8",
// 		"hash": "40eee3ae1760e3a8532263678cdf64569e6ad06abc133af64f735e52562bccc8",
// 		"version": 1,
// 		"size": 189,
// 		"vsize": 189,
// 		"weight": 756,
// 		"locktime": 0,
// 		"vin": [{
// 			"txid": "42a3fdd7d7baea12221f259f38549930b47cec288b55e4a8facc3c899f4775da",
// 			"vout": 0,
// 			"scriptSig": {
// 				"asm": "3044022048d1468895910edafe53d4ec4209192cc3a8f0f21e7b9811f83b5e419bfb57e002203fef249b56682dbbb1528d4338969abb14583858488a3a766f609185efe68bca[ALL] 031a455dab5e1f614e574a2f4f12f22990717e93899695fb0d81e4ac2dcfd25d00",
// 				"hex": "473044022048d1468895910edafe53d4ec4209192cc3a8f0f21e7b9811f83b5e419bfb57e002203fef249b56682dbbb1528d4338969abb14583858488a3a766f609185efe68bca0121031a455dab5e1f614e574a2f4f12f22990717e93899695fb0d81e4ac2dcfd25d00"
// 			},
// 			"sequence": 4294967295
// 		}],
// 		"vout": [{
// 			"value": 0.00990000,
// 			"n": 0,
// 			"scriptPubKey": {
// 				"asm": "OP_HASH160 e9c3dd0c07aac76179ebc76a6c78d4d67c6c160a OP_EQUAL",
// 				"hex": "a914e9c3dd0c07aac76179ebc76a6c78d4d67c6c160a87",
// 				"reqSigs": 1,
// 				"type": "scripthash",
// 				"addresses": ["3P14159f73E4gFr7JterCCQh9QjiTjiZrG"]
// 			}
// 		}],
// 		"hex": "0100000001da75479f893cccfaa8e4558b28ec7cb4309954389f251f2212eabad7d7fda342000000006a473044022048d1468895910edafe53d4ec4209192cc3a8f0f21e7b9811f83b5e419bfb57e002203fef249b56682dbbb1528d4338969abb14583858488a3a766f609185efe68bca0121031a455dab5e1f614e574a2f4f12f22990717e93899695fb0d81e4ac2dcfd25d00ffffffff01301b0f000000000017a914e9c3dd0c07aac76179ebc76a6c78d4d67c6c160a8700000000",
// 		"blockhash": "0000000000000002bc915719cd6e6ceeecd67e7bf66f2aa34804743cf8044e86",
// 		"confirmations": 425045,
// 		"time": 1385820619,
// 		"blocktime": 1385820619
// 	},
// 	"error": null,
// 	"id": 1
// }

// p2pkh: 解锁脚本 + 锁定脚本 => [sig pubKey] [dup hash160 (pubKey hash160) equalVerify checkSig] => true
// p2pk: 解锁脚本 + 锁定脚本 => [sig] + [pk checkSig]
// p2ms: 解锁脚本 + 锁定脚本 => [0 sig1 sig2] + [2 key1 key2 key3 3 checkMultiSig]
// p2sh:  锁定脚本: hash160 (script hash160) equal
//        兑现脚本: [2 key1 key2 key3 3 checkMultiSig]

//        解锁脚本 = [0 sig1 sig2] + 兑现脚本 = [0 sig1 sig2] + [2 key1 key2 key3 3 checkMultiSig]
//        兑现脚本 + 锁定脚本 => true
//        解锁脚本 => true
// p2sh: a. 解锁脚本 + 锁定脚本 => [sig pubKey checkSig] + [hash160 (script hash160) equal] => true   (模拟的p2pkh)
//                           => [0 sig1 sig2 2 key1 key2 key3 3 checkMultiSig] [hash160 (script hash160) equal] => true (模拟的p2ms)
//       b. 解锁脚本          => [sig pubKey checkSig] => true

// (Sig)(PubKey) ＋　锁定脚本
// ＝＞　(sig)(pubkey) + Dup Hash160 (Pubkey Hash) EqualVerify CheckSig　Pubkey
// => 483045022100884d142d86652a3f47ba4746ec719bbfbd040a570b1deccbb6498c75c4ae24cb02204b9f039ff08df09cbe9f6addac960298cad530a863ea8f53982c09db8f6e381301410484ecc0d46f1918b30928fa0e4ed99f16a0fb4fde0735e7ade8416ab9fe423cc5412336376789d172787ec3457eee41c04f4938de5cc17b4a10fa336a8d752adf + 76a9147f9b1a7fb68d60c536c2fd8aeaa53a8f3cc025a888ac


// 构造签名
// type MsgTx struct {

//   Version int32

//   TxIn []*TxIn

//   TxOut []*TxOut

//   LockTime uint32

// }

// type TxOut struct {

//   Value int64

//   PkScript []byte

// }

// type TxIn struct {

//   PreviousOutPoint OutPoint

//   SignatureScript []byte

//   Sequence uint32

// }

// type OutPoint struct {

//   Hash chainhash.Hash

//   Index uint32

// }

// 在比特币中，要做一笔交易分为三个步骤：

// 构建原始交易RawTransaction，该交易包含了输入指向的OutPoint，也包含了完整的Output，但是没有签名，也就是没有设置SignatureScript的内容。
// 用私钥对签名构建的RawTransaction进行签名，并将签名构建成完整的解锁脚本，填入对应的Input的SignatureScript字段中。
// 将签名后的Transaction发送到P2P网络中。

// 签名: 第n个input签名,则需要把其他input的解锁脚本设置为0,第n个input的解锁脚本,替换锁定脚本, 签名的内容为
// 01000000       01  186f9f998a5aa6f048e51dd8419a14d8a0f1a8a2836dd734d2804fe65fa35779 00000000                锁定脚本长度                               锁定脚本内容          ffffffff       02               60e3160000000000          19         76a914ab68025513c3dbd2f7b92a94e0581f5d50f654e788ac   d0ef800000000000        19        76a9147f9b1a7fb68d60c536c2fd8aeaa53a8f3cc025a888ac      00000000
// version(4) + [vin(的长度1-9)             +     vin的txid(32,反序)                 + vOutIndex(4)  +   解锁xxx脚本长度 这里要替换成锁定脚本 +                                                                                                                           解锁脚本　　                                                                                                                                                          nSequence    ＋　tx.vout的长度    +      第一笔的.nValue     + 锁定脚本长度  +                           锁定脚本内容         +          第二笔的nValue  第二笔的锁定脚本长度       锁定脚本内容                                     + nLockTime