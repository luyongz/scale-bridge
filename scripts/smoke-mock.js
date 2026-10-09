'use strict';

/**
 * 无串口冒烟：起桥接 → 调 identity/status → 设内存 profile → 注入假帧 → WS 收重量
 */
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const defaults = require(path.join(ROOT, 'src', 'defaults.json'));

process.chdir(ROOT);
process.env.SCALE_BRIDGE_EXPOSE = '1';

// 先加载 Runtime，再手动 start（不走 index 的进程常驻逻辑更易控）
const { Runtime } = require(path.join(ROOT, 'src', 'runtime'));

function get(urlPath) {
  return new Promise((resolve, reject) => {
    const opts = {
      host: defaults.controlHost,
      port: defaults.controlPort,
      path: urlPath,
      method: 'GET',
    };
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function post(urlPath, obj) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(obj);
    const opts = {
      host: defaults.controlHost,
      port: defaults.controlPort,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const rt = new Runtime(defaults);
  rt.start();

  // 等监听就绪
  await new Promise((r) => setTimeout(r, 200));

  const id = await get(defaults.paths.identity);
  console.log('[smoke] identity', id.status, JSON.stringify(id.body));

  const st0 = await get(defaults.paths.status);
  console.log('[smoke] status(before)', st0.status, JSON.stringify(st0.body));

  // 不真正开串口：只写入 profile 内存，然后 injectFrame
  rt.profile = {
    mac: id.body.selectedMac || 'AA:BB:CC:DD:EE:FF',
    name: 'mock',
    enabled: true,
    portName: 'COM_MOCK',
    baudRate: 9600,
    protocolId: 'cr-slice',
    protocol: { start: 0, end: 8, rate: 1 },
    version: 'smoke-1',
  };
  rt.running = false; // 未真正开串口

  const received = [];
  const wsUrl = 'ws://' + defaults.wsHost + ':' + defaults.wsPort;
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  ws.on('message', (data) => {
    received.push(String(data));
    console.log('[smoke] ws recv:', String(data));
  });

  // 注入帧：模拟 "0012.50\r" 一类
  rt.injectMockFrame('0012.50');
  await new Promise((r) => setTimeout(r, 300));

  const st1 = await get(defaults.paths.status);
  console.log('[smoke] status(after)', st1.status, JSON.stringify(st1.body));

  // trial-read 预期在无 serialport 时返回明确错误
  const trial = await post(defaults.paths.trialRead, {
    portName: 'COM99',
    protocolId: 'cr-slice',
    protocol: { rate: 1 },
  });
  console.log('[smoke] trial-read', trial.status, JSON.stringify(trial.body));

  ws.close();
  rt.stop();

  if (!received.length) {
    console.error('[smoke] FAIL: 未收到 WS 重量');
    process.exit(1);
  }
  console.log('[smoke] OK');
  process.exit(0);
}

main().catch((e) => {
  console.error('[smoke] ERROR', e);
  process.exit(1);
});
