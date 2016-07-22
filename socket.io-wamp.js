/**
 * Socket.io WAMP - A simple client of PUBSUB and RPC interface for Socket.io server
 *
 * @author Rafael Freitas Lima
 */
;(function () {
  var _export_socket_wamp = function (io) {
    /**
     * Promise Object Utility
     * @type {Object}
     */
    var q = {
      /**
       * Promise Class
       */
      Promise: function Promise () {
        this.$id = getRandom()
        this.status = -1
        this.$data = null
        this.handlers_done = []
        this.handlers_error = []
        var self = this

        /**
         * Attach callback for `resolve()` promises
         * @param  {Function} callback Called when done
         * @return {Promise} Return the promise instance
         */
        this.then = function then (callback) {
          self.handlers_done.push(callback)
          if (self.status > -1) {
            setTimeout(function () {
              if (self.status === 1) {
                callback(self.$data)
              }
            }, 0)
          }
          return this
        }

        /**
         * Attach callback for `reject()` promises
         * @param  {Function} callback
         * @return {Promise}
         */
        this.fail = this.catch = this.error = function error (callback) {
          self.handlers_error.push(callback)
          if (self.status > -1) {
            setTimeout(function () {
              if (self.status === 0) {
                callback(self.$data)
              }
            }, 0)
          }
          return this
        }
      },

      /**
       * Create an interface to handle a promise
       *
       * @example
       * Usage:
       * ```js
       * 	var deferred = q.defer()
       * 	// ok
       * 	deferred.resolve("Im OK")
       * 	// or error
       * 	deferred.reject("Error occours")
       * 	// return the promise
       * 	return deferred.promise
       * ```
       * @return {Object}
       */
      defer: function defer () {
        return {
          /**
           * Resolve the promise
           * @param  {Mixed} data Data to send for listeners
           */
          resolve: function resolve (data) {
            this.promise.status = 1
            this.promise.$data = data
            var handlers = this.promise.handlers_done
            setTimeout(function () {
              for (var i in handlers) {
                if (handlers.hasOwnProperty(i)) {
                  try {
                    handlers[i](data)
                  } catch (e) {} finally {}
                }
              }
            }, 0)
          },
          /**
           * Reject the promise
           * @param  {Mixed} reason Data to send for listeners
           */
          reject: function reject (reason) {
            this.promise.status = 0
            this.promise.$data = reason
            var handlers = this.promise.handlers_error
            setTimeout(function () {
              for (var i in handlers) {
                if (handlers.hasOwnProperty(i)) {
                  try {
                    handlers[i](reason)
                  } catch (e) {
                    console.log('error ao chamar o handler', e)
                  } finally {}
                }
              }
            }, 0)
          },
          /**
           * Instance of Promise
           */
          promise: new q.Promise()
        }
      }
    }

    // export the promise interface
    io.Q = q

    /**
     * Error Class
     * @param {Object} err Can be a `pack` object
     */
    function SocketWampError (err) {
      this.name = 'SocketWampError'
      this.code = err && err.code ? err.code : 'error0'
      this.message = err && err.message ? err.message : 'unknown error'
    }
    SocketWampError.prototype = Error.prototype

    /**
     * Copy of connect function of socket.io client
     * @type {Function}
     */
    var io_connection_fn = io.connect

    /**
     * Check if an object is a promise interface
     * @param  {Mixed}  subject
     * @return {Boolean}
     */
    function isPromise (subject) {
      return typeof subject === 'object' && typeof subject.then === 'function' && typeof subject.catch === 'function'
    }

    /**
     * Generate a randon ID
     * @return {String}
     */
    function getRandom () {
      return Math.random().toString(36).slice(-8)
    }

    // criando interface para captura da conexao

    /**
     * Wrap io connect function for apply the wamp interface
     * @return {Object}
     */
    io.connect = function wrap_io_connect_function () {
      return create_wamp_interface(io_connection_fn.apply(io, arguments))
    }

    /**
     * Apply the interface for PUBSUB and RPC on socket client objects
     * @param  {SocketClient} socket Handle for client socket connections
     * @return {SocketClient}
     */
    function create_wamp_interface (socket) {
      var rpc_pool = {}
      var pubsub_pool = {}

      /*
          RPC
          ====================================================================
      */

      function is_registred (procedure_name) {
        return rpc_pool.hasOwnProperty(procedure_name)
      }

      /**
       * Handle calls to forward results of calls for the right client
       * @param  {Object} pack
       * @param  {Function} callback
       */
      socket.on('wamp_call_callee', function (pack, callback) {
        // checa se a procedure existe no pool
        if (pack.procedure && is_registred(pack.procedure)) {
          var procedure = rpc_pool[pack.procedure]
          if (typeof procedure.procedure === 'function') {
            var result = procedure.procedure.apply(procedure, pack.args)
            if (isPromise(result)) {
              result.then(callback)
            } else {
              callback(result)
            }
          } else {
            // TODO levantar erro de procedure invalida
          }
        } else {
          // TODO enviar erro de procedure nao configurada
        }
      })

      /**
       * Register a procedure on main socket server
       * @example
       *
       * Usage 1:
       *
       * 	socket.register("my.procedure.name", function(param1Val, param2Val){
       * 		return param1Val + param2Val
       * 	})
       * 	.then(function(){
       * 		console.log("my.procedure.name is registred")
       * 	})
       * 	.catch(function(err){
       * 		console.error("Something was wrong on register", err)
       * 	})
       *
       * Usage 2: with promises
       *
       * 	socket.register("my.procedure.name", function(param1Val, param2Val){
       * 		var deferred = q.defer()
       *
       * 		// schedule for the future
       * 		setTimeout(function(){
       * 			deferred.resolve(param1Val + param2Val)
       * 		}, 1000)
       *
       * 		return deferred.promise
       * 	})
       * 	.then(function(){
       * 		console.log("my.procedure.name is registred")
       * 	})
       * 	.catch(function(err){
       * 		console.error("Something was wrong on register", err)
       * 	})
       *
       * @param  {String}   procedure_name
       * @param  {Function} fn
       * @return {Promise}
       */
      socket.constructor.prototype.register = function register (procedure_name, fn) {
        var dfd = q.defer()

        socket.emit('wamp_register', procedure_name, function _wamp_register_callback (response) {
          // console.log("wamp_register",response)
          if (response.code === 'wamp_registred_success') {
            rpc_pool[procedure_name] = {
              name: procedure_name,
              procedure: fn,
              client: socket
            }
            dfd.resolve(response)
          } else {
            dfd.reject(response)
          // throw response
          }
        })

        return dfd.promise
      }

      /**
       * Make a call to a procedure on socket server
       * @example
       * Usage:
       * 	socket.call("my.procedure.name", "param1", "param2")
       * 	.then(function(result){
       * 		console.log("my.procedure.name result=", result)
       * 	})
       * 	.catch(function(err){
       * 		console.error("Something was wrong", err)
       * 	})
       *
       *
       * @param  {String} procedure_name
       * @param  {Mixed} args
       * @return {Promise}
       */
      socket.constructor.prototype.call = function register (procedure_name) {
        var args = Array.prototype.slice.call(arguments)
        args.shift()

        var dfd = q.defer()

        socket.emit('wamp_call', {procedure: procedure_name, args: args}, function _wamp_call_callback (pack) {
          if (!pack || pack.code === 'wamp_call_fail') {
            // console.error("SocketWampError", pack)
            dfd.reject(new SocketWampError(pack || 'Empty pack from server'))
          } else {
            dfd.resolve(pack)
          }
        })

        return dfd.promise
      }

      /*
          PUBSUB
          ====================================================================
      */

      /*
          EVENT HANDLERS
       */

      socket.on('disconnect', function _wamp_connect () {
        unregister_subscriber(socket)
      })
      socket.on('error', function _wamp_connect () {
        unregister_subscriber(socket)
      })

      /**
       * Register a callback for a topic on a client
       * @param  {String}         topic
       * @param  {SocketClient}   client
       * @param  {Function}       callback
       */
      function register_subscriber (topic, client, callback) {
        if (typeof pubsub_pool[topic] === 'undefined') {
          pubsub_pool[topic] = {
            name: topic,
            callbacks: [],
            clients: []
          }
        }
        callback.$client = client
        pubsub_pool[topic].callbacks.push(callback)
      }

      /**
       * Unregister a callback from pubsub pool
       * @param  {SocketClient} client
       */
      function unregister_subscriber (client) {
        for (var j in pubsub_pool) {
          if (pubsub_pool.hasOwnProperty(j)) {
            var route = pubsub_pool[j]
            for (var i = route.callbacks.length - 1; i >= 0; i--) {
              if (route.callbacks[i].$client === client) {
                route.callbacks.splice(i, 1) // remove from array
              }
            }
          }
        }
      }

      /**
       * EVENT
       * Listening publish command for the client
       * pack: {"route":"sample.topic","args":["sample param"]}
       * @param  {Object} pack
       */
      socket.on('wamp_publish_callee', function _wamp_publish_callee (pack) {
        if (pubsub_pool.hasOwnProperty(pack.route)) {
          for (var i = 0; i < pubsub_pool[pack.route].callbacks.length; i++) {
            try {
              var fn = pubsub_pool[pack.route].callbacks[i]
              fn.apply(socket, pack.args)
            } catch (e) {} finally {}
          }
        }
      })

      /**
       * Subscribe a top on main socket server
       * @example
       *
       * Usage:
       *
       * 	socket.subscribe("my.topic.name", function(param1Val, param2Val){
       * 		console.log("I listened it:", param1Val + param2Val)
       * 	})
       * 	.then(function(){
       * 		console.log("my.topic.name is registred")
       * 	})
       * 	.catch(function(err){
       * 		console.error("Something was wrong on subscribe", err)
       * 	})
       *
       *
       * @param  {String}   topic
       * @param  {Function} fn
       * @return {Promise}
       */
      socket.constructor.prototype.subscribe = function subscribe (topic, callback) {
        var dfd = q.defer()

        socket.emit('wamp_subscribe', topic, function _wamp_subscribe_callback (response) {
          // console.log("wamp_subscribe",response)
          if (response.code === 'wamp_subscribe_success') {
            register_subscriber(topic, socket, callback)

            dfd.resolve(response)
          } else {
            dfd.reject(response)
          // throw response
          }
        })

        return dfd.promise
      }

      /**
       * Publish into a topic
       *
       * @example
       * Usage:
       * 	socket.publish("my.topic.name", "param1", "param2")
       * 	.then(function(){
       * 		console.log("my.topic.name was published")
       * 	})
       * 	.catch(function(err){
       * 		console.error("Something was wrong", err)
       * 	})
       *
       * @param  {String} topic
       * @param  {Mixed} args
       * @return {Promise}
       */
      socket.constructor.prototype.publish = function publish (topic) {
        var args = Array.prototype.slice.call(arguments)
        args.shift()

        var dfd = q.defer()

        socket.emit('wamp_publish', {route: topic, args: args}, function _wamp_publish_callback (pack) {
          if (pack.code !== 'wamp_publish_ok') {
            // console.error("SocketWampError", pack)
            dfd.reject(new SocketWampError(pack))
          } else {
            dfd.resolve(pack)
          }
        })

        return dfd.promise
      }

      return socket
    }
  }

  // exports

  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = _export_socket_wamp
  } else if (typeof define === 'function' && define.amd) {
    define([], _export_socket_wamp)
  } else {
    var g
    if (typeof window !== 'undefined') {
      g = window
    } else if (typeof global !== 'undefined') {
      g = global
    } else if (typeof self !== 'undefined') {
      g = self
    } else {
      g = this
    }
    g.wamplib = _export_socket_wamp
    if (typeof g.io === 'function') {
      _export_socket_wamp(g.io)
    } else {
      console.error('Socket.io client is not present')
    }
  }
})()
