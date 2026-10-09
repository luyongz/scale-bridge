'use strict';

const path = require('path');
const fs = require('fs');
const { Runtime } = require('./runtime');

function loadDefaults() {
  const p = path.join(__dirname, 'defaults.json');
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const defaults = loadDefaults();
  const runtime = new Runtime(defaults);
  await runtime.start();

  // 便于冒烟脚本：挂到 global（仅开发）
  if (process.env.SCALE_BRIDGE_EXPOSE === '1') {
    global.__scaleBridgeRuntime = runtime;
  }

  const shutdown = () => {
    try {
      runtime.stop();
    } catch (e) {
      /* ignore */
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error('[scale-bridge] 启动失败:', e.message || e);
  process.exit(1);
});
