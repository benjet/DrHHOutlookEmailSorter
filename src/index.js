const { createDriver } = require('./driver');
const config = require('./config');
const { classify } = require('./classifier');
const logger = require('./logger');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const driver = createDriver();

  try {
    logger.info('Starting DrHH Email Sorter...');
    logger.info(`Mode: ${config.dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
    logger.info(`Max messages: ${config.maxMessages}\n`);

    await driver.init();
    await driver.searchUncategorized(); // loads inbox; uncategorized filtering is done per-email

    let processedCount = 0;

    while (processedCount < config.maxMessages) {
      logger.info(`\n--- Email #${processedCount + 1} / ${config.maxMessages} ---`);

      const email = await driver.getNextEmail();

      if (!email) {
        logger.info('No more emails found.');
        break;
      }

      logger.info(`From: ${email.sender}`);
      logger.info(`Subject: ${email.subject}`);

      // Classify with Gemini AI
      logger.info('Classifying...');
      const { category, confidence, reasoning } = await classify({
        subject: email.subject,
        sender: email.sender,
        content: email.content,
      });

      if (category === 'Uncategorized' || !category) {
        logger.log({
          action: 'skip',
          subject: email.subject,
          sender: email.sender,
          category: null,
          reason: reasoning || 'Low confidence or ambiguous',
        });

        if (email.isUnread) await driver.markAsUnread();
        await driver.pressEscape();
        processedCount++;
        await delay(1500);
        continue;
      }

      logger.info(`Category: ${category} (Confidence: ${confidence})`);
      if (reasoning) logger.info(`Reasoning: ${reasoning}`);

      if (config.dryRun) {
        logger.log({
          action: 'skip',
          subject: email.subject,
          sender: email.sender,
          category,
          reason: 'Dry run',
        });

        if (email.isUnread) await driver.markAsUnread();
        processedCount++;
        await delay(1500);
        continue;
      }

      // Apply the category
      const success = await driver.setCategory(category);

      if (success) {
        logger.log({
          action: 'apply',
          subject: email.subject,
          sender: email.sender,
          category,
        });
      } else {
        logger.log({
          action: 'error',
          subject: email.subject,
          sender: email.sender,
          category,
          reason: 'Failed to apply category in Outlook',
        });
      }

      if (email.isUnread) await driver.markAsUnread();
      processedCount++;
      await delay(1500);
    }

    logger.printSummary();
  } catch (err) {
    logger.error('Critical error:', err);
  } finally {
    logger.info('Closing browser...');
    await driver.close();
  }
}

main();
