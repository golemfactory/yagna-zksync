## ZkSync mock server

A mocked zkSync server that supports the minimal set of operations needed for basic PoC scenario.
    
#### Setup 
```
$ cd mock-server
$ python3 -m venv .venv
$ . .venv/bin/activate
$ pip install -r requirements.txt
```
----

#### Running

Before starting the server start a Docker container with Ganache and
mocked zkSync contract:

```
$ docker run -d --rm -ti -p 8545:8545 --name docker_ethereum \
    docker.pkg.github.com/golemfactory/gnt2/gnt2-docker-yagna:latest
```

Run the server:
```
$ python mock_server.py
```

----
#### Testing
```
$ cd poc.js
$ yarn ganache
```