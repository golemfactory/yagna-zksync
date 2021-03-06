# Basic reference scenario implementation for zksync in javascript

## pre-requisites

### NodeJs

Node BETA

```
nvm use lts/erbium
```

LTS node ( node v10.20.1 (npm v6.14.4) ) also works, but need experimental features

```
NODE_OPTIONS='--experimental-modules' npm run <SCENARIO>
```

### yarn

google install yarn

## dependencies

```
cd poc.js/
yarn install
```

## Run scenario

for "happy path":

```console
yarn basic
```

save private keys to files:

 ```console
yarn basic -s
```

use existing private keys:

```console
yarn basic -r "<requestor_private_key>" -p "<provider_private_key>"
```

for exodus path:

```console
yarn exodus
```

## TODO

- [x] install `zksync` library and save to `package.json`
- [x] copy scenario from zksync docs to `src/basic.js`
- [x] add logging before and after each step
- [x] add `npm run basic` to call basic.js
- [x] ETH flow
  - [x] create Wallets
  - [x] top-up Wallets / faucet
  - [x] deposit to zksync
  - [x] transfer
  - [x] withdraw
  - [ ] return funds (OPT)
- [x] adjust scenario to include tGLM
- [x] make readme better
- [x] add exodus script, ~~move shared logic to `src/lib.js`.~~

## Notes

- Account has to have some funds to be unlocked (zkSync)
- Precision of transfer in zkSync is limited
