// No-op security logger
// To conserve resources and avoid writing logs, this module intentionally
// provides no-op functions. Replace or restore the original implementation
// if you later want to re-enable persistent security logging.

module.exports = {
  logSuspiciousActivity: () => {},
  logBlockedAccess: () => {},
  logFailedAuth: () => {},
  logSecurityEvent: () => {},
  log: () => {}
};