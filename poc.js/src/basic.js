const ethers = require("ethers");
const { createLogger, format, transports } = require("winston");
const logger = createLogger({
  level: "debug",
  format: format.simple(),
  transports: [new transports.Console()],
});

main();

async function main() {
  let syncProvider = false;
  let ethersProvider = false;

  try {
    logger.info("Running basic zkSync scenario");

    logger.info("loading zksync library");
    // Report? import vs require ( maybe TS vs JS )
    const zksync = await require("zksync");

    logger.debug("connecting to rinkeby zkSync-provider");
    const syncProvider = await zksync.getDefaultProvider("rinkeby");

    logger.debug("connecting to rinkeby ethers-provider");
    ethersProvider = new ethers.getDefaultProvider("rinkeby");

    logger.info("Libraries finished loading");

    // Create 2 wallet, requestor and provider
    logger.info("Wallets created");

    // OPTIONAL: Request faucet on requestor
    // 1. check balance ( ETH-ETH, ETH-GNT, ZK-ETH, ZK-GNT)
    // 2. only faucet if total ETH or GNT is too low
    logger.info("Enough funds available for this scenario");

    // Deposit assets on requestor
    // only if balance is on ETH-*
    logger.info("Funds deposited on zkSync network");

    // Unlock accounts
    logger.info("Accounts unlocked");

    // Transact some funds from requestor to provider
    logger.info("Transaction successfull");

    // withdraw funds to provider ETH wallet
    logger.info("Withdraw successfull");

    // OPTIONAL: Return funds to requestor
    logger.info("Funds returned to requestor");

    logger.info("Scenario completed, have a nice day!");
  } catch (e) {
    logger.fatal("Scenario failed with error:", e);
  } finally {
    if (syncProvider) {
      await syncProvider.disconnect();
    }
  }
}
