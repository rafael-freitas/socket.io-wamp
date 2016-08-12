/**
 * Socket.io WAMP - A simple client of PUBSUB and RPC interface for Socket.io server
 *
 * @author Rafael Freitas Lima <rafael@tag.mx>
 */
;(function () {
  var _export_socket_wamp = function (socket) {
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
                try {
                  callback(self.$data)
                } catch (e) {
                  console.error(e)
                  throw e
                }
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
                try {
                  callback(self.$data)
                } catch (e) {
                  console.error(e)
                  throw e
                }
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
                  } catch (e) {
                    console.error(e)
                  }
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
    // io.Q = q

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

    if (typeof socket !== 'undefined') {
      create_wamp_interface(socket)
    }

    return {
      q: q,
      createSocketWampInterface: create_wamp_interface
    }

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

    /**
     * Apply the interface for PUBSUB and RPC on socket client objects
     * @param  {SocketClient} socket Handle for client socket connections
     * @return {SocketClient}
     */
    function create_wamp_interface (socket) {
      if (socket.$wampInterface) {
        return socket
      }
      /**
       * Save RPC and Subscribe endpoints
       * @type {Object}
       */
      var clientUriStorage = {}

      socket.$wampInterface = true

      socket.on('wamp_pack_client', wamp_pack)

      function send (pack, done) {
        pack = pack || {}
        pack.caller = socket.id
        socket.emit('wamp_pack_server', pack, function callback (tick) {
          done(tick)
        })
      }

      function wamp_pack (pack, sendback) {
        switch (pack.type) {
          case 'remote_call':
            if (typeof clientUriStorage[pack.uri] !== 'undefined') {
              var result
              try {
                result = clientUriStorage[pack.uri].call(socket, pack.args, pack.kwargs, pack)
                if (isPromise(result)) {
                  result
                  .then(function (res) {
                    sendback(makeOk(res, 'wamp_call_ok'))
                  })
                  .catch(function (err) {
                    sendback(makeError('Runtime error', 'wamp_error_runtime'), err)
                  })
                } else {
                  sendback(makeOk(result, 'wamp_call_ok'))
                }
              } catch (e) {
                sendback(makeError('Runtime error', 'wamp_error_runtime'), e)
                throw e
              }
            } else {
              sendback(makeError('Procedure not registred on this client', 'wamp_error_register_remote'))
            }
            break
          case 'remote_publish':
            if (typeof clientUriStorage[pack.uri] !== 'undefined') {
              var result
              try {
                result = clientUriStorage[pack.uri].call(socket, pack.args, pack.kwargs, pack)
                sendback(makeOk(result, 'wamp_publish_ok'))
              } catch (e) {
                sendback(makeError('Runtime error', 'wamp_error_runtime'), e)
                throw e
              }
            } else {
              sendback(makeOk('on client', 'wamp_publish_not_exists'))
            }
            break
          default:

        }
      }

      /**
       * Register a procedure on main socket server
       * @example
       *
       * Usage 1:
       *
       * 	socket.register("my.procedure.name", function(args, kwargs, details){
       * 		var param1Val = args[0], param2Val = args[2]
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
       * 	socket.register("my.procedure.name", function(args, kwargs, details){
       * 		var deferred = q.defer()
       *
       * 		// schedule for the future
       * 		setTimeout(function(){
       * 			deferred.resolve(args[0] + args[1])
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
       * @param  {URI}   procedure – the URI of the procedure to register
       * @param  {Function} endpoint – the function that provides the procedure implementation
       * @param  {object} optional - specifies options for registration (see below)
       * @return {Promise}
       */
      socket.register = function register (procedure, endpoint, options) {
        var dfd = q.defer()

        send({
          type: 'register',
          uri: procedure,
          options: options
        }, function (tick) {
          switch (tick.code) {
            case 'wamp_register_ok':
              clientUriStorage[procedure] = endpoint
              dfd.resolve(tick)
              break
            case 'wamp_error_register':
            default:
              dfd.reject(tick)
          }
        })

        return dfd.promise
      }

      /**
       * Unregister a procedure on main socket server
       * @example
       *
       * Usage:
       *
       * 	socket.unregister("my.procedure.name")
       * 	.then(function(){
       * 		console.log("my.procedure.name was unregistered")
       * 	})
       * 	.catch(function(err){
       * 		console.error("Something was wrong on register", err)
       * 	})
       *
       * @param  {URI}   procedure – the URI of the procedure to register
       * @param  {Function} endpoint – the function that provides the procedure implementation
       * @param  {object} optional - specifies options for registration (see below)
       * @return {Promise}
       */
      socket.unregister = function unregister (procedure) {
        var dfd = q.defer()

        send({
          type: 'unregister',
          uri: procedure
        }, function (tick) {
          switch (tick.code) {
            case 'wamp_unregister_ok':
              delete clientUriStorage[procedure]
              dfd.resolve(tick)
              break
            case 'wamp_error_unregister':
            default:
              dfd.reject(tick)
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
       * @param  {URI} procedure – the URI of the procedure to call
       * @param  {Array} args - optional - call arguments
       * @param  {Object} kwargs – optional - call arguments
       * @param  {Object} options – optional - options for the call (see below)
       * @return {Promise}
       */
      socket.call = function call (procedure, args, kwargs, options) {
        var dfd = q.defer()

        if (!Array.isArray(args)) {
          throw new Error('`args` needs to be an Array in call(procuedure {string}, args {Array}, kwargs {object}, options {object})')
        }

        send({
          type: 'call',
          uri: procedure,
          args: args,
          kwargs: kwargs,
          options: options
        }, function (tick) {
          switch (tick.code) {
            case 'wamp_call_ok':
              // resolve with the remote call results
              dfd.resolve(tick.data)
              break
            case 'wamp_error_runtime':
            default:
              dfd.reject(tick)
          }
        })

        // socket.emit('wamp_call', {procedure: procedure_name, args: args}, function _wamp_call_callback (pack) {
        //   if (!pack || pack.code === 'wamp_call_fail') {
        //     // console.error("SocketWampError", pack)
        //     dfd.reject(new SocketWampError(pack || 'Empty pack from server'))
        //   } else {
        //     dfd.resolve(pack)
        //   }
        // })

        return dfd.promise
      }

      /**
       * Make a call to a procedure on socket server
       * @example
       * Usage:
       * session.publish('com.myapp.hello', ['Hello, world!'])
       *
       * session.publish('com.myapp.hello', [], { text: 'Hello, world' })
       *
       * @param  {URI} topic – the URI of the topic to call
       * @param  {Array} args - optional - application event payload
       * @param  {Object} kwargs – optional - application event payload
       * @param  {Object} options – optional - specifies options for publication (see below)
       * @return {Promise}
       */
      socket.publish = function publish (topic, args, kwargs, options) {
        var dfd = q.defer()

        if (!Array.isArray(args)) {
          throw new Error('`args` needs to be an Array in publish(procuedure {string}, args {Array}, kwargs {object}, options {object})')
        }

        send({
          type: 'publish',
          uri: topic,
          args: args,
          kwargs: kwargs,
          options: options
        }, function (tick) {
          switch (tick.code) {
            case 'wamp_publish_not_exists':
            case 'wamp_publish_ok':
              // resolve with the remote call results
              dfd.resolve(tick.data)
              break
            case 'wamp_error_runtime':
            default:
              dfd.reject(tick)
          }
        })

        return dfd.promise
      }

      /**
       * Register a procedure on main socket server
       * @example
       *
       * Usage 1:
       *
       * 	socket.subscribe("my.topic.name", function(args, kwargs, details){
       * 		var param1Val = args[0], param2Val = args[2]
       * 	})
       * 	.then(function(){
       * 		console.log("my.topic.name is registred")
       * 	})
       * 	.catch(function(err){
       * 		console.error("Something was wrong on register", err)
       * 	})
       *
       * @param  {URI}   topic – the URI of the topic to register
       * @param  {Function} endpoint – the function that provides the topic implementation
       * @param  {object} optional - specifies options for registration (see below)
       * @return {Promise}
       */
      socket.subscribe = function subscribe (topic, endpoint, options) {
        var dfd = q.defer()

        send({
          type: 'subscribe',
          uri: topic,
          options: options
        }, function (tick) {
          switch (tick.code) {
            case 'wamp_subscribe_ok':
              clientUriStorage[topic] = endpoint
              dfd.resolve(tick)
              break
            case 'wamp_error_subscribe':
            default:
              dfd.reject(tick)
          }
        })

        return dfd.promise
      }
    }

    /**
     * Easy create WAMP response object
     * @param  {String} data
     * @param  {String} code
     * @return {Object}
     */
    function makeOk (data, code) {
      return {
        code: code,
        data: data
      }
    }

    /**
     * Easy create an Error object
     * @param  {String} msg  - error message
     * @param  {String} code - code for wamp client or server decode
     * @param  {Object | Array | String} details - details about the error like Exception native object
     * @return {Error} - return a native object Error instance
     */
    function makeError (msg, code, details) {
      var err = new Error(msg)
      err.message = msg
      err.code = code
      if (typeof details !== 'undefined') {
        err.details = details
      }
      return err
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
    g.wampInterface = _export_socket_wamp
    if (typeof g.io === 'function') {
      // _export_socket_wamp()
    } else {
      console.error('Socket.io client is not present')
    }
  }
})()
