'use strict';

/**
 * eq-reverse：delimiter `=` (0x3D)，截取逆序 * rate
 * 帧内容按字符逆序后取数字
 * @param {string} frame
 * @param {object} protocol
 * @returns {number|null}
 */
function parse(frame, protocol) {
  if (frame == null) return null;
  let s = String(frame).split('').reverse().join('');
  const cleaned = s.replace(/[^\d.\-]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  const rate = protocol.rate != null ? Number(protocol.rate) : 1;
  return n * (Number.isFinite(rate) ? rate : 1);
}

/** 默认 delimiter 字节 */
const DEFAULT_DELIMITER = Buffer.from([0x3d]); // '='

module.exports = { parse, DEFAULT_DELIMITER };
