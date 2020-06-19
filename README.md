# zkSync in Yagna

This repository is a collection of docs and examples to help implement zkSync into Yagna

- [Yagna](github/yagna) is: An open platform and marketplace for distributed computations
- [zkSync](zksync.io) is: scaling and privacy engine for Ethereum

## Introduction

Yagna, as a marketplace, would like to use zkSync as a means of value transfer.

The main reasons are:

- [Cheaper transactions](https://zksync.io/faq/tokens.html)
- [No ETH required for gas](https://zksync.io/faq/tokens.html#how-fees-are-payed)
- [Better scalable](https://zksync.io/faq/tech.html#maximum-throughput)

Compared to [other tools investigated](https://docs.google.com/document/d/1r54ECD3Fcb0maZLTYCAaizvmtLIPRo_Tw6609stg7ic/edit#heading=h.yo8rqpdd38p2):

- Native support for ERC20 tokens
- Quick exit possible ( 10 min ) [src](https://zksync.io/faq/tech.html#transaction-finality)
- Security like the main chain [src](https://zksync.io/faq/security.html)


## Happy user flow ( without yagna )

### Provider

- set signing key ( [how-to](https://zksync.io/dev/tutorial.html#unlocking-zksync-account) )
- monitor incoming payments( [how-to](https://zksync.io/dev/tutorial.html#checking-zksync-account-balance) - _TODO: better way then check balance?_ )
- withdraw to any(?) mainnet address( [how-to](https://zksync.io/dev/tutorial.html#withdrawing-funds-back-to-ethereum) )

### Requestor

- set signing key( [how-to](https://zksync.io/dev/tutorial.html#unlocking-zksync-account) )
- deposit funds to zkSync contract( [how-to](https://zksync.io/dev/tutorial.html#depositing-assets-from-ethereum-into-zksync) )
- send payments when computations are accepted( [how-to](https://zksync.io/dev/tutorial.html#making-a-transfer-in-zksync) )
- withdraw to any(?) mainnet address( [how-to](https://zksync.io/dev/tutorial.html#withdrawing-funds-back-to-ethereum) )

## Happy user flow with yagna

- Account unlocked -> check if signing key is set -> set signing key
- Requestor
  - Before allowance is created, funds need to be deposited in zkSync contract
  - Make allowance required for posting demand, options for allowance:
    - Can be a "virtual" safe only inside Yagna
    - Can be a safe inside the zkSync contract
    - Can be the funds deposited in zkSync
  - Send zkSync transaction on each debit note and invoice
- Provider
  - Withdraw funds to any(?) mainnet ethereum wallet
    - out of the box only own wallet seems possible ( TODO check )
    - transaction fees will be payed from the withdrawn funds
      - Example: withdraw 10$ in value, pay 0.05$ to the network, receive 9.95$ in ethereum wallet




## Steps

- [x] Describe happy user flow abstract and from yagna
- [ ] Write examples to use the javascript library like yagna would use it
- [ ] Write rust client library for zkSync
- [ ] Write examples to run a full local dev environment
- [ ] Describe worse case scenario exit strategy


## Remarks

- [ ] Decide on what provers we will use ( Matter Labs or Golem Factory)
