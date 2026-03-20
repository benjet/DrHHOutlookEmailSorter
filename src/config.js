require('dotenv').config();

const config = {
  // Gemini AI
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',

  // General
  maxMessages: parseInt(process.env.MAX_MESSAGES || '50', 10),
  dryRun: process.env.DRY_RUN === 'true',

  // Backend: 'graph' (API) or 'browser' (Playwright)
  backend: process.env.BACKEND || 'graph',

  // Playwright browser settings (only used when backend=browser)
  outlookUrl: process.env.OUTLOOK_URL || 'https://outlook.office.com/mail/inbox',

  // Azure / Microsoft Graph settings (only used when backend=graph)
  azureTenantId: process.env.AZURE_TENANT_ID || 'common',
  azureClientId: process.env.AZURE_CLIENT_ID || '',
  azureClientSecret: process.env.AZURE_CLIENT_SECRET || '',
};

if (!config.geminiApiKey) {
  console.error('CRITICAL: GEMINI_API_KEY is missing from .env file.');
  process.exit(1);
}

if (config.backend === 'graph' && !config.azureClientId) {
  console.error('CRITICAL: AZURE_CLIENT_ID is missing. Set BACKEND=browser to use Playwright instead.');
  process.exit(1);
}

module.exports = config;
