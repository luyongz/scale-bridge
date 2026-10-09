'use strict';

const http = require('http');

/**
 * HTTP 控制面：identity / status / reload / trial-read；CORS *
 */
class ControlHttp {
  constructor(handlers) {
    this._handlers = handlers; // { getPaths, onIdentity, onStatus, onReload, onTrialRead }
    this._server = null;
  }

  /**
   * @param {string} host
   * @param {number} port
   */
  start(host, port) {
    if (this._server) this.stop();
    this._server = http.createServer((req, res) => this._onRequest(req, res));
    this._server.listen(port, host || '127.0.0.1');
    this._server.on('error', (err) => {
      console.error('[http]', err.message);
    });
  }

  stop() {
    if (!this._server) return;
    try {
      this._server.close();
    } catch (e) {
      /* ignore */
    }
    this._server = null;
  }

  _cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  _json(res, code, obj) {
    this._cors(res);
    const body = JSON.stringify(obj);
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  }

  _readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > 1024 * 1024) {
          reject(new Error('body too large'));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw) return resolve(null);
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error('invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  async _onRequest(req, res) {
    this._cors(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const paths = this._handlers.getPaths();
    let urlPath = req.url || '/';
    const q = urlPath.indexOf('?');
    if (q >= 0) urlPath = urlPath.slice(0, q);

    try {
      if (req.method === 'GET' && urlPath === paths.identity) {
        return this._json(res, 200, this._handlers.onIdentity());
      }
      if (req.method === 'GET' && urlPath === paths.status) {
        return this._json(res, 200, this._handlers.onStatus());
      }
      if (req.method === 'POST' && urlPath === paths.reload) {
        const body = await this._readBody(req);
        const result = await this._handlers.onReload(body);
        return this._json(res, result.ok ? 200 : 400, result);
      }
      if (req.method === 'POST' && urlPath === paths.trialRead) {
        const body = await this._readBody(req);
        const result = await this._handlers.onTrialRead(body);
        return this._json(res, result.ok ? 200 : 400, result);
      }
      this._json(res, 404, { ok: false, message: 'not found' });
    } catch (e) {
      this._json(res, 500, { ok: false, message: e.message || String(e) });
    }
  }
}

module.exports = { ControlHttp };
