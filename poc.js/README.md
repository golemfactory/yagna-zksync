# Basic reference scenario implementation for zksync in javascript

## pre-requisites

Node stable ( node v10.20.1 (npm v6.14.4) )
```
nvm use stable
```

## dependencies

```
cd poc.js/
npm i
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

- [ ] install `zksync` library and save to `package.json`
- [ ] copy scenario from zksync docs to `src/basic.js`
- [ ] add logging before and after each step
- [ ] add `npm run basic` to call basic.js
- [ ] adjust scenario to include NGNT contract
- [ ] make readme better
- [ ] add exodus script, move shared logic to `src/lib.js`
