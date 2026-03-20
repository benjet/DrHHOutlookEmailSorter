const OutlookDriver = require('./outlook');
const config = require('./env-load');
const { classify } = require('./classifier');
const logger = require('./logger');

/**
 * Main application entry point
 * Coordinates the email sorting process using AI classification
 */
async function main() {
  const driver = new OutlookDriver();
  
  try {
    logger.info('🚀 Starting DrHH Email Sorter...');
    await driver.init();
    
    // Login if necessary
    const loggedIn = await driver.login();
    if (!loggedIn) {
      logger.error('❌ Failed to login. Please check your credentials or MFA status.');
      return;
    }

    logger.info('✅ Logged in successfully.');
    
    // Refresh/navigate to inbox
    await driver.page.goto(config.outlook.url, { waitUntil: 'networkidle2' });
    
    // Search for uncategorized emails if configured
    if (config.sorting.processUncategorizedOnly) {
      logger.info('🔍 Searching for emails that need sorting (uncategorized)...');
      await driver.page.waitForSelector('input[aria-label="Search"]');
      await driver.page.fill('input[aria-label="Search"]', 'category:none');
      await driver.page.keyboard.press('Enter');
      await driver.page.waitForTimeout(3000); // Wait for search results
    }

    let processedCount = 0;
    let failedCount = 0;
    const maxMessages = config.sorting.maxMessages;

    // Loop through emails
    while (processedCount < maxMessages) {
      logger.info(`\n--- Processing Email #${processedCount + 1} / ${maxMessages} ---`);
      
      const email = await driver.getNextEmail();
      
      if (!email) {
        logger.info('🏁 No more emails found matching criteria.');
        break;
      }

      logger.info(`📧 From: ${email.sender}`);
      logger.info(`📝 Subject: ${email.subject}`);

      // Categorize using Gemini AI
      logger.info('🤖 Classifying email with AI...');
      const targetFolder = await classify(email.subject, email.content);
      
      if (targetFolder === 'Unknown' || !targetFolder) {
        logger.warn(`🛑 Could not determine clear category for: "${email.subject}". Skipping.`);
        // Just move to the next one, maybe by clicking it or escaping
        await driver.page.keyboard.press('Escape');
        processedCount++;
        continue;
      }

      logger.info(`🎯 AI identified Category: ${targetFolder}`);
      
      if (config.sorting.dryRun) {
        logger.info(`[DRY RUN] Would move to: ${targetFolder}`);
        processedCount++;
        continue;
      }

      const moved = await driver.moveToFolder(targetFolder);
      if (moved) {
        logger.info(`✅ Successfully sorted to ${targetFolder}`);
        processedCount++;
      } else {
        logger.warn(`⚠️ Failed to move email to ${targetFolder}. Skipping...`);
        failedCount++;
        await driver.page.keyboard.press('Escape'); 
      }

      // Small delay between actions
      await driver.page.waitForTimeout(1500);
    }

    logger.info(`\n✨ Sorting Process Completed!`);
    logger.notice(`📊 Total Processed: ${processedCount}`);
    logger.notice(`❌ Failed: ${failedCount}`);

  } catch (err) {
    logger.error('💥 Critical Error in Main Loop:', err);
  } finally {
    logger.info('🛑 Closing driver...');
    await driver.close();
  }
}

main();
