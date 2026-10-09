'use strict';

const EventEmitter = require('events');

let SerialPort = null;
let serialLoadError = null;
try {
  // serialport@12+: named export { SerialPort }
  const mod = require('serialport');
  SerialPort = mod.SerialPort || mod;
} catch (e) {
  serialLoadError = e;
  SerialPort = null;
}

/**
 * 串口封装：开/关、按 delimiter 切帧、emit('frame', string)
 */
class SerialBridge extends EventEmitter {
  constructor() {
    super();
    this._port = null;
    this._buf = Buffer.alloc(0);
    this._delimiter = Buffer.from('\r');
    this._opts = null;
  }

  get isOpen() {
    return !!(this._port && this._port.isOpen);
  }

  get available() {
    return !!SerialPort;
  }

  get loadError() {
    return serialLoadError;
  }

  open(opts) {
    return new Promise((resolve, reject) => {
      if (!SerialPort) {
        const msg =
          'serialport 模块不可用（原生编译失败或未安装）。' +
          (serialLoadError ? ' 原因: ' + serialLoadError.message : '');
        return reject(new Error(msg));
      }
      this.closeSync();
      this._opts = opts;
      const delim = opts.delimiter;
      if (Buffer.isBuffer(delim)) {
        this._delimiter = delim;
      } else if (typeof delim === 'string') {
        this._delimiter = Buffer.from(delim, 'utf8');
      } else if (typeof delim === 'number') {
        this._delimiter = Buffer.from([delim]);
      } else {
        this._delimiter = Buffer.from('\r');
      }
      this._buf = Buffer.alloc(0);

      const port = new SerialPort({
        path: opts.portName,
        baudRate: opts.baudRate || 9600,
        dataBits: opts.dataBits || 8,
        parity: opts.parity || 'none',
        stopBits: opts.stopBits || 1,
        autoOpen: false,
      });

      port.on('error', (err) => {
        this.emit('error', err);
      });

      port.on('data', (chunk) => {
        this._onData(chunk);
      });

      port.on('close', () => {
        this.emit('close');
      });

      port.open((err) => {
        if (err) {
          this._port = null;
          return reject(err);
        }
        this._port = port;
        resolve();
      });
    });
  }

  _onData(chunk) {
    this._buf = Buffer.concat([this._buf, chunk]);
    const d = this._delimiter;
    if (!d.length) return;
    let idx;
    while ((idx = this._buf.indexOf(d)) !== -1) {
      const frameBuf = this._buf.slice(0, idx);
      this._buf = this._buf.slice(idx + d.length);
      this.emit('frame', frameBuf.toString('utf8'));
    }
    if (this._buf.length > 64 * 1024) {
      this._buf = this._buf.slice(-1024);
    }
  }

  closeSync() {
    if (this._port) {
      try {
        if (this._port.isOpen) this._port.close();
      } catch (e) {
        /* ignore */
      }
      this._port.removeAllListeners();
      this._port = null;
    }
    this._buf = Buffer.alloc(0);
  }

  close() {
    return new Promise((resolve) => {
      if (!this._port) return resolve();
      const p = this._port;
      this._port = null;
      this._buf = Buffer.alloc(0);
      if (!p.isOpen) {
        p.removeAllListeners();
        return resolve();
      }
      p.close(() => {
        p.removeAllListeners();
        resolve();
      });
    });
  }

  injectFrame(frame) {
    this.emit('frame', String(frame));
  }

  async readSamples(opts) {
    const timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : 2000;
    const maxFrames = opts.maxFrames != null ? opts.maxFrames : 5;
    const reuse =
      this.isOpen && this._opts && this._opts.portName === opts.portName;

    let openedHere = false;
    if (!reuse) {
      await this.open(opts);
      openedHere = true;
    }

    return new Promise((resolve, reject) => {
      const samples = [];
      let done = false;
      const onFrame = (f) => {
        samples.push(f);
        if (samples.length >= maxFrames) finish();
      };
      const timer = setTimeout(() => finish(), timeoutMs);
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.removeListener('frame', onFrame);
        const cleanup = openedHere ? this.close() : Promise.resolve();
        cleanup.then(() => resolve(samples)).catch(reject);
      };
      this.on('frame', onFrame);
    });
  }
}

module.exports = { SerialBridge };
