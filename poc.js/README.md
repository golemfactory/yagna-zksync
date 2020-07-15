# Basic reference scenario implementation for zksync in javascript

## pre-requisites

### NodeJs
Node BETA
```
nvm use lts/erbium
```

LTS node  ( node v10.20.1 (npm v6.14.4) ) also works, but need experimental features
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
```
npm run basic
```

for exodus path:
```
npm run exodus
```

## TODO

- [x] install `zksync` library and save to `package.json`
- [x] copy scenario from zksync docs to `src/basic.js`
- [x] add logging before and after each step
- [x] add `npm run basic` to call basic.js
- [ ] ETH flow
  - [ ] create Wallets
  - [ ] top-up Wallets / faucet
  - [ ] deposit to zksync
  - [ ] transfer
  - [ ] withdraw
  - [ ] return funds (OPT)
- [ ] adjust scenario to include NGNT
- [ ] make readme better
- [ ] add exodus script, move shared logic to `src/lib.js`
