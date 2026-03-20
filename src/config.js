require('dotenv').config();

const config = {
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  maxMessages: parseInt(process.env.MAX_MESSAGES || '50', 10),
  dryRun: process.env.DRY_RUN === 'true',
  outlookUrl: process.env.OUTLOOK_URL || 'https://outlook.office.com/mail/inbox',
};

if (!config.geminiApiKey) {
  console.error('CRITICAL: GEMINI_API_KEY is missing from .env file.');
  process.exit(1);
}

module.exports = config;
