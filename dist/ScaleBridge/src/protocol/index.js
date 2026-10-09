'use strict';

const crSlice = require('./crSlice');
const crRegex = require('./crRegex');
const eqReverse = require('./eqReverse');

const HANDLERS = {
  'cr-slice': crSlice,
  'cr-regex': crRegex,
  'eq-reverse': eqReverse,
};

/**
 * @param {string} protocolId
 * @param {string} frame
 * @param {object} protocol
 * @returns {number|null}
 */
function parseWeight(protocolId, frame, protocol) {
  const h = HANDLERS[protocolId];
  if (!h) return null;
  return h.parse(frame, protocol || {});
}

/**
 * 解析 delimiter：字符串或缺省按协议
 * @param {string} protocolId
 * @param {object} protocol
 * @returns {string|Buffer}
 */
function resolveDelimiter(protocolId, protocol) {
  if (protocol && protocol.delimiter != null && protocol.delimiter !== '') {
    return protocol.delimiter;
  }
  if (protocolId === 'eq-reverse') {
    return eqReverse.DEFAULT_DELIMITER;
  }
  return '\r';
}

function knownProtocol(protocolId) {
  return Object.prototype.hasOwnProperty.call(HANDLERS, protocolId);
}

module.exports = { parseWeight, resolveDelimiter, knownProtocol };
