'use strict';

const os = require('os');

/**
 * 规范化 MAC：去分隔符、转大写；已是 12 位十六进制则按 XX:XX:... 格式化
 * @param {string} raw
 * @returns {string|null}
 */
function normalizeMac(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const hex = raw.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length !== 12) return null;
  return hex.match(/.{2}/g).join(':');
}

/**
 * 判断是否更可能是「有线 / 非内部」网卡（优先选作 selectedMac）
 */
function isPreferredIface(name, addr) {
  const n = (name || '').toLowerCase();
  // 跳过回环、docker、虚拟桥、VPN 等常见内部口
  if (
    n === 'lo' ||
    n.startsWith('docker') ||
    n.startsWith('br-') ||
    n.startsWith('veth') ||
    n.startsWith('virbr') ||
    n.startsWith('vmnet') ||
    n.startsWith('vbox') ||
    n.startsWith('tun') ||
    n.startsWith('tap') ||
    n.startsWith('wg') ||
    n.includes('bluetooth')
  ) {
    return false;
  }
  if (addr.internal) return false;
  // Windows 常见有线名 / Linux eth* en*；无线 wlan/wi-fi 次优但仍可用
  return true;
}

/**
 * 枚举本机 MAC，返回去重规范化列表；preferred 优先有线/非内部
 * @returns {{ macs: string[], preferred: string|null }}
 */
function listMacs() {
  const ifaces = os.networkInterfaces();
  const seen = new Set();
  const preferred = [];
  const others = [];

  for (const [name, addrs] of Object.entries(ifaces || {})) {
    if (!addrs) continue;
    for (const addr of addrs) {
      const mac = normalizeMac(addr.mac);
      if (!mac || mac === '00:00:00:00:00:00') continue;
      if (seen.has(mac)) continue;
      seen.add(mac);
      if (isPreferredIface(name, addr)) {
        preferred.push(mac);
      } else {
        others.push(mac);
      }
    }
  }

  const macs = preferred.concat(others);
  return { macs, preferred: macs[0] || null };
}

module.exports = { normalizeMac, listMacs };
