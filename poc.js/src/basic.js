
main();

async function main()
{
	try
	{
		console.log("loading zksync library")
		// Report import vs require ( maybe TS vs JS ) ???
		const zksync = await require('zksync');
		console.log("connecting to rinkeby zkSync-provider")
		// REPORT: wss server down?
		const syncProvider = await zksync.getDefaultProvider("rinkeby", "HTTP");
		console.log("connecting to ethers-provider")
		const ethersProvider = new ethers.getDefaultProvider('rinkeby');

		// Create 2 wallet, requestor and provider


		// OPTIONAL: Request faucet on requestor
		// 1. check balance ( ETH-ETH, ETH-GNT, ZK-ETH, ZK-GNT)
		// 2. only faucet if total ETH or GNT is too low


		// Deposit assets on requestor
		// only if balance is on ETH-*


		// Unlock accounts


		// Transact some funds from requestor to provider


		// withdraw funds to provider ETH wallet


		// OPTIONAL: Return funds to requestor

		console.log("DONE")
	}
	catch(e)
	{
		console.log("ERROR", e)
	}
}
