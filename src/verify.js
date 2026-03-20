const { createDriver } = require('./driver');
const config = require('./config');
const { verifyNeedsResponse } = require('./classifier');
const logger = require('./logger');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const driver = createDriver();

  try {
    logger.info('Starting DrHH Verify ("1: Needs Response" double-check)...');
    logger.info(`Mode: ${config.dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
    logger.info(`Max messages: ${config.maxMessages}\n`);

    await driver.init();

    let processedCount = 0;

    while (processedCount < config.maxMessages) {
      logger.info(`\n--- Verify #${processedCount + 1} / ${config.maxMessages} ---`);

      const email = await driver.getNextEmailWithCategory('1: Needs Response');

      if (!email) {
        logger.info('No more "1: Needs Response" emails found.');
        break;
      }

      logger.info(`From: ${email.sender}`);
      logger.info(`Subject: ${email.subject}`);

      // Re-evaluate with Gemini AI
      logger.info('Verifying classification...');
      const { category: newCategory, confidence, reasoning } = await verifyNeedsResponse({
        subject: email.subject,
        sender: email.sender,
        content: email.content,
      });

      if (newCategory === 'Unchanged') {
        logger.log({
          action: 'skip',
          subject: email.subject,
          sender: email.sender,
          category: '1: Needs Response',
          reason: reasoning || 'Correctly categorized (or ambiguous)',
        });

        if (email.isUnread) await driver.markAsUnread();
        await driver.pressEscape();
        processedCount++;
        await delay(1500);
        continue;
      }

      logger.info(`Should be: ${newCategory}`);

      if (config.dryRun) {
        logger.log({
          action: 'skip',
          subject: email.subject,
          sender: email.sender,
          category: newCategory,
          reason: 'Dry run',
        });

        if (email.isUnread) await driver.markAsUnread();
        processedCount++;
        await delay(1500);
        continue;
      }

      // Two-step category swap: remove old, add new
      const success = await driver.swapCategory('1: Needs Response', newCategory);

      if (success) {
        logger.log({
          action: 'apply',
          subject: email.subject,
          sender: email.sender,
          category: newCategory,
          reason: 'Reclassified from "1: Needs Response"',
        });
      } else {
        logger.log({
          action: 'error',
          subject: email.subject,
          sender: email.sender,
          category: newCategory,
          reason: 'Failed to swap category in Outlook',
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
