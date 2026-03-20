const { createDriver } = require('./driver');
const config = require('./config');
const { detectMissedResponse } = require('./classifier');
const logger = require('./logger');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const driver = createDriver();

  try {
    logger.info('Starting DrHH Catch Missed Responses...');
    logger.info(`Mode: ${config.dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
    logger.info(`Max messages: ${config.maxMessages}\n`);

    await driver.init();

    let processedCount = 0;

    while (processedCount < config.maxMessages) {
      logger.info(`\n--- Check #${processedCount + 1} / ${config.maxMessages} ---`);

      // Find "1: Needs Response" emails, skip any already tagged "Serif/Redraft"
      const email = await driver.getNextEmailWithCategory(
        '1: Needs Response',
        'Serif/Redraft'
      );

      if (!email) {
        logger.info('No more unprocessed "1: Needs Response" emails found.');
        break;
      }

      logger.info(`From: ${email.sender}`);
      logger.info(`Subject: ${email.subject}`);

      // Check if Dr. HH missed responding
      logger.info('Checking for missed response...');
      const { isMissed, confidence, reasoning } = await detectMissedResponse({
        subject: email.subject,
        sender: email.sender,
        content: email.content,
      });

      if (!isMissed) {
        logger.log({
          action: 'skip',
          subject: email.subject,
          sender: email.sender,
          category: '1: Needs Response',
          reason: reasoning || 'No missed response detected',
        });

        if (email.isUnread) await driver.markAsUnread();
        await driver.pressEscape();
        processedCount++;
        await delay(1500);
        continue;
      }

      logger.info('Missed response detected — flagging with "Serif/Redraft"');

      if (config.dryRun) {
        logger.log({
          action: 'skip',
          subject: email.subject,
          sender: email.sender,
          category: 'Serif/Redraft',
          reason: 'Dry run',
        });

        if (email.isUnread) await driver.markAsUnread();
        processedCount++;
        await delay(1500);
        continue;
      }

      // Add "Serif/Redraft" without removing "1: Needs Response"
      const success = await driver.addCategory('Serif/Redraft');

      if (success) {
        logger.log({
          action: 'apply',
          subject: email.subject,
          sender: email.sender,
          category: 'Serif/Redraft',
          reason: 'Missed response — added Serif/Redraft',
        });
      } else {
        logger.log({
          action: 'error',
          subject: email.subject,
          sender: email.sender,
          category: 'Serif/Redraft',
          reason: 'Failed to add category in Outlook',
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
