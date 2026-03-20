/**
 * Microsoft Graph authentication using MSAL device code flow.
 * This works without needing Azure Portal access — the user authenticates
 * via browser with their UCSF credentials.
 *
 * Tokens are cached to disk so you only need to log in once.
 */
const fs = require('fs');
const path = require('path');
const msal = require('@azure/msal-node');

const TOKEN_CACHE_PATH = path.join(__dirname, '..', '.graph-token-cache.json');

/**
 * Create an authenticated MSAL client with token caching.
 * Uses device code flow (no browser automation needed).
 */
function createMsalClient(config) {
  const msalConfig = {
    auth: {
      clientId: config.azureClientId,
      authority: config.azureTenantId === 'common'
        ? 'https://login.microsoftonline.com/common'
        : `https://login.microsoftonline.com/${config.azureTenantId}`,
      ...(config.azureClientSecret && { clientSecret: config.azureClientSecret }),
    },
  };

  const app = config.azureClientSecret
    ? new msal.ConfidentialClientApplication(msalConfig)
    : new msal.PublicClientApplication(msalConfig);

  // Load cached tokens
  if (fs.existsSync(TOKEN_CACHE_PATH)) {
    try {
      const cacheData = fs.readFileSync(TOKEN_CACHE_PATH, 'utf-8');
      app.getTokenCache().deserialize(cacheData);
    } catch {
      // Corrupt cache — will re-authenticate
    }
  }

  return app;
}

/**
 * Save token cache to disk.
 */
function saveCache(app) {
  try {
    const cacheData = app.getTokenCache().serialize();
    fs.writeFileSync(TOKEN_CACHE_PATH, cacheData);
  } catch {
    // Non-fatal
  }
}

/**
 * Get a valid access token. Tries silent first, falls back to device code flow.
 */
async function getAccessToken(app, scopes) {
  // Try silent acquisition first (cached tokens)
  const accounts = await app.getTokenCache().getAllAccounts();
  if (accounts.length > 0) {
    try {
      const result = await app.acquireTokenSilent({
        account: accounts[0],
        scopes,
      });
      saveCache(app);
      return result.accessToken;
    } catch {
      // Token expired, fall through to interactive
    }
  }

  // Device code flow — user authenticates in browser
  console.log('\n========================================');
  console.log('  Microsoft Graph Authentication Required');
  console.log('========================================\n');

  const result = await app.acquireTokenByDeviceCode({
    scopes,
    deviceCodeCallback: (response) => {
      console.log(response.message);
      console.log('\n(This is a one-time login. Tokens will be cached for future runs.)\n');
    },
  });

  saveCache(app);
  return result.accessToken;
}

module.exports = { createMsalClient, getAccessToken };
