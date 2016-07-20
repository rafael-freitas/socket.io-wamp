# socket.io-wamp
A simple client of PUBSUB and RPC interface for Socket.io server

## Installation

__Bower__
```sh
bower install socket.io-wamp
```

__npm__
```sh
npm install socket.io-wamp

# dependency
npm install socket.io-client
```

## Usage

Include on your page
```html
<script src="bower_components/socket.io-wamp.js" charset="utf-8"></script>
```

Or with Node

Install the dependency `socket.io-client`
```sh
npm install socket.io-client
```

Then, on your script:
```js
// requires socket.io-client
var io = require('socket.io-client')('http://localhost:3000');
require("socket.io-wamp")(io);
```

### Using the library
```js
// call io.connect() to apply the PUBSUB and RPC interface
socket = io.connect();

socket.on('connect', function (client) {

    // PubSub

    // subscribe
    client.subscribe("chat.message", function (message) {
        // do Something
    })
    // publish
    client.publish("chat.message", "send a message here");

    // RPC
    var nickname;
    client.register("chat.nick.set", function (nick) {
        nickname = nick;
        return "new nick is: " + nick
    })

    client.call("chat.nick.set", "Batman");

}
```


### PubSub


__Subscribe a topic__
```js
client.subscribe("chat.message", function (message) {
    // do Something
    $('#messages').append($('<li>').text(message));
})
.then(function (pack) {
    console.log("The topic was registred on server", pack);
})
.catch(function(err) {
    console.error("Opss! Error", err);
});
```


__Publish to a topic__
```js
client.publish("chat.message", "Send this message for all subscribers")
.then(function () {
    console.log("OK");
})
.catch(function(err) {
    console.error("Opss! Error", err);
});
```

### RPC - Remote Procedure Call


__Register a topic__
```js
var users = []
client.register("chat.add.user", function (username) {
    // do Something
    users.push(username);
    return "Users online: " + users.length
})
.then(function (pack) {
    console.log("The topic was registered on server", pack);
})
.catch(function(err) {
    console.error("Opss! Error", err);
});
```


__Call to a topic__
```js
client.call("chat.add.user", "Batman")
.then(function (result) {
    console.log("How many users?" + result); // How many users? Users online: 1
})
.catch(function(err) {
    console.error("Opss! Error", err);
});
```


### Working with Promises

The Socket.io-wamp added a promise library for support with async responses.

```js
var q = io.Q; // promise support lib
```

Then, you can return a promise to `call()` procedures.

```js
var users = [];
var q = io.Q; // you can use any promise library

client.register("chat.add.user", function (username) {
    var deferred = q.defer();

    db.insert({name: username, last_join_at: new Date()})
    .then(function (docs) {
        deferred.resolve("Users online: " + docs.length)
    })
    promise.catch(function (err) {
        deferred.reject(err)
    });

    return deferred.promise;
})
.then(function (pack) {
    console.log("The topic was registered on server", pack);
})
.catch(function(err) {
    console.error("Opss! Error", err);
});
```


## Issues

On github [https://github.com/rafael-freitas/socket.io-wamp/issues]
