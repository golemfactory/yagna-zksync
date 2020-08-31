const ethers = require("ethers");
const fetch = require("node-fetch");
const Web3 = require('web3');
const stdio = require('stdio');
const fs = require('fs');

const { createLogger, format, transports } = require("winston");
const { utils } = require("ethers");
const { throwError } = require("ethers/errors");
const { sleep } = require("zksync/build/utils");
const logger = createLogger({
  level: "debug",
  format: format.combine(
    format.splat(),
    format.simple()
  ),
  transports: [new transports.Console()],
});

const ETH_FAUCET_ADDRESS = "http://faucet.testnet.golem.network:4000/donate";
const GNT_CONTRACT_ADDRESS = "0xd94e3DC39d4Cad1DAd634e7eb585A57A19dC7EFE";
const ZKSYNC_CONTRACT_ADDRESS = "0x7ec7251192cdefe3ea352181ca0e6c2a08a411a5";
const FAUCET_CONTRACT_ADDRESS = "0x59259943616265A03d775145a2eC371732E2B06C";
const RINKEBY_CHAIN_ID = 4;
const GNT_ZKSYNC_ID = 16;
const FAUCET_MIN_ABI = [
  {
    "constant": false,
    "inputs": [],
    "name": "create",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
];

// The minimum ABI to get ERC20 Token balance
const GNT_MIN_ABI = [
  // balanceOf
  {
    "constant": true,
    "inputs": [{ "name": "_owner", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "name": "balance", "type": "uint256" }],
    "type": "function"
  },
  // increaseAllowance
  {
    "constant": false,
    "inputs": [
      {
        "name": "spender",
        "type": "address"
      },
      {
        "name": "addedValue",
        "type": "uint256"
      }
    ],
    "name": "increaseAllowance",
    "outputs": [
      {
        "name": "",
        "type": "bool"
      }
    ],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
];

// getBalanceToWithdraw and withdrawETH not supported in the JS client
const ZKSYNC_MIN_ABI = [
  {
    "constant": true,
    "inputs": [
      {
        "internalType": "address",
        "name": "_address",
        "type": "address"
      },
      {
        "internalType": "uint16",
        "name": "_tokenId",
        "type": "uint16"
      }
    ],
    "name": "getBalanceToWithdraw",
    "outputs": [
      {
        "internalType": "uint128",
        "name": "",
        "type": "uint128"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {
        "internalType": "uint128",
        "name": "_amount",
        "type": "uint128"
      }
    ],
    "name": "withdrawETH",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {
        "internalType": "contract IERC20",
        "name": "_token",
        "type": "address"
      },
      {
        "internalType": "uint128",
        "name": "_amount",
        "type": "uint128"
      }
    ],
    "name": "withdrawERC20",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  }
]

const MIN_GNT_BALANCE = ethers.utils.parseEther("10.0");
const MIN_ETH_BALANCE = Web3.utils.fromWei("1000000000000000", 'ether');

let web3 = null;
let gnt_contract = null;
let faucet_contract = null;
let zksync_contract = null;

const ops = stdio.getopt({
  'provider': { key: 'p', args: 1, required: false, description: "Provider's mnemonic", default: "" },
  'requestor': { key: 'r', args: 1, required: false, description: "Requestor's mnemonic", default: "" },
  'exodus': { key: 'e', args: 0, required: false, description: "Perform emergency withdrawal (exodus)", default: "" },
  'save': { key: 's', args: 0, required: false, description: "Save key.json files generated during this run", default: "" },
});

main();

async function main() {
  let syncProvider = false;
  let ethersProvider = false;

  const exodus = ops.exodus;
  const saveKeys = ops.save;
  logger.info("Running " + (exodus ? "exodus" : "basic") + " zkSync scenario");
  try {
    logger.info("Initializing web3...");
    web3 = new Web3(new Web3.providers.HttpProvider('http://1.geth.testnet.golem.network:55555'));
    // Creates GNT contracts
    gnt_contract = new web3.eth.Contract(GNT_MIN_ABI, GNT_CONTRACT_ADDRESS);
    faucet_contract = new web3.eth.Contract(FAUCET_MIN_ABI, FAUCET_CONTRACT_ADDRESS);
    zksync_contract = new web3.eth.Contract(ZKSYNC_MIN_ABI, ZKSYNC_CONTRACT_ADDRESS);
    logger.info("web3 initialized!");

    logger.info("Loading zksync library...");
    const zksync = await require("zksync");

    // To interact with Sync network users need to know the endpoint of the operator node.
    logger.debug("Connecting to rinkeby zkSync-provider...");
    const syncProvider = await zksync.getDefaultProvider("rinkeby", "HTTP");

    // Most operations require some read-only access to the Ethereum network.
    // We use ethers library to interact with Ethereum.
    logger.debug("Connecting to rinkeby ethers-provider...");
    ethersProvider = new ethers.getDefaultProvider("rinkeby");

    logger.info("Libraries loaded!");

    // Create 2 wallet, requestor and provider
    const requestorWallet = ops.requestor && ops.requestor !== "" ?
      ethers.Wallet.fromMnemonic(ops.requestor).connect(ethersProvider)
      : ethers.Wallet.createRandom().connect(ethersProvider);
    logger.info("Requestor address: " + requestorWallet.address);
    logger.info("Requestor mnemonic: " + requestorWallet.mnemonic)
    if (saveKeys) {
      let json_key = await requestorWallet.encrypt("");
      // Fix for capital sensetivity of yagna keyfile
      json_key = json_key.replace("Crypto", "crypto");
      logger.info("Requestor json: " + json_key);
      fs.writeFileSync( "requestor.key.json", json_key);
    }
    const requestorSyncWallet = await zksync.Wallet.fromEthSigner(requestorWallet, syncProvider);

    const providerWallet = ops.provider && ops.provider !== "" ?
      ethers.Wallet.fromMnemonic(ops.provider).connect(ethersProvider)
      : ethers.Wallet.createRandom().connect(ethersProvider);
    logger.info("Provider address: " + providerWallet.address);
    logger.info("Provider mnemonic: " + providerWallet.mnemonic);
    if (saveKeys) {
      let json_key = await providerWallet.encrypt("");
      // Fix for capital sensetivity of yagna keyfile
      json_key = json_key.replace("Crypto", "crypto");
      logger.info("Provider json: " + json_key);
      fs.writeFileSync( "provider.key.json", json_key);
    }
    const providerSyncWallet = await zksync.Wallet.fromEthSigner(providerWallet, syncProvider);

    logger.info("Requesting funds for the Requestor...")
    await request_funds(requestorWallet);
    logger.info("Funds requested!")

    if (exodus) {
      logger.info("Requesting funds for the Provider...");
      await request_eth(providerWallet);
      logger.info("Funds requested!");
    }

    await increaseAllowance(requestorWallet);

    logger.info("Before Requestor's funds: " + await get_gnt_balance(requestorWallet.address) + " GNT");
    logger.info("Before Provider's funds: " + await get_gnt_balance(providerWallet.address) + " GNT");

    logger.info("Depositing Requestor's funds on zkSync...")
    // Deposit assets on requestor
    const deposit = await requestorSyncWallet.depositToSyncFromEthereum({
      depositTo: requestorSyncWallet.address(),
      token: "GNT",
      amount: ethers.utils.parseEther("10.0"),
    });
    logger.info("Done!");

    // Await confirmation from the zkSync operator
    // Completes when a promise is issued to process the tx
    logger.info("Waiting for confirmation from zkSync operator...");
    const depositReceipt = await deposit.awaitReceipt();
    logger.info("Confirmed!");

    logger.info("Requestor's funds deposited on zkSync network");

    logger.info("After deposit requestor funds: " + await get_gnt_balance(requestorWallet.address) + " GNT");
    logger.info("After provider funds: " + await get_gnt_balance(providerWallet.address) + " GNT");

    // Unlock Requestor's account
    logger.info("Unlocking Requestor's account on zkSync...")
    if (! await requestorSyncWallet.isSigningKeySet()) {
      if (await requestorSyncWallet.getAccountId() == undefined) {
        throw new Error("Unknwon account");
      }

      const changeRequestorPubkey = await requestorSyncWallet.setSigningKey();

      // Wait until the tx is committed
      await changeRequestorPubkey.awaitReceipt();
    }
    logger.info("Requestor's account unlocked");

    logger.info("Commited Requestor's funds on zkSync: " + fromWei(await requestorSyncWallet.getBalance("GNT")) + " GNT");
    logger.info("Verified Requestor's funds on zkSync: " + fromWei(await requestorSyncWallet.getBalance("GNT", "verified")) + " GNT");

    logger.info("Commited Provider's funds on zkSync: " + fromWei(await providerSyncWallet.getBalance("GNT")) + " GNT");
    logger.info("Verified Provider's funds on zkSync: " + fromWei(await providerSyncWallet.getBalance("GNT", "verified")) + " GNT");

    logger.info("Making a simple transfer...");
    const transfer = await requestorSyncWallet.syncTransfer({
      to: providerSyncWallet.address(),
      token: "GNT",
      amount: zksync.utils.closestPackableTransactionAmount(
        ethers.utils.parseEther("6.0")),
    });
    logger.info("Done!");

    logger.info("Waiting for confirmation on zkSync...");
    const transferReceipt = await transfer.awaitReceipt();
    logger.info("Confirmed!");

    logger.info("(After transfer) Commited Requestor's funds on zkSync: " + fromWei(await requestorSyncWallet.getBalance("GNT")) + " GNT");
    logger.info("(After transfer) Verified Requestor's funds on zkSync: " + fromWei(await requestorSyncWallet.getBalance("GNT", "verified")) + " GNT");

    logger.info("(After transfer) Commited Provider's funds on zkSync: " + fromWei(await providerSyncWallet.getBalance("GNT")) + " GNT");
    logger.info("(After transfer) Verified Provider's funds on zkSync: " + fromWei(await providerSyncWallet.getBalance("GNT", "verified")) + " GNT");

    // Unlock Provider's account
    logger.info("Unlocking Provider's account on zkSync...")
    if (! await providerSyncWallet.isSigningKeySet()) {
      if (await providerSyncWallet.getAccountId() == undefined) {
        throw new Error("Unknwon account");
      }

      const changeProviderPubkey = await providerSyncWallet.setSigningKey();

      // Wait until the tx is committed
      await changeProviderPubkey.awaitReceipt();
    }
    logger.info("Provider's account unlocked");

    if (exodus) {
      logger.info("Starting emergency withdrawal...");
      const emergencyWithdraw = await providerSyncWallet.emergencyWithdraw({
        token: "GNT",
      });
      logger.info("Done.");

      logger.info("Verifying receipt...");
      await emergencyWithdraw.awaitVerifyReceipt();
      logger.info("Done.");

      const balanceToWithdraw = await zksync_contract.methods.getBalanceToWithdraw(providerWallet.address, GNT_ZKSYNC_ID).call();
      logger.info("Balance to withdraw: " + fromWei(balanceToWithdraw) + " GNT");

      const withdrawalCallData = zksync_contract.methods.withdrawERC20(GNT_CONTRACT_ADDRESS, balanceToWithdraw).encodeABI();
      logger.info("Withdrawing to Ethereum chain...");
      const withdrawalTx = await providerWallet.sendTransaction({
        to: ZKSYNC_CONTRACT_ADDRESS,
        chainId: RINKEBY_CHAIN_ID,
        data: withdrawalCallData
      });
      logger.info("Done.");

      logger.info("Verifying receipt...");
      await withdrawalTx.wait();
      logger.info("Done.");

    } else {
      const totalBalance = await providerSyncWallet.getBalance("GNT");
      logger.info("Total balance: " + fromWei(totalBalance) + " GNT");

      const withdrawFee = (await syncProvider.getTransactionFee("Withdraw", providerWallet.address, "GNT")).totalFee;
      logger.info("Withdraw fee: " + fromWei(withdrawFee) + " GNT");

      const withdrawAmount = fromWei(totalBalance - withdrawFee);
      logger.info("Withdraw amount: " + withdrawAmount + " GNT");

      logger.info("Withdrawing Provider's funds...");
      const withdraw = await providerSyncWallet.withdrawFromSyncToEthereum({
        ethAddress: providerWallet.address,
        token: "GNT",
        amount: ethers.utils.parseEther(withdrawAmount),
      });
      logger.info("Done!");

      logger.info("Verifying receipt...");
      const withdrawalReceipt = await withdraw.awaitVerifyReceipt();
      logger.info("Done!");

    }
    logger.info("(After withdrawal) Commited Requestor's funds on zkSync: " + fromWei(await requestorSyncWallet.getBalance("GNT")) + " GNT");
    logger.info("(After withdrawal) Verified Requestor's funds on zkSync: " + fromWei(await requestorSyncWallet.getBalance("GNT", "verified")) + " GNT");

    logger.info("(After withdrawal) Commited Provider's funds on zkSync: " + fromWei(await providerSyncWallet.getBalance("GNT")) + " GNT");
    logger.info("(After withdrawal) Verified Provider's funds on zkSync: " + fromWei(await providerSyncWallet.getBalance("GNT", "verified")) + " GNT");

    logger.info("(After withdrawal) Provider's funds on ethereum: " + (await get_gnt_balance(providerWallet.address)) + " GNT");

    logger.info("Scenario completed, have a nice day!");
  } catch (e) {
    logger.error("Scenario failed with error:", e);
  } finally {
    if (syncProvider) {
      await syncProvider.disconnect();
    }
  }
}

async function get_eth_balance(address) {
  return fromWei(await web3.eth.getBalance(address));
}

async function get_gnt_balance(address) {
  return fromWei(await gnt_contract.methods.balanceOf(address).call());
}

function fromWei(amount) {
  return Web3.utils.fromWei("" + amount, 'ether');
}

async function request_funds(wallet) {
  await request_eth(wallet);
  await request_gnt(wallet);
}

async function request_eth(wallet) {
  let address = wallet.address;

  if (await get_eth_balance(address) >= MIN_ETH_BALANCE) {
    return
  }

  logger.info("Requesting ETH for: " + address);
  let url = ETH_FAUCET_ADDRESS + "/" + address;

  var i = 0;

  for (; i < 10; i++) {
    const response = await fetch(url);
    const r = await response.text();
    logger.debug("ETH faucet repsonse: " + r);
    if (r.includes("txhash") || r.includes("sufficient funds")) {
      break;
    }
    await sleep(1000);
  }

  logger.info("Waiting for confirmations...");
  await sleep_with_progress_bar(30);

  if (await get_eth_balance(wallet.address) < MIN_ETH_BALANCE) {
    throwError("Cannot request ETH!")
  }

  logger.info("ETH requested!");
}

async function request_gnt(wallet) {
  const gnt_balance = await get_gnt_balance(wallet.address);
  if (gnt_balance < MIN_GNT_BALANCE) {
    logger.info("Requesting GNT for: " + wallet.address);
    const eth_balance = await get_eth_balance(wallet.address);
    if (eth_balance < MIN_ETH_BALANCE) {
      throwError("Insuficient gas for the Faucet!");
    }

    const callData = faucet_contract.methods.create().encodeABI();
    const transactionParameters = {
      to: FAUCET_CONTRACT_ADDRESS,
      value: '0x00',
      data: callData,
      chainId: RINKEBY_CHAIN_ID,
    };
    let faucetTx = await wallet.sendTransaction(transactionParameters);
    logger.info("Waiting for confirmations...");
    let faucetReceipt = await faucetTx.wait();
    logger.info("Done!");
  }
}

async function increaseAllowance(wallet) {
  logger.info("Sending increaseAllowance...");
  const callData = gnt_contract.methods.increaseAllowance(ZKSYNC_CONTRACT_ADDRESS, utils.parseEther("100.0")).encodeABI();
  const transactionParameters = {
    to: GNT_CONTRACT_ADDRESS,
    value: '0x00',
    data: callData,
    chainId: RINKEBY_CHAIN_ID,
  };
  let allowanceTx = await wallet.sendTransaction(transactionParameters);
  logger.info("Waiting for confirmations...");
  let allowanceReceipt = await allowanceTx.wait();
  logger.info("Done!");

}

async function sleep_with_progress_bar(seconds) {
  const pbar = new stdio.ProgressBar(seconds);
  var i = setInterval(() => pbar.tick(), 1000);
  pbar.onFinish(() => {
    clearInterval(i);
  });
  await sleep(seconds * 1000);
}
