'use strict';

/**
 * cr-slice：按 \\r 或 protocol.delimiter 切帧；slice start/end；可选 reverse；Number * rate
 * @param {string} frame 已切好的一帧（不含 delimiter）
 * @param {object} protocol
 * @returns {number|null}
 */
function parse(frame, protocol) {
  if (frame == null) return null;
  let s = String(frame);
  const start = protocol.start != null ? Number(protocol.start) : 0;
  const end = protocol.end != null ? Number(protocol.end) : s.length;
  s = s.slice(start, end);
  if (protocol.isReverse) {
    s = s.split('').reverse().join('');
  }
  // 去掉非数字（保留小数点与负号）
  const cleaned = s.replace(/[^\d.\-]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  const rate = protocol.rate != null ? Number(protocol.rate) : 1;
  return n * (Number.isFinite(rate) ? rate : 1);
}

module.exports = { parse };
