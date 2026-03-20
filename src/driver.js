/**
 * Factory: returns the right Outlook driver based on config.backend.
 * Both drivers have the same interface so entry points don't need to change.
 */
const config = require('./config');

function createDriver() {
  if (config.backend === 'graph') {
    const GraphOutlookClient = require('./graph-client');
    return new GraphOutlookClient();
  }

  const OutlookDriver = require('./outlook');
  return new OutlookDriver();
}

module.exports = { createDriver };
