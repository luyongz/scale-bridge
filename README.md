# scale-bridge 称重串口桥接

把电子秤串口数据解析为重量，经 **WebSocket** 推给本机装箱页；通过 **HTTP 控制面** 热下发 Profile（reload），无业务 UI。

技术栈：纯 **Node.js**，依赖 `serialport`、`ws`、内置 `http`，便于日后打成 Windows exe（Win7～Win11 x64）。**不用 Electron**。现场 Node / serialport 版本以 `package.json` 与真机验证为准。

## 功能

- 枚举本机 MAC（identity），供 WMS/装箱页按 MAC 绑定秤配置
- 按 Profile 打开串口，按 `protocolId` 切帧解析重量
- WS 默认 `ws://127.0.0.1:5122`：连接后只推**纯文本重量**字符串
- HTTP 默认 `http://127.0.0.1:5123`：`/identity` `/status` `/reload` `/trial-read`（路径可经 defaults 或 reload 覆盖）
- 无 Profile 时仍监听 WS + HTTP；status 显示未配置（`running: false`）
- `serialport` 若在 Linux/无串口机上编译失败，进程仍可启动（HTTP/WS 可用）；开串口需在 Windows 真机安装成功

## Windows 启动器

源码：`launcher/StatusForm.cs` → 发布产物 `dist/ScaleBridge/电子秤服务.exe`（副本 `ScaleBridge.exe`）。

- 状态窗标题「电子秤服务」：MAC / 串口 / WS 客户端 / 重量 / 错误
- 配置区可改页面请求地址、四条 HTTP 路径、网页接收重量地址/端口；「保存并重启服务」写入同目录 `src/defaults.json` 后杀旧 node 再拉起
- 编译说明见 `launcher/README.md`；现场用法见 `使用说明.md`

## 开发启动

在源码根目录：

```bash
npm install
npm start
```

环境变量 `SCALE_BRIDGE_EXPOSE=1` 时会把 Runtime 挂到 `global.__scaleBridgeRuntime`（冒烟用）。

无串口冒烟：

```bash
npm run smoke-mock
```

## 与 WMS / 装箱页配合

1. 装箱页（或代理）请求 `GET http://127.0.0.1:5123/identity` 拿到 `selectedMac` / `macs`
2. 用 MAC 向 WMS 调 `getScaleBridgeProfileByMac` 取秤 Profile
3. 将返回 `data` 映射为 Profile（`protocolJson` → `protocol` 对象）后 `POST .../reload`
4. 页面连接 `ws://127.0.0.1:5122`，收重量字符串并展示/落单

配置主数据在 WMS 表 `wms_scale_bridge_profile`；装箱页经 customizedScreenManager 维护；桥接不直连 WMS。  
**表结构 DDL、get/save 回参、与 reload 字段映射**见 [`使用说明.md` 第 7 节「WMS 表结构与接口」](使用说明.md)，纯 DDL 见 [`docs/wms_scale_bridge_profile.sql`](docs/wms_scale_bridge_profile.sql)。

控制面已设 `Access-Control-Allow-Origin: *`，便于本机浏览器跨源（装箱页与桥接不同端口）。

### Profile 字段

| 字段 | 说明 |
|------|------|
| mac, name, enabled | 绑定 MAC、名称、是否启用 |
| portName, baudRate, dataBits, parity, stopBits | 串口参数 |
| protocolId | `cr-slice` / `cr-regex` / `eq-reverse` |
| protocol | `{ delimiter, start, end, isReverse, rate, pattern }`（object） |
| controlBaseUrl | 可选，仅记录 |
| version | 配置版本，出现在 status |
| paths | 可选，热覆盖控制面路径 |

### API

- `GET /identity` → `{ selectedMac, macs: string[] }`
- `GET /status` → `{ running, serialOpen, wsClients, mac, profileVersion, lastWeight, lastError }`
- `POST /reload` → body=Profile；`{ ok: true }` 或 `{ ok:false, message }`
- `POST /trial-read` → body=Profile 草稿；`{ ok, samples:[{raw,weight}], message }`

### 协议简述

- **cr-slice**：按 `\r` 或 `delimiter` 切帧 → `slice(start,end)` → 可选 reverse → `Number * rate`
- **cr-regex**：清理后 `match(pattern)`（默认 `(\d{3,4})`）→ `* rate`
- **eq-reverse**：delimiter `=`（0x3D），帧内容逆序取数 → `* rate`

## Windows 上安装 serialport

在 **Linux/无串口开发机** 上若原生模块编译失败，进程可启，但开串口会返回明确错误。

在 **Windows 真机**（目标现场）建议：

1. 安装 [Visual C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（含 Windows SDK）
2. 使用与 `package.json` / 现场一致的 Node 版本并自行验证 `serialport`
3. 在源码根目录 `npm install`，确认 `node_modules/serialport` 存在且可 `require('serialport')`
4. 用设备管理器确认秤的 COM 口，经 reload 的 `portName`（如 `COM3`）下发

## 打包展望（Win7～Win11 x64）

- **pkg**（或类似）把入口打成单文件 exe，随附 `defaults.json` 或内嵌；注意 native addon（serialport）需按目标平台预编译/打包
- Win7：选支持 Win7 的 Node 基线与 pkg 版本；禁用部分新 TLS/API；以管理员或普通用户测 COM 权限
- 亦可后续用 **.NET** 重写同协议控制面，保持 HTTP/WS 契约不变，装箱页无感切换
- 不要用 Electron 做壳；配置一律外部 reload 下发

## 目录

```
scale-bridge/          # 源码根目录
  package.json
  README.md
  使用说明.md
  docs/
    wms_scale_bridge_profile.sql
  dist/
    ScaleBridge/       # 发布目录
  src/
    index.js
    runtime.js
    identity.js
    serial.js
    transportWs.js
    controlHttp.js
    defaults.json
    protocol/
  launcher/
  scripts/
    smoke-mock.js
```

## 已知限制

- 串口必须在 **Windows 真机 + 真实 COM** 上验证；CI/Linux 仅能测 HTTP/WS 与 mock 帧
- 未实现通过 WS 回写串口
- serialport 在过新/过旧的 Node 上可能无法编译，现场请锁定已验证的 Node 版本
