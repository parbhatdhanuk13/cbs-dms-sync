const { EventEmitter } = require("events");
const Transport = require("winston-transport");

const logBus = new EventEmitter();
logBus.setMaxListeners(100);

class StreamTransport extends Transport {
  log(info, callback) {
    setImmediate(() => this.emit("logged", info));
    logBus.emit("log", {
      level: info.level,
      message: info.message,
      timestamp: info.timestamp || new Date().toISOString(),
      ...info,
    });
    callback();
  }
}

module.exports = { logBus, StreamTransport };