/**
 *      Lgtv2 - Simple Node.js module to remote control LG WebOS smart TVs
 *
 *      MIT (c) Sebastian Raff <hq@ccu.io> (https://github.com/hobbyquaker)
 *      this is a fork of https://github.com/msloth/lgtv.js, heavily modified and rewritten to suite my needs.
 *
 */

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var WebSocketClient = require('websocket').client;
var createPairingPayload = require('./pairing-payload').createPairingPayload;
var requestState = require('./request-state');
var CallbackRegistry = requestState.CallbackRegistry;
var createCorrelationIdFactory = requestState.createCorrelationIdFactory;
var ReconnectState = require('./reconnect-state');
var specializedSocket = require('./specialized-socket');
var SpecializedSocket = specializedSocket.SpecializedSocket;
var SpecializedSocketPool = specializedSocket.SpecializedSocketPool;
// var ppath = require('persist-path');
// var mkdirp = require('mkdirp');

var LGTV = function (config) {
  if (!(this instanceof LGTV)) {
    return new LGTV(config);
  }
  var that = this;

  config = config || {};
  config.url = config.url || 'ws://lgwebostv:3000';
  config.timeout = config.timeout || 15000;
  config.registrationTimeout = config.registrationTimeout || 60000;
  config.reconnect = typeof config.reconnect === 'undefined' ? 5000 : config.reconnect;
  that.clientKey = config.clientKey || null;

  that.saveKey = config.saveKey || function (key, cb) {
    that.clientKey = key;
    cb(null);
  };

  var client = new WebSocketClient();
  var connection = {};
  var isPaired = false;
  var reconnectState = new ReconnectState(config.reconnect);
  var startupTimer = null;

  var specializedSocketPool = new SpecializedSocketPool(config.timeout);

  var cidPrefix = ('0000000' + (Math.floor(Math.random() * 0xFFFFFFFF).toString(16))).slice(-8);
  var getCid = createCorrelationIdFactory(cidPrefix);
  var callbackRegistry = new CallbackRegistry();

  var pairingTemplate = require('./pairing.json');

  var lastError;

  client.on('connectFailed', function (error) {
    reconnectState.connectionSettled();
    if (lastError !== error.toString()) {
      that.emit('error', error);
    }
    lastError = error.toString();

	switch (error.code) {
		case 'ECONNRESET':
			config.newurl = new URL(config.url);
			config.newurl.port = (config.newurl.port === '3000') ? '3001' : '3000';
			config.newurl.protocol = (config.newurl.protocol === 'ws:') ? 'wss:' : 'ws:';
			config.url = config.newurl.href;
			delete config.newurl;
			break;
		default:
			break;
	}

    reconnectState.schedule(function () {
      that.connect(config.url);
    });
  });

  client.on('connect', function (conn) {
    if (reconnectState.stopped) {
      conn.close();
      return;
    }
    reconnectState.connected();
    connection = conn;

    connection.on('error', function (error) {
      that.emit('error', error);
    });

    connection.on('close', function (e) {
      connection = {};
      callbackRegistry.failAll(new Error('connection closed'));

      that.emit('close', e);
      reconnectState.schedule(function () {
        that.connect(config.url);
      });
    });

    connection.on('message', function (message) {
      var parsedMessage;
      if (message.type === 'utf8') {
        if (message.utf8Data) {
          try {
            parsedMessage = JSON.parse(message.utf8Data);
          } catch (err) {
            that.emit('error', new Error('JSON parse error ' + message.utf8Data));
          }
        }
        if (parsedMessage) {
          if (parsedMessage.payload && parsedMessage.payload.subscribed) {
            // Set changed array on first response to subscription
            if (typeof parsedMessage.payload.muted !== 'undefined') {
              if (parsedMessage.payload.changed) {
                parsedMessage.payload.changed.push('muted');
              } else {
                parsedMessage.payload.changed = ['muted'];
              }
            }
            if (typeof parsedMessage.payload.volume !== 'undefined') {
              if (parsedMessage.payload.changed) {
                parsedMessage.payload.changed.push('volume');
              } else {
                parsedMessage.payload.changed = ['volume'];
              }
            }
          }
          callbackRegistry.dispatch(parsedMessage.id, null, parsedMessage.payload);
        }
      } else {
        that.emit('error', new Error('received non utf8 message ' + message.toString()));
      }
    });

    isPaired = false;

    that.register();
  });

  this.register = function () {
    var pairing = createPairingPayload(pairingTemplate, that.clientKey);

    that.send('register', undefined, pairing, function (err, res) {
      if (!err && res) {
        if (res['client-key']) {
          that.clientKey = res['client-key'];
          that.saveKey(res['client-key'], function (err) {
            if (err) {
              that.emit('error', err);
              return;
            }
            isPaired = true;
            that.emit('connect');
          });
        } else {
          that.emit('prompt');
        }
      } else {
        that.emit('error', err);
      }
    });
  };

  this.request = function (uri, payload, cb) {
    this.send('request', uri, payload, cb);
  };

  this.subscribe = function (uri, payload, cb) {
    this.send('subscribe', uri, payload, cb);
  };

  this.send = function (type, uri, /* optional */ payload, /* optional */ cb) {
    if (typeof payload === 'function') {
      cb = payload;
      payload = {};
    }

    if (!connection.connected) {
      if (typeof cb === 'function') {
        cb(new Error('not connected'));
      }
      return;
    }

    var cid = getCid();

    var json = JSON.stringify({
      id: cid,
      type: type,
      uri: uri,
      payload: payload
    });

    if (typeof cb === 'function') {
      switch (type) {
        case 'request':
          callbackRegistry.addOneShot(cid, cb, config.timeout, 'request');
          break;

        case 'subscribe':
          callbackRegistry.addPersistent(cid, cb);
          break;

        case 'register':
          callbackRegistry.addUntil(
            cid,
            cb,
            config.registrationTimeout,
            'registration',
            function (err, res) {
              return Boolean(err || (res && res['client-key']));
            }
          );
          break;
        default:
          throw new Error('unknown type');
      }
    }
    try {
      connection.send(json);
    } catch (error) {
      callbackRegistry.remove(cid);
      if (typeof cb === 'function') {
        cb(error);
      }
    }
  };

  this.getSocket = function (url, cb) {
    specializedSocketPool.acquire(url, function (complete) {
      that.request(url, function (err, data) {
        if (err) {
          complete(err);
          return;
        }
        if (!data || typeof data.socketPath !== 'string' || data.socketPath.length === 0) {
          complete(new Error('invalid specialized socket path'));
          return;
        }

        var special = new WebSocketClient();
        special
          .on('connect', function (conn) {
            var socket = new SpecializedSocket(conn, function () {
              specializedSocketPool.remove(url, socket);
            });
            conn
              .on('error', function (error) {
                that.emit('error', error);
              })
              .on('close', function () {
                socket.markClosed();
              });

            if (!complete(null, socket)) {
              socket.close();
            }
          })
          .on('connectFailed', function (error) {
            complete(error);
            that.emit('error', error);
          });

        try {
          special.connect(data.socketPath, null, null, null, {rejectUnauthorized: false});
        } catch (error) {
          complete(error);
        }
      });
    }).then(
      socket => cb(null, socket),
      error => cb(error),
    );
  };

  /**
   *      Connect to TV using a websocket url (eg "ws://192.168.0.100:3000")
   *
   */
  this.connect = function (host) {
    reconnectState.start();

    if (connection.connected && !isPaired) {
      that.register();
    } else if (!connection.connected && reconnectState.beginConnection()) {
      that.emit('connecting', host);
      connection = {};
      try {
        client.connect(host, null, null, null, { rejectUnauthorized: false });
      } catch (error) {
        reconnectState.connectionSettled();
        that.emit('error', error);
        reconnectState.schedule(function () {
          that.connect(config.url);
        });
      }
    }
  };

  this.disconnect = function () {
    reconnectState.stop();
    if (startupTimer) {
      clearTimeout(startupTimer);
      startupTimer = null;
    }
    if (connection && connection.close) {
      connection.close();
    }

    specializedSocketPool.closeAll(new Error('client disconnected'));
  };

  startupTimer = setTimeout(function () {
    startupTimer = null;
    if (!reconnectState.stopped) {
      that.connect(config.url);
    }
  }, 0);
};

util.inherits(LGTV, EventEmitter);

module.exports = LGTV;
