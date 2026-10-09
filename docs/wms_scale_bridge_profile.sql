-- WMS 电子秤桥接配置表
-- 方言：MySQL 风格，可按实际库（Oracle/SQL Server/PostgreSQL 等）调整类型与自增语法
-- 表名：wms_scale_bridge_profile
-- 列名：下划线；Java/JSON 侧映射为驼峰（port_name → portName 等）

CREATE TABLE IF NOT EXISTS wms_scale_bridge_profile (
  id                BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  mac               VARCHAR(32)  NOT NULL COMMENT '本机网卡 MAC，唯一；建议规范化为无冒号大写，如 D8808371EC85',
  name              VARCHAR(128) NULL     COMMENT '工位/配置名称',
  enabled           TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '是否启用：1启用 0关闭串口',
  port_name         VARCHAR(64)  NOT NULL COMMENT '串口名，如 COM8 → JSON portName',
  baud_rate         INT          NULL     DEFAULT 9600 COMMENT '波特率 → baudRate',
  data_bits         INT          NULL     DEFAULT 8 COMMENT '数据位 → dataBits',
  parity            VARCHAR(16)  NULL     DEFAULT 'none' COMMENT '校验：none/even/odd → parity',
  stop_bits         INT          NULL     DEFAULT 1 COMMENT '停止位 → stopBits',
  protocol_id       VARCHAR(32)  NOT NULL COMMENT '协议：cr-slice / cr-regex / eq-reverse → protocolId',
  protocol_json     TEXT         NULL     COMMENT '协议参数 JSON 文本 → 接口可解析为 protocol 对象，或页面 parse 后 POST /reload',
  control_base_url  VARCHAR(256) NULL     COMMENT '控制基址记录，如 http://127.0.0.1:5123 → controlBaseUrl',
  version           INT          NOT NULL DEFAULT 1 COMMENT '配置版本；save 时 +1，供页面比对',
  created_at        DATETIME     NULL     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at        DATETIME     NULL     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_mac (mac)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='电子秤桥接 Profile（按 MAC 绑定）';
