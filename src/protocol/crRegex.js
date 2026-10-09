'use strict';

/**
 * cr-regex：清理后 match pattern（默认 (\\d{3,4})）* rate
 * @param {string} frame
 * @param {object} protocol
 * @returns {number|null}
 */
function parse(frame, protocol) {
  if (frame == null) return null;
  let s = String(frame).replace(/[^\d.\-\w]/g, '');
  const pattern = protocol.pattern || '(\\d{3,4})';
  let re;
  try {
    re = new RegExp(pattern);
  } catch (e) {
    return null;
  }
  const m = s.match(re);
  if (!m) return null;
  const raw = m[1] != null ? m[1] : m[0];
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const rate = protocol.rate != null ? Number(protocol.rate) : 1;
  return n * (Number.isFinite(rate) ? rate : 1);
}

module.exports = { parse };
