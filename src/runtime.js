'use strict';

const fs = require('fs');
const path = require('path');
const { listMacs, normalizeMac } = require('./identity');
const { SerialBridge } = require('./serial');
const { parseWeight, resolveDelimiter, knownProtocol } = require('./protocol');
const { WeightWsServer } = require('./transportWs');
const { ControlHttp } = require('./controlHttp');

const LAST_PROFILE_PATH = path.join(__dirname, 'last-profile.json');

/**
 * 组装启停、热 reload、状态
 */
class Runtime {
  /**
   * @param {object} defaults defaults.json
   */
  constructor(defaults) {
    this.defaults = defaults || {};
    this.paths = Object.assign({}, (defaults && defaults.paths) || {});
    this.profile = null;
    this.lastWeight = null;
    this.lastError = null;
    this.running = false; // 有有效 profile 且试图跑串口

    this.serial = new SerialBridge();
    this.ws = new WeightWsServer();
    this.http = new ControlHttp({
      getPaths: () => this.paths,
      onIdentity: () => this.getIdentity(),
      onStatus: () => this.getStatus(),
      onReload: (body) => this.reload(body),
      onTrialRead: (body) => this.trialRead(body),
    });

    this.serial.on('frame', (frame) => this._onFrame(frame));
    this.serial.on('error', (err) => {
      this.lastError = err.message || String(err);
      console.error('[serial]', this.lastError);
    });
  }

  async start() {
    const d = this.defaults;
    this.ws.start(d.wsHost || '127.0.0.1', d.wsPort || 5122);
    this.http.start(d.controlHost || '127.0.0.1', d.controlPort || 5123);
    console.log(
      '[scale-bridge] WS ws://%s:%s  HTTP http://%s:%s',
      d.wsHost || '127.0.0.1',
      d.wsPort || 5122,
      d.controlHost || '127.0.0.1',
      d.controlPort || 5123
    );
    if (!this.serial.available) {
      console.warn(
        '[scale-bridge] serialport 不可用，串口功能降级。HTTP/WS 仍可工作。',
        this.serial.loadError ? this.serial.loadError.message : ''
      );
    }
    await this._restoreLastProfile();
  }

  /**
   * 成功 reload 后持久化当前 Profile（含 enabled:false）
   */
  _saveLastProfile() {
    if (!this.profile) return;
    try {
      fs.writeFileSync(LAST_PROFILE_PATH, JSON.stringify(this.profile, null, 2), 'utf8');
      console.log('[scale-bridge] 已保存 last-profile');
    } catch (e) {
      console.warn('[scale-bridge] 保存 last-profile 失败:', e.message || e);
    }
  }

  /**
   * 启动时若存在上次 Profile 则等价 reload；读失败/坏 JSON 忽略
   */
  async _restoreLastProfile() {
    let raw;
    try {
      if (!fs.existsSync(LAST_PROFILE_PATH)) return;
      raw = fs.readFileSync(LAST_PROFILE_PATH, 'utf8');
    } catch (e) {
      console.warn('[scale-bridge] 读取 last-profile 失败，已忽略:', e.message || e);
      return;
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch (e) {
      console.warn('[scale-bridge] last-profile JSON 无效，已忽略:', e.message || e);
      return;
    }
    console.log('[scale-bridge] 发现 last-profile，自动 reload…');
    try {
      const result = await this.reload(body);
      if (result && result.ok) {
        console.log('[scale-bridge] last-profile 已恢复');
      } else {
        console.warn(
          '[scale-bridge] last-profile 恢复失败:',
          (result && result.message) || 'unknown'
        );
      }
    } catch (e) {
      console.warn('[scale-bridge] last-profile 恢复异常，已忽略:', e.message || e);
    }
  }

  stop() {
    this.serial.closeSync();
    this.ws.stop();
    this.http.stop();
    this.running = false;
  }

  getIdentity() {
    const { macs, preferred } = listMacs();
    let selectedMac = preferred;
    if (this.profile && this.profile.mac) {
      selectedMac = normalizeMac(this.profile.mac) || this.profile.mac;
    }
    return { selectedMac, macs };
  }

  getStatus() {
    return {
      running: this.running,
      serialOpen: this.serial.isOpen,
      wsClients: this.ws.clientCount,
      mac: this.profile && this.profile.mac ? this.profile.mac : null,
      profileVersion: this.profile && this.profile.version != null ? this.profile.version : null,
      lastWeight: this.lastWeight,
      lastError: this.lastError,
    };
  }

  /**
   * 校验 Profile
   * @returns {string|null} 错误信息
   */
  _validateProfile(p) {
    if (!p || typeof p !== 'object') return 'profile 必须为 JSON 对象';
    if (!p.portName) return '缺少 portName';
    if (!p.protocolId) return '缺少 protocolId';
    if (!knownProtocol(p.protocolId)) {
      return '未知 protocolId: ' + p.protocolId + '（支持 cr-slice / cr-regex / eq-reverse）';
    }
    return null;
  }

  /**
   * 从 profile 或独立配置更新 paths（defaults + 内存覆盖）
   */
  _applyPathsFromProfile(p) {
    if (!p) return;
    // 允许 profile.paths 覆盖控制面路径
    if (p.paths && typeof p.paths === 'object') {
      this.paths = Object.assign({}, this.defaults.paths || {}, this.paths, p.paths);
    }
    // controlBaseUrl 仅记录
    if (p.controlBaseUrl) {
      if (!this.profile) this.profile = {};
      // 实际在 reload 赋值后记录
    }
  }

  async reload(body) {
    const err = this._validateProfile(body);
    if (err) return { ok: false, message: err };

    this._applyPathsFromProfile(body);
    this.profile = Object.assign({}, body);
    if (body.mac) {
      this.profile.mac = normalizeMac(body.mac) || body.mac;
    }
    this.lastError = null;

    if (body.enabled === false) {
      await this.serial.close();
      this.running = false;
      this._saveLastProfile();
      return { ok: true };
    }

    const protocol = body.protocol || {};
    const delimiter = resolveDelimiter(body.protocolId, protocol);
    try {
      await this.serial.close();
      await this.serial.open({
        portName: body.portName,
        baudRate: body.baudRate || 9600,
        dataBits: body.dataBits || 8,
        parity: body.parity || 'none',
        stopBits: body.stopBits || 1,
        delimiter,
      });
      this.running = true;
      this.lastError = null;
      this._saveLastProfile();
      return { ok: true };
    } catch (e) {
      this.running = false;
      this.lastError = e.message || String(e);
      // 无串口环境：不崩溃，返回明确错误
      return { ok: false, message: this.lastError };
    }
  }

  _onFrame(frame) {
    if (!this.profile) return;
    const protocol = this.profile.protocol || {};
    const w = parseWeight(this.profile.protocolId, frame, protocol);
    if (w == null) return;
    this.lastWeight = w;
    this.ws.broadcast(String(w));
  }

  /**
   * 试验读：草稿可不保存为当前 profile
   */
  async trialRead(body) {
    const err = this._validateProfile(body);
    if (err) return { ok: false, samples: [], message: err };

    const protocol = body.protocol || {};
    const delimiter = resolveDelimiter(body.protocolId, protocol);
    try {
      const frames = await this.serial.readSamples({
        portName: body.portName,
        baudRate: body.baudRate || 9600,
        dataBits: body.dataBits || 8,
        parity: body.parity || 'none',
        stopBits: body.stopBits || 1,
        delimiter,
        timeoutMs: body.timeoutMs != null ? body.timeoutMs : 2000,
        maxFrames: body.maxFrames != null ? body.maxFrames : 5,
      });
      const samples = frames.map((raw) => {
        const weight = parseWeight(body.protocolId, raw, protocol);
        return { raw, weight };
      });
      // 若 trial 关掉了口，且当前有 running profile，尝试恢复
      if (this.running && this.profile && this.profile.enabled !== false) {
        try {
          const p = this.profile;
          const d = resolveDelimiter(p.protocolId, p.protocol || {});
          if (!this.serial.isOpen) {
            await this.serial.open({
              portName: p.portName,
              baudRate: p.baudRate || 9600,
              dataBits: p.dataBits || 8,
              parity: p.parity || 'none',
              stopBits: p.stopBits || 1,
              delimiter: d,
            });
          }
        } catch (e) {
          this.lastError = e.message || String(e);
        }
      }
      return { ok: true, samples, message: samples.length ? 'ok' : 'timeout, no frames' };
    } catch (e) {
      return { ok: false, samples: [], message: e.message || String(e) };
    }
  }

  /** 冒烟：注入一帧并按当前协议解析推送（无串口时） */
  injectMockFrame(frame) {
    this.serial.injectFrame(frame);
  }
}

module.exports = { Runtime };
