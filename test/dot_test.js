// Required imports
const { ApiPromise, WsProvider } = require('@polkadot/api');
const { stringToU8a, u8aToHex } = require("@polkadot/util");
const { Keyring } = require('@polkadot/keyring')
const { cryptoWaitReady, mnemonicGenerate, signatureVerify, decodeAddress } = require("@polkadot/util-crypto")
// const { createMetadata } = require('@substrate/txwrapper-core/lib/core');
// const {
//     construct,
//     decode,
//     deriveAddress,
//     getRegistry,
//     methods,
//     PolkadotSS58Format,
// } = require("@substrate/txwrapper-polkadot");

// const { longPubKeyToAddress, dotChain } = require('../src/lib/dot')

// /**
//  * 与polkadot库的实现是一样。这里提出来是为了方便添加自己的动作。
//  *
//  * @param unsigned
//  * @param signature:  交易的签名
//  * @param options
//  * @return {string}  返回的是可以提交上链的 Tx 了！
//  */
//  function my_createSignedTx(unsigned, signature, options) {
//   const { metadataRpc, registry } = options;
//   registry.setMetadata(createMetadata(registry, metadataRpc));
//   const extrinsic = registry.createType('Extrinsic', { method: unsigned.method }, { version: unsigned.version });
//   extrinsic.addSignature(unsigned.address, signature, unsigned);
//   // console.log("my_createSignedTx()  extrinsic: ", extrinsic);
//   return extrinsic.toHex();
// }

// /**
// * @param api
// * @param extrinsicPayload: 'ExtrinsicPayload' type object
// * @return {Promise<string|null>}
// */
// async function signTx(api, extrinsicPayload) {
//   const specVersionInfo = api.runtimeVersion;
//   const specVersion = specVersionInfo.specVersion;
//   const metadataRpc = api.runtimeMetadata.toHex();

//   console.log("specVersion: ", specVersion);

//   const registry = api.registry;

//   let { signature } = extrinsicPayload.sign(signer);
//   console.log("_buildTransferTx signature: ", signature);

//   //Test: change signature【-1】 to 0
//   // console.log("signature【-2，] is: ", signature.slice(-2,));
//   // signature = signature.slice(0, -2) + "00";  // test, change sig


//   const signedTx = my_createSignedTx(batch, signature, {  // 这一步工作将是 放在 Agent 里的~
//       metadataRpc,
//       registry,
//   });
//   // console.log('signedTx: ' + signedTx);
//   // console.log('signedTx toHuman: ' + signedTx.toHuman());   // Error: signedTx.toHuman is not a function

//   // Derive the tx hash of a signed transaction offline.
//   const expectedTxHash = construct.txHash(signedTx);  // 对签名后的tx 计算 hash ！
//   console.log(`\nExpected Tx Hash: ${expectedTxHash}`);
//   return signedTx;
// }

function signTx() {
  // const keyring = new Keyring({ type: 'ecdsa', ss58Format: 42 });
  // const keyring = new Keyring({ type: 'ed25519', ss58Format: 42 });
  // const keyring = new Keyring({ type: 'sr25519', ss58Format: 42 });
  const keyring = new Keyring();

  // create Alice based on the development seed
  const alice = keyring.addFromUri('//Alice');

  // create the message, actual signature and verify
  const message = stringToU8a('this is our message');
  const signature = alice.sign(message);
  const isValid1 = alice.verify(message, signature, alice.publicKey);

  // output the result
  console.log(`${u8aToHex(signature)} is ${isValid1 ? 'valid' : 'invalid'}`);

  // verify the message using Alice's address
  const { isValid } = signatureVerify(message, signature, alice.address );

  // output the result
  console.log(`${u8aToHex(signature)} pub = ${u8aToHex(alice.publicKey)} is ${isValid ? 'valid' : 'invalid'}`);
}

function createAccount() {
  // generate a random mnemonic, 12 words in length
  const mnemonic = mnemonicGenerate(12)

  // create a keyring with some non-default values specified, 'ed25519' | 'sr25519' | 'ecdsa' | 'ethereum'
  // export enum PolkadotSS58Format {
  // 	polkadot = 0,
  // 	kusama = 2,
  // 	westend = 42,
  // 	substrate = 42,
  // }
  const keyring = new Keyring({ type: 'ecdsa', ss58Format: 42 });
  // const keyring = new Keyring({ type: 'sr25519', ss58Format: 2 });

  // add the account, encrypt the stored JSON with an account-specific password
  const { pair, json } = keyring.addUri(mnemonic, 'myStr0ngP@ssworD', { name: 'mnemonic acc' });

  // the pair has been added to our keyring
  console.log(keyring.pairs.length, 'pairs available');

  // log the name & address (the latter encoded with the ss58Format)
  console.log(pair.meta.name, 'has address', pair.address);
}

async function ca3() {
  // we only need to do this once per app, somewhere in our init code
  // (when using the API and waiting on `isReady` this is done automatically)
  await cryptoWaitReady();
  const mnemonic = mnemonicGenerate(12)

  const keyring = new Keyring({ type: 'ecdsa', ss58Format: 42 });
  // const keyring = new Keyring({ type: 'ecdsa', ss58Format: 0 });
  // create an ed25519 pair from the mnemonic
  const ep = keyring.createFromUri(mnemonic, { name: 'ed25519' }, 'ed25519');

  // create an sr25519 pair from the mnemonic (keyring defaults)
  const sp = keyring.createFromUri(mnemonic, { name: 'sr25519' });

  // log the addresses, different cryptos, different results
  console.log(ep.meta.name, ep.address);
  console.log(sp.meta.name, sp.address);
}

async function ca4() {
  const MNEMONIC = 'sample split bamboo west visual approve brain fox arch impact relief smile';

  // type: ed25519, ssFormat: 42 (all defaults)
  let keyring = new Keyring({ type: 'ed25519' });
  let pair = keyring.createFromUri(MNEMONIC);

  // use the default as setup on init
  // 5CSbZ7wG456oty4WoiX6a1J88VUbrCXLhrKVJ9q95BsYH4TZ
  console.log('Substrate generic', pair.address);

  // adjust the default ss58Format for Kusama
  // CxDDSH8gS7jecsxaRL9Txf8H5kqesLXAEAEgp76Yz632J9M
  keyring.setSS58Format(2);
  console.log('Kusama', pair.address);

  // adjust the default ss58Format for Polkadot
  // 1NthTCKurNHLW52mMa6iA8Gz7UFYW5UnM3yTSpVdGu4Th7h
  keyring.setSS58Format(0);
  console.log('Polkadot', pair.address);

  // 5CSbZ7wG456oty4WoiX6a1J88VUbrCXLhrKVJ9q95BsYH4TZ
  console.log(keyring.encodeAddress(pair.publicKey, 42));

  // CxDDSH8gS7jecsxaRL9Txf8H5kqesLXAEAEgp76Yz632J9M
  console.log(keyring.encodeAddress(pair.publicKey, 2));

  // 1NthTCKurNHLW52mMa6iA8Gz7UFYW5UnM3yTSpVdGu4Th7h
  console.log(keyring.encodeAddress(pair.publicKey, 0));

  // //////////////////////////////////
  // // change to 'ecdsa'
  // keyring = new Keyring({ type: 'ecdsa' });
  // pair = keyring.createFromUri(MNEMONIC);

  // // use the default as setup on init
  // // 5CSbZ7wG456oty4WoiX6a1J88VUbrCXLhrKVJ9q95BsYH4TZ
  // console.log('Substrate generic', pair.address);

  // // adjust the default ss58Format for Kusama
  // // CxDDSH8gS7jecsxaRL9Txf8H5kqesLXAEAEgp76Yz632J9M
  // keyring.setSS58Format(2);
  // console.log('Kusama', pair.address);

  // // adjust the default ss58Format for Polkadot
  // // 1NthTCKurNHLW52mMa6iA8Gz7UFYW5UnM3yTSpVdGu4Th7h
  // keyring.setSS58Format(0);
  // console.log('Polkadot', pair.address);
}

function createAccount2() {
  // generate a mnemonic with default params (we can pass the number
  // of words required 12, 15, 18, 21 or 24, less than 12 words, while
  // valid, is not supported since it is more-easily crackable)
  const mnemonic = mnemonicGenerate();
  const keyring = new Keyring({ type: 'ecdsa', ss58Format: 42 });

  // create & add the pair to the keyring with the type and some additional
  // metadata specified
  const pair = keyring.addFromUri(mnemonic, { name: 'first pair' }, 'ed25519');

  // the pair has been added to our keyring
  console.log(keyring.pairs.length, 'pairs available');

  // log the name & address (the latter encoded with the ss58Format)
  console.log(pair.meta.name, 'has address', pair.address);
}

async function main () {
  // Initialise the provider to connect to the local node
  const provider = new WsProvider('wss://nodes-testnet.wandevs.org/polkadot');
  // const provider = new WsProvider('wss://nodes.wandevs.org/polkadot');

  // Create the API and wait until ready
  const api = await ApiPromise.create({ provider });

  // Retrieve the chain & node information information via rpc calls
  const [chain, nodeName, nodeVersion] = await Promise.all([
    api.rpc.system.chain(),
    api.rpc.system.name(),
    api.rpc.system.version()
  ]);

  console.log(`You are connected to chain ${chain} using ${nodeName} v${nodeVersion}`);

  // Known account we want to use (available on dev chain, with funds)
  const Alice = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
  let { data: { free: previousFree }, nonce: previousNonce } = await api.query.system.account(Alice);

  console.log(`${Alice} has a balance of ${previousFree}, nonce ${previousNonce}`);
  console.log(`You may leave this example running and start example 06 or transfer any value to ${Alice}`);

  // Here we subscribe to any balance changes and update the on-screen value
  api.query.system.account(Alice, ({ data: { free: currentFree }, nonce: currentNonce }) => {
    // Calculate the delta
    const change = currentFree.sub(previousFree);

    // Only display positive value changes (Since we are pulling `previous` above already,
    // the initial balance change will also be zero)
    if (!change.isZero()) {
      console.log(`New balance change of ${change}, nonce ${currentNonce}`);

      previousFree = currentFree;
      previousNonce = currentNonce;
    }
  });

  let count = 0;
  const unsubscribe = await api.rpc.chain.subscribeNewHeads((header) => {
    console.log(`Chain is at block: #${header.number} ${header.hash} ${header.parentHash}`);

    if (++count === 10) {
      unsubscribe();
      process.exit(0);
    }
  });
}

// main().catch(console.error)

setTimeout(async () => {
  await signTx()
}, 0)

// setTimeout(async () => {
//   let address = await longPubKeyToAddress("0x16cb9aeb5627c8ceb03e434167baf66212b76d03e580a34b5516981e238138fe04b83cfd5c6c1e438241f9c18946ddb8a65e9e0ad844536bfbc8652d5017ee26", "mainnet")
//   let balance = await dotChain.getBalance(address)
//   console.log(`mainnet ${address} balance ${balance}`)
//   address = await longPubKeyToAddress("0x16cb9aeb5627c8ceb03e434167baf66212b76d03e580a34b5516981e238138fe04b83cfd5c6c1e438241f9c18946ddb8a65e9e0ad844536bfbc8652d5017ee26", "testnet")
//   balance = await dotChain.getBalance(address)
//   console.log(`testnet ${address} balance ${balance}`)
// }, 0);

// setTimeout(async () => {
//   // Retrieve the latest header
//   const num = await dotChain.getBlockNumber()
//   // await dotChain.scanBlock(6845266, 6845267)
//   // https://westend.subscan.io/extrinsic/5651853-2
//   // https://westend.subscan.io/extrinsic/0x97dbdf6775ba025981d58078a226df979651dc2d69732f7a10f11e6b001f58ce
//   await dotChain.scanBlock(6845337, 6845338)

//   console.log(` last block #${num} `)
// }, 0)
// // https://westend.subscan.io/extrinsic/0x97dbdf6775ba025981d58078a226df979651dc2d69732f7a10f11e6b001f58ce
// [
//   {
//     name: "calls",
//     type: "Vec<<T as Config>::Call>",
//     value: [
//       {
//         call_index: "0403",
//         call_module: "Balances",
//         call_name: "transfer_keep_alive",
//         params: [
//           {
//             name: "dest",
//             type: "Address",
//             value: {
//               Id: "1c2d0f96e8b3fdd5f69dfe259133137e2eaa1e30c105f606dd6e064352874a89"
//             }
//           },
//           {
//             name: "value",
//             type: "Compact<Balance>",
//             value: "5974869974187"
//           }
//         ]
//       },
//       {
//         call_index: "0001",
//         call_module: "System",
//         call_name: "remark",
//         params: [
//           {
//             name: "_remark",
//             type: "Bytes",
//             value: "05000000000000000000000000000000000000000000746573746e65745f303236"
//           }
//         ]
//       }
//     ]
//   }
// ]

// https://westend.subscan.io/extrinsic/5651853-2
// [
//   {
//     name: "calls",
//     type: "Vec<<T as Config>::Call>",
//     value: [
//       {
//         call_index: "0400",
//         call_module: "Balances",
//         call_name: "transfer",
//         params: [
//           {
//             name: "dest",
//             type: "Address",
//             value: {
//               Id: "c97e2fb77f41c51adbfa84fd8bfe65f9172bc525d156df53c9dfe314d6bb79eb"
//             }
//           },
//           {
//             name: "value",
//             type: "Compact<Balance>",
//             value: "6"
//           }
//         ]
//       },
//       {
//         call_index: "0001",
//         call_module: "System",
//         call_name: "remark",
//         params: [
//           {
//             name: "_remark",
//             type: "Bytes",
//             value: "0xabcd0123456Hello"
//           }
//         ]
//       }
//     ]
//   }
// ]
