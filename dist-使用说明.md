# 电子秤服务 — 使用说明

## 1. 这是什么

本机程序：读电子秤串口 → 解析重量 → 通过 WebSocket 推给浏览器页面（如散盘装盒）。  
**不负责** WMS 差异校验、登录、打印。串口参数由 **WMS 维护**，装箱页查询后 **reload 下发** 给本服务。

## 2. 怎么启动

1. 进入发布目录 `dist/ScaleBridge/`
2. 双击 **`电子秤服务.exe`**
3. 出现「电子秤服务」状态窗即表示服务已起（后台 node 无黑窗）
4. 点「退出」会结束服务

整夹拷贝部署，不要只拷一个 exe。

默认地址：

| 用途 | 地址 |
|------|------|
| 重量推送 WebSocket | `ws://127.0.0.1:5122` |
| 控制 HTTP | `http://127.0.0.1:5123` |

路径可在发布目录内 `src/defaults.json` 的 `paths` 中修改（需重启）。

## 2.1 状态窗改配置

状态窗下半区可改：

| 项 | 对应 `src/defaults.json` | 默认 |
|----|---------------------------|------|
| 页面请求地址 / 端口（或完整 Base） | `controlHost` + `controlPort` | `127.0.0.1` / `5123` |
| 查询网卡 / 状态 / 下发串口 / 试读重量路径 | `paths.*` | `/identity` 等 |
| 网页接收重量地址 / 端口 | `wsHost` + `wsPort` | `127.0.0.1` / `5122` |

点 **「保存并重启服务」**：写入同目录 `src/defaults.json` → 结束旧 node → 再拉起 → 状态刷新改用新 base/paths。  
也可手改 `defaults.json` 后点该按钮，或退出再开 exe。

---

## 3. 页面 / 调用方需要传的参数

### 3.1 取本机 MAC

`GET http://127.0.0.1:5123/identity`

**请求：** 无 Body。

**返回示例：**

```json
{
  "selectedMac": "D8:80:83:71:EC:85",
  "macs": ["D8:80:83:71:EC:85", "0A:00:27:00:00:0E"]
}
```

页面用 `selectedMac`（或用户选的一块）去 **WMS** 查秤配置。

---

### 3.2 查运行状态

`GET http://127.0.0.1:5123/status`

**请求：** 无 Body。

**返回示例：**

```json
{
  "running": true,
  "serialOpen": true,
  "wsClients": 1,
  "mac": "D8808371EC85",
  "profileVersion": 3,
  "lastWeight": 36.2,
  "lastError": null
}
```

| 字段 | 含义 |
|------|------|
| running | 已按配置尝试跑串口 |
| serialOpen | 串口是否打开 |
| wsClients | 当前连着重量 WS 的客户端数 |
| mac | 当前配置的 MAC |
| profileVersion | 配置版本（来自 reload） |
| lastWeight | 最近一次解析出的重量 |
| lastError | 最近错误信息 |

---

### 3.3 下发 / 热更新串口配置（核心）

`POST http://127.0.0.1:5123/reload`  
`Content-Type: application/json`

**典型流程：** 页面 `getScaleBridgeProfileByMac`（WMS）→ 将返回的 `data` 映射为 Profile 后 POST 到本接口（见第 7 节字段映射）。

**Body 字段（Profile）：**

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| portName | 是 | string | 如 `COM8` |
| protocolId | 是 | string | `cr-slice` / `cr-regex` / `eq-reverse` |
| baudRate | 否 | number | 默认 `9600` |
| dataBits | 否 | number | 默认 `8` |
| parity | 否 | string | `none` / `even` / `odd`，默认 `none` |
| stopBits | 否 | number | 默认 `1` |
| protocol | 否 | object | 协议参数，见下表（桥接侧为 object，非 JSON 字符串） |
| mac | 否 | string | 本机 MAC，建议带上 |
| name | 否 | string | 工位名 |
| enabled | 否 | boolean | `false` 时关闭串口 |
| version | 否 | number | 版本号，便于页面对比是否变更 |
| controlBaseUrl | 否 | string | 仅记录，如 `http://127.0.0.1:5123` |
| paths | 否 | object | 可覆盖控制路径，如 `{"reload":"/reload"}` |

**protocol（按 protocolId）：**

**cr-slice（回车定长截取，常用）**

| 字段 | 说明 |
|------|------|
| start / end | 截取下标（可与现 comtls 一致，如 6～9） |
| isReverse | 是否字符逆序 |
| rate | 倍率，如 `0.1` |
| delimiter | 可选，默认 `\r` |

**cr-regex**

| 字段 | 说明 |
|------|------|
| pattern | 正则，默认匹配 3～4 位数字 |
| rate | 倍率 |

**eq-reverse（`=` 分隔逆序）**

| 字段 | 说明 |
|------|------|
| start / end | 截取 |
| rate | 倍率，模板常为 `1000` |

**请求示例：**

```json
{
  "mac": "D8808371EC85",
  "name": "包装工位-01",
  "enabled": true,
  "portName": "COM8",
  "baudRate": 9600,
  "dataBits": 8,
  "parity": "none",
  "stopBits": 1,
  "protocolId": "cr-slice",
  "protocol": {
    "start": 6,
    "end": 9,
    "isReverse": false,
    "rate": 0.1
  },
  "version": 1,
  "controlBaseUrl": "http://127.0.0.1:5123"
}
```

**成功：** `{ "ok": true }`  

**本地快照：** 每次成功 reload（含 `enabled:false` 关串口）会覆盖写入程序目录内的上次 Profile 快照；退出后再启动会自动按该快照等价 reload 恢复（读失败或 JSON 损坏则忽略，不影响启动）。

**失败：** `{ "ok": false, "message": "缺少 portName" }`（HTTP 400）

---

### 3.4 试读（不强制保存为当前配置）

`POST http://127.0.0.1:5123/trial-read`  
Body 与 reload 相同的 Profile，另可加：

| 字段 | 默认 | 说明 |
|------|------|------|
| timeoutMs | 2000 | 等待毫秒 |
| maxFrames | 5 | 最多帧数 |

**返回示例：**

```json
{
  "ok": true,
  "samples": [
    { "raw": "......362.", "weight": 36.2 }
  ],
  "message": "ok"
}
```

---

### 3.5 收重量（装箱页）

浏览器：

```js
const ws = new WebSocket("ws://127.0.0.1:5122");
ws.onmessage = (e) => {
  const electronicWeigh = Number(e.data); // 纯文本，如 "36.2"
};
```

**不要**把重量通道和 `/reload` 混在一个 URL 上。

---

## 4. 与 WMS / 装箱页怎么配合

```
启动 电子秤服务.exe
    ↓
页面 GET /identity → 得到 mac
    ↓
页面调 WMS getScaleBridgeProfileByMac(mac)
    ↓
页面 POST /reload（WMS 返回的配置，按第 7 节映射为 Profile）
    ↓
页面连 ws://127.0.0.1:5122 显示 electronicWeigh
    ↓
业务仍走 checkSPZHWeight / weighCheck（与本服务无关）
```

配置主数据在 WMS；装箱页经 **customizedScreenManager** 维护；桥接 **不直连** WMS。  
WMS 里改了波特率等：页面再次查询并 `POST /reload`（或按 `version` 轮询，见第 7 节）。

控制基址与路径可在状态窗或 `defaults.json` 修改；页面侧也建议可配。重量 WS 默认 `5122`，可改。

---

## 5. 环境与注意

- 系统：Windows 7～11 x64  
- 需有秤的 COM 口及驱动  
- Win7 若无法启动，安装 VC++ 可再发行组件  
- 防火墙放行本机 5122、5123  
- CORS 已允许 `*`，页面跨域可调控制口  

## 6. 目录说明

| 路径 | 说明 |
|------|------|
| `电子秤服务.exe` | 状态窗 + 拉起服务（位于发布目录 `dist/ScaleBridge/`） |
| `node.exe` / `src` / `node_modules` | 运行时，须与 exe 同目录 |
| `src/defaults.json` | 默认端口与路径（状态窗可改并重启） |
| `使用说明.md` | 本说明 |
| `docs/wms_scale_bridge_profile.sql` | WMS 表 DDL（纯 SQL，便于 DBA） |

源码根目录即仓库根（含 `src/`、`launcher/`、`docs/`）；发布目录为 `dist/ScaleBridge/`。

---

## 7. WMS 表结构与接口

配置主数据落在 WMS 表 **`wms_scale_bridge_profile`**（`mac` 唯一）。装箱页经 customizedScreenManager 维护；桥接只收页面 `POST /reload` 下发的 Profile，**不直连 WMS**。

纯 DDL 文件：[`docs/wms_scale_bridge_profile.sql`](docs/wms_scale_bridge_profile.sql)（MySQL 风格，可按库改）。

### 7.1 表结构（DDL 摘要）

| 列名（库） | JSON / Java 驼峰 | 说明 |
|------------|------------------|------|
| id | id | 主键，bigint 自增（按库习惯即可） |
| mac | mac | 唯一；建议存**无冒号大写**（如 `D8808371EC85`），查询前对 identity 返回值做同样规范化 |
| name | name | 工位名 |
| enabled | enabled | 是否启用 |
| port_name | portName | 串口名，必填 |
| baud_rate | baudRate | 波特率 |
| data_bits | dataBits | 数据位 |
| parity | parity | 校验 |
| stop_bits | stopBits | 停止位 |
| protocol_id | protocolId | 协议 ID，必填 |
| protocol_json | protocolJson | 协议参数 JSON **文本**（TEXT/CLOB） |
| control_base_url | controlBaseUrl | 控制基址记录 |
| version | version | int；**save 时 +1**，供页面比对 |
| created_at / updated_at | — | 可选审计字段 |

```sql
-- 完整脚本见 docs/wms_scale_bridge_profile.sql；以下为等价摘要
CREATE TABLE IF NOT EXISTS wms_scale_bridge_profile (
  id                BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  mac               VARCHAR(32)  NOT NULL COMMENT 'MAC，唯一；建议无冒号大写',
  name              VARCHAR(128) NULL     COMMENT '工位/配置名称',
  enabled           TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '是否启用',
  port_name         VARCHAR(64)  NOT NULL COMMENT '串口名 → portName',
  baud_rate         INT          NULL     DEFAULT 9600 COMMENT '→ baudRate',
  data_bits         INT          NULL     DEFAULT 8 COMMENT '→ dataBits',
  parity            VARCHAR(16)  NULL     DEFAULT 'none' COMMENT '→ parity',
  stop_bits         INT          NULL     DEFAULT 1 COMMENT '→ stopBits',
  protocol_id       VARCHAR(32)  NOT NULL COMMENT '→ protocolId',
  protocol_json     TEXT         NULL     COMMENT '协议 JSON 文本',
  control_base_url  VARCHAR(256) NULL     COMMENT '→ controlBaseUrl',
  version           INT          NOT NULL DEFAULT 1 COMMENT 'save 时 +1',
  created_at        DATETIME     NULL     DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NULL     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_mac (mac)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='电子秤桥接 Profile';
```

### 7.2 接口：`getScaleBridgeProfileByMac`

按 MAC 查询一条配置。

**请求：** 传入规范化后的 `mac`（具体 Query/Body 形态由 WMS 现有约定即可）。

**回参约定：**

```json
{
  "status": 0,
  "data": {
    "mac": "D8808371EC85",
    "name": "包装工位-01",
    "portName": "COM8",
    "baudRate": 9600,
    "dataBits": 8,
    "parity": "none",
    "stopBits": 1,
    "protocolId": "cr-slice",
    "protocolJson": "{\"start\":6,\"end\":9,\"isReverse\":false,\"rate\":0.1}",
    "controlBaseUrl": "http://127.0.0.1:5123",
    "version": 3
  },
  "message": "ok"
}
```

说明：

- `status: 0` 表示成功；非 0 时看 `message`。
- `data` 字段与第 3.3 节 Profile 对齐；库列 `protocol_json` 在接口里以 **`protocolJson`（字符串）** 返回。
- **推荐**：get 时 WMS 也可额外返回已 parse 的 `protocol` 对象；若只返回 `protocolJson`，页面在 `POST /reload` 前自行 `JSON.parse(protocolJson)` 得到 `protocol`。

### 7.3 接口：`saveScaleBridgeProfile`

装箱配置页保存（customizedScreenManager）。写入/更新 `wms_scale_bridge_profile`，**`version` 在成功保存时 +1**。

**请求 body 示例（驼峰，与 get 的 data 同形）：**

```json
{
  "mac": "D8808371EC85",
  "name": "包装工位-01",
  "enabled": true,
  "portName": "COM8",
  "baudRate": 9600,
  "dataBits": 8,
  "parity": "none",
  "stopBits": 1,
  "protocolId": "cr-slice",
  "protocolJson": "{\"start\":6,\"end\":9,\"isReverse\":false,\"rate\":0.1}",
  "controlBaseUrl": "http://127.0.0.1:5123"
}
```

**回参约定（与 get 同形）：**

```json
{
  "status": 0,
  "data": {
    "mac": "D8808371EC85",
    "name": "包装工位-01",
    "portName": "COM8",
    "baudRate": 9600,
    "dataBits": 8,
    "parity": "none",
    "stopBits": 1,
    "protocolId": "cr-slice",
    "protocolJson": "{\"start\":6,\"end\":9,\"isReverse\":false,\"rate\":0.1}",
    "controlBaseUrl": "http://127.0.0.1:5123",
    "version": 4
  },
  "message": "ok"
}
```

### 7.4 与桥接 `/reload` 的字段映射（推荐）

页面流程：**identity → getByMac →（可选 save）→ reload → 连重量 WS**。

| WMS get/save `data` | 桥接 `POST /reload` Body | 说明 |
|---------------------|--------------------------|------|
| mac, name, enabled, portName, baudRate, dataBits, parity, stopBits, protocolId, controlBaseUrl, version | 同名字段原样 | 直接拷贝 |
| protocolJson（string） | **protocol**（object） | **推荐**：`protocol = JSON.parse(protocolJson)`；不要把字符串塞进 protocol |
| （若 get 已返回 protocol 对象） | protocol | 可直接用对象，无需再 parse |
| — | paths | 可选；一般用桥接 defaults，不必从 WMS 带 |

伪代码：

```js
const { data } = await getScaleBridgeProfileByMac(mac);
const profile = {
  ...data,
  protocol: data.protocol
    ? data.protocol
    : (data.protocolJson ? JSON.parse(data.protocolJson) : undefined),
};
delete profile.protocolJson; // 桥接侧吃 protocol 对象
await fetch(controlBaseUrl + "/reload", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(profile),
});
```

重量通道仍为 **WebSocket 纯文本**（默认 `ws://127.0.0.1:5122`），与控制 HTTP 分离。

### 7.5 可选：用 version 轮询

页面可定时（或切回前台时）再调 `getScaleBridgeProfileByMac`：若返回的 `version` 大于本地已 reload 的版本，则重新映射并 `POST /reload`，避免 WMS 改参后本机仍用旧串口配置。无需高频；按现场改参频率选间隔即可。
