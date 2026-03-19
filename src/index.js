/**
 * Outlook Inbox Category Sorter — Main Orchestrator
 * 
 * Entry point that ties together classification, Outlook automation, and logging.
 * Run with: npm start (live) or npm run dry-run (preview only)
 */

require('dotenv').config();
const OutlookAutomation = require('./outlook');
const { classifyEmail, APPROVED_CATEGORIES } = require('./classifier');
const Logger = require('./logger');

// Configuration from .env
const CONFIG = {
  batchSize: parseInt(process.env.BATCH_SIZE || '10', 10),
  outlookUrl: process.env.OUTLOOK_URL || 'https://outlook.office.com/mail/inbox',
  dryRun: process.env.DRY_RUN === 'true',
  userDataDir: process.env.USER_DATA_DIR || './browser-data',
  messageDelay: parseInt(process.env.MESSAGE_DELAY || '1500', 10),
};

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  📬 Outlook Inbox Category Sorter');
  console.log('═'.repeat(60));
  console.log(`  Mode:       ${CONFIG.dryRun ? '🔍 DRY RUN (no changes)' : '⚡ LIVE (applying categories)'}`);
  console.log(`  Batch size: ${CONFIG.batchSize}`);
  console.log(`  Delay:      ${CONFIG.messageDelay}ms between messages`);
  console.log('═'.repeat(60) + '\n');

  const logger = new Logger();
  const outlook = new OutlookAutomation({
    outlookUrl: CONFIG.outlookUrl,
    userDataDir: CONFIG.userDataDir,
  });

  try {
    // Step 1: Launch browser and load inbox
    await outlook.launch();

    // Step 2: Get inbox messages
    const messages = await outlook.getInboxMessages(CONFIG.batchSize);

    if (messages.length === 0) {
      console.log('📭 No messages found in inbox. Exiting.');
      await outlook.close();
      return;
    }

    // Step 3: Process each message
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      console.log(`\n${'─'.repeat(50)}`);
      console.log(`  Message ${i + 1}/${messages.length}`);
      console.log(`  Subject: ${msg.subject?.substring(0, 70) || '(no subject)'}`);
      console.log(`  From:    ${msg.sender}`);
      console.log(`  Status:  ${msg.isUnread ? '📩 Unread' : '📨 Read'}`);
      console.log(`  Current: ${msg.existingCategory || '(none)'}`);

      try {
        // Step 2: Capture message state
        const wasUnread = msg.isUnread;

        // Step 3: Open message to read full content
        let body = '';
        try {
          body = await outlook.openMessage(msg.element);
        } catch (err) {
          console.log(`  ⚠️ Could not open message body, using preview only.`);
          body = msg.preview || '';
        }

        // Also check category from the open message view
        let existingCategory = msg.existingCategory;
        if (!existingCategory) {
          try {
            existingCategory = await outlook.getOpenMessageCategory();
          } catch {}
        }

        // Step 4: Classify
        const decision = await classifyEmail({
          subject: msg.subject,
          sender: msg.sender,
          body,
          preview: msg.preview,
          existingCategory,
        });

        console.log(`  Decision: ${decision.action} → ${decision.category || '(none)'} [${decision.confidence}]`);

        // Step 4b: Apply, update, or remove category
        if (!CONFIG.dryRun) {
          if (decision.action === 'apply' || decision.action === 'update') {
            // If updating, first remove old category
            if (decision.action === 'update' && existingCategory) {
              await outlook.removeCategory(msg.element);
              await delay(500);
            }
            await outlook.applyCategory(msg.element, decision.category);
          } else if (decision.action === 'remove') {
            await outlook.removeCategory(msg.element);
          }
          // 'skip' = no action needed

          // Step 5: Restore unread state if it was changed
          if (wasUnread) {
            await delay(300);
            await outlook.markAsUnread(msg.element);
          }
        } else {
          console.log(`  🔍 DRY RUN — no changes applied.`);
        }

        // Log the decision
        logger.log({
          subject: msg.subject,
          sender: msg.sender,
          wasUnread,
          previousCategory: existingCategory || null,
          newCategory: decision.category,
          action: decision.action,
          confidence: decision.confidence,
          reason: decision.reason,
          dryRun: CONFIG.dryRun,
        });

      } catch (err) {
        console.error(`  ❌ Error processing message: ${err.message}`);
        logger.log({
          subject: msg.subject,
          sender: msg.sender,
          action: 'error',
          reason: err.message,
          dryRun: CONFIG.dryRun,
        });
      }

      // Step 7: Delay before next message
      if (i < messages.length - 1) {
        await delay(CONFIG.messageDelay);
      }
    }

    // Summary
    logger.printSummary();

    // Keep browser open for user to review
    console.log('🖥️  Browser left open for review. Press Ctrl+C to exit.\n');
    
    // Wait indefinitely (user will Ctrl+C when done)
    await new Promise(() => {});

  } catch (err) {
    console.error(`\n💥 Fatal error: ${err.message}`);
    console.error(err.stack);
    logger.printSummary();
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run
main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
