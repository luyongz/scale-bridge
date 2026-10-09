'use strict';

const WebSocket = require('ws');

/**
 * WebSocket 推送：连接后只推重量纯文本字符串
 */
class WeightWsServer {
  constructor() {
    this._wss = null;
    this._clients = new Set();
  }

  /**
   * @param {string} host
   * @param {number} port
   */
  start(host, port) {
    if (this._wss) this.stop();
    this._wss = new WebSocket.Server({ host: host || '127.0.0.1', port: port || 5122 });
    this._wss.on('connection', (ws) => {
      this._clients.add(ws);
      ws.on('close', () => this._clients.delete(ws));
      ws.on('error', () => this._clients.delete(ws));
      // 忽略客户端消息（可选写串口未实现）
      ws.on('message', () => {});
    });
    this._wss.on('error', (err) => {
      // 由 Runtime 监听外部需要时可再包一层；此处打日志即可
      console.error('[ws]', err.message);
    });
  }

  stop() {
    if (!this._wss) return;
    for (const ws of this._clients) {
      try {
        ws.close();
      } catch (e) {
        /* ignore */
      }
    }
    this._clients.clear();
    try {
      this._wss.close();
    } catch (e) {
      /* ignore */
    }
    this._wss = null;
  }

  get clientCount() {
    return this._clients.size;
  }

  /** 向所有客户端推送重量字符串 */
  broadcast(weightText) {
    const msg = String(weightText);
    for (const ws of this._clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(msg);
        } catch (e) {
          /* ignore */
        }
      }
    }
  }
}

module.exports = { WeightWsServer };
