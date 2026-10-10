'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { normalizeMac } = require('./identity');

/**
 * 将 WMS getScaleBridgeProfileByMac 的 data 映射为桥接 Profile
 * protocolJson（字符串）→ protocol（对象）
 * @param {object} data
 * @returns {object}
 */
function mapWmsDataToProfile(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('WMS data 为空或不是对象');
  }
  const profile = Object.assign({}, data);
  if (profile.protocol && typeof profile.protocol === 'object') {
    // 已有对象则优先用
  } else if (typeof profile.protocolJson === 'string' && profile.protocolJson.trim()) {
    try {
      profile.protocol = JSON.parse(profile.protocolJson);
    } catch (e) {
      throw new Error('protocolJson 解析失败: ' + (e.message || e));
    }
  }
  delete profile.protocolJson;
  return profile;
}

/**
 * 用 selectedMac 请求可配的 WMS 接口，解析 {status,data,message}
 * @param {object} opts
 * @param {string} opts.url - wmsProfileUrl（完整接口地址，不含 mac 查询串亦可）
 * @param {string} [opts.method='GET']
 * @param {string} [opts.macQueryParam='mac']
 * @param {string} opts.mac - 本机 MAC；请求 WMS 时统一为带冒号大写（如 D8:80:83:71:EC:85），与 /identity selectedMac 一致
 * @param {number} [opts.timeoutMs=8000]
 * @returns {Promise<object>} Profile
 */
function fetchProfileFromWms(opts) {
  const urlStr = (opts && opts.url) || '';
  if (!urlStr || typeof urlStr !== 'string' || !urlStr.trim()) {
    return Promise.reject(new Error('未配置 wmsProfileUrl'));
  }
  const mac = normalizeMac(opts.mac) || (opts.mac && String(opts.mac).trim()) || null;
  if (!mac) return Promise.reject(new Error('缺少 mac'));
  // 向 WMS 传参必须带冒号大写（与 identity.selectedMac 一致）；禁止无冒号形式

  const method = ((opts.method || 'GET') + '').toUpperCase();
  const macParam = opts.macQueryParam || 'mac';
  const timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : 8000;

  let u;
  try {
    u = new URL(urlStr.trim());
  } catch (e) {
    return Promise.reject(new Error('wmsProfileUrl 无效: ' + urlStr));
  }
  u.searchParams.set(macParam, mac);

  const lib = u.protocol === 'https:' ? https : http;
  const bodyForPost =
    method === 'POST' || method === 'PUT'
      ? JSON.stringify({ [macParam]: mac })
      : null;

  return new Promise((resolve, reject) => {
    const reqOpts = {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: method === 'POST' || method === 'PUT' ? method : 'GET',
      headers: {
        Accept: 'application/json',
      },
      timeout: timeoutMs,
    };
    if (bodyForPost) {
      reqOpts.headers['Content-Type'] = 'application/json';
      reqOpts.headers['Content-Length'] = Buffer.byteLength(bodyForPost);
    }

    const req = lib.request(reqOpts, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > 2 * 1024 * 1024) {
          req.destroy();
          reject(new Error('WMS 回参过大'));
        } else {
          chunks.push(c);
        }
      });
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch (e) {
          reject(new Error('WMS 回参非 JSON: ' + (e.message || e)));
          return;
        }
        if (!parsed || typeof parsed !== 'object') {
          reject(new Error('WMS 回参格式无效'));
          return;
        }
        if (parsed.status != null && Number(parsed.status) !== 0) {
          reject(
            new Error(
              'WMS status=' +
                parsed.status +
                (parsed.message ? ': ' + parsed.message : '')
            )
          );
          return;
        }
        if (!parsed.data) {
          reject(new Error(parsed.message || 'WMS data 为空'));
          return;
        }
        try {
          resolve(mapWmsDataToProfile(parsed.data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求 WMS 超时'));
    });
    req.on('error', (e) => reject(new Error('请求 WMS 失败: ' + (e.message || e))));
    if (bodyForPost) req.write(bodyForPost);
    req.end();
  });
}

module.exports = { fetchProfileFromWms, mapWmsDataToProfile };
