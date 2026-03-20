require('dotenv').config();
const fs = require('fs');
const path = require('path');

const configFilePath = path.join(__dirname, '..', 'config.json');
let configJson = {};
if (fs.existsSync(configFilePath)) {
  configJson = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
}

/**
 * Centralized environment configuration loader.
 * Validates required variables and provides defaults for optional ones.
 */
const config = {
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  },
  sorting: {
    batchSize: configJson.batchSize || parseInt(process.env.BATCH_SIZE || '10', 10),
    maxMessages: configJson.maxMessages || parseInt(process.env.MAX_MESSAGES || '50', 10),
    dryRun: process.env.DRY_RUN === 'true' || process.env.NODE_ENV === 'test',
    processUncategorizedOnly: configJson.process_uncategorized_only !== undefined ? configJson.process_uncategorized_only : true,
    categories: configJson.categories || [],
  },
  outlook: {
    url: configJson.outlookUrl || 'https://outlook.office.com/mail/inbox',
  }
};

// Required for operation
if (!config.gemini.apiKey) {
  console.error('CRITICAL ERROR: GEMINI_API_KEY is missing from environment/dotenv.');
  process.exit(1);
}

module.exports = config;
