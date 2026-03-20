const { chromium } = require('playwright');
const path = require('path');

/**
 * Core Outlook interaction engine.
 */
class OutlookDriver {
  constructor(config = {}) {
    this.outlookUrl = config.outlookUrl || 'https://outlook.office.com/mail/inbox';
    this.userDataDir = config.userDataDir || path.join(__dirname, '..', 'browser-data-chromium');
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  /**
   * Initialize the driver (alias for login)
   */
  async init() {
    return this.login();
  }

  /**
   * Launch browser and handle login
   */
  async login() {
    await this.launch();
    return true;
  }

  /**
   * Launch browser with persistent context (keeps login session)
   */
  async launch() {
    console.log('🌐 Launching browser...');

    this.context = await chromium.launchPersistentContext(this.userDataDir, {
      headless: false,
      viewport: { width: 1400, height: 900 },
      args: [
        '--disable-gpu',
        '--disable-gpu-compositing',
        '--disable-software-rasterizer',
        '--in-process-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    this.page = this.context.pages()[0] || await this.context.newPage();

    console.log(`📧 Navigating to Outlook Inbox...`);
    await this.page.goto(this.outlookUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for user to log in if needed
    await this._waitForInboxReady();

    console.log('✅ Inbox loaded and ready.\n');
    return this.page;
  }

  /**
   * Navigate to the inbox
   */
  async navigateToInbox() {
    console.log(`📧 Navigating to Outlook Inbox...`);
    await this.page.goto(this.outlookUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this._waitForInboxReady();
  }

  /**
   * Wait until the inbox message list is visible (handles login flow)
   */
  async _waitForInboxReady() {
    console.log('⏳ Waiting for inbox to load (log in if prompted)...');
    
    // Wait up to 30 seconds for the message list to appear
    try {
      await this.page.waitForSelector(
        'div[role="option"], [role="listbox"] > div',
        { timeout: 30000 }
      );
    } catch {
      // Try alternative: look for any message items
      await this.page.waitForSelector(
        '[aria-label*="message"], [data-convid]',
        { timeout: 60000 }
      );
    }
    
    // Extra settle time
    await this.page.waitForTimeout(2000);
  }

  /**
   * Get list of visible inbox messages (metadata only)
   * @param {number} batchSize - Max messages to return
   */
  async getInboxMessages(batchSize) {
    console.log(`📋 Scanning inbox for up to ${batchSize} messages...`);
    
    // Updated selector based on UI inspection
    const selector = 'div[role="option"]';
    let messageElements = await this.page.$$(selector);
    
    // Scroll down to load more messages if needed
    let previousCount = 0;
    let attempts = 0;
    
    while (messageElements.length < batchSize && attempts < 15) {
      previousCount = messageElements.length;
      
      // Scroll to the last element
      if (messageElements.length > 0) {
        const lastEl = messageElements[messageElements.length - 1];
        await lastEl.evaluate(node => node.scrollIntoView()).catch(() => {});
        // Press PageDown to trigger web loads
        await this.page.keyboard.press('PageDown');
      }
      
      // Optimized wait
      await this.page.waitForTimeout(500);
      messageElements = await this.page.$$(selector);
      
      if (messageElements.length === previousCount) {
        attempts++;
      } else {
        attempts = 0;
      }
      
      if (messageElements.length > previousCount) {
        console.log(`  ... loaded ${messageElements.length} messages`);
      }
    }
    
    const messages = [];
    const limit = Math.min(messageElements.length, batchSize);
    
    for (let i = 0; i < limit; i++) {
      try {
        const el = messageElements[i];
        
        // Extract basic info from the list view
        const subject = await el.$eval(
          '[data-testid="SubjectLine"], [title], .lvHighlightSubjectClass',
          node => node.textContent?.trim() || ''
        ).catch(() => '');
        
        const sender = await el.$eval(
          '[data-testid="SenderName"], .lvHighlightFromClass, [aria-label*="From"]',
          node => node.textContent?.trim() || ''
        ).catch(() => '');
        
        const preview = await el.$eval(
          '[data-testid="PreviewText"], .lvHighlightBodyClass',
          node => node.textContent?.trim() || ''
        ).catch(() => '');
        
        // Check read/unread state
        const isUnread = await el.evaluate(node => {
          return node.getAttribute('aria-label')?.toLowerCase()?.includes('unread') ||
                 node.querySelector('[aria-label*="Unread"]') !== null ||
                 node.classList.contains('lvv2Unread') ||
                 node.querySelector('.lvv2Unread') !== null ||
                 window.getComputedStyle(node).fontWeight >= 600;
        }).catch(() => false);

        // Extract categories
        const categories = await el.$$eval(
          'div.O6uB9', 
          nodes => nodes.map(n => n.textContent?.trim()).filter(Boolean)
        ).catch(() => []);
        
        if (subject || sender) {
          messages.push({
            subject,
            sender,
            preview,
            isUnread,
            categories,
            element: el,
          });
        }
      } catch (err) {
        continue;
      }
    }
    
    return messages;
  }

  /**
   * Get the next email details and content
   */
  async getNextEmail() {
    const messages = await this.getInboxMessages(1);
    if (!messages || messages.length === 0) return null;
    
    const msg = messages[0];
    const content = await this.openMessage(msg.element);
    
    return {
      subject: msg.subject,
      sender: msg.sender,
      isUnread: msg.isUnread,
      categories: msg.categories,
      content: content,
      element: msg.element
    };
  }

  /**
   * Open a message to read its full body
   * @param {ElementHandle} messageElement
   * @returns {string} Full message body text
   */
  async openMessage(messageElement) {
    await messageElement.click();
    await this.page.waitForTimeout(500);
    
    let bodyText = '';
    
    try {
      bodyText = await this.page.$eval(
        '[role="document"], .ReadMsgBody, [aria-label="Message body"], .ReadingPaneContentsContainer',
        node => node.innerText?.trim() || node.textContent?.trim() || ''
      );
    } catch {
      try {
        const frame = this.page.frames().find(f => f.url().includes('projection'));
        if (frame) {
          bodyText = await frame.$eval('body', node => node.innerText?.trim() || '');
        }
      } catch {
        bodyText = '';
      }
    }
    
    return bodyText;
  }

  /**
   * Move the current message to a specific folder (category)
   */
  async moveToFolder(category) {
    try {
      console.log(`      📁 Moving to "${category}"...`);
      
      // Look for "Move to" button in the toolbar
      const moveButtonSelector = 'button[aria-label^="Move to"], button[name*="Move to"], [data-testid="MoveToButton"]';
      await this.page.waitForSelector(moveButtonSelector, { timeout: 10000 });
      await this.page.click(moveButtonSelector);
      
      // Wait for the dropdown and search box
      const searchBoxSelector = 'input[placeholder*="Search for a folder"], input[aria-label*="Search"], [role="combobox"] input';
      await this.page.waitForSelector(searchBoxSelector, { timeout: 5000 });
      
      // Clear and fill
      await this.page.click(searchBoxSelector);
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('a');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');
      await this.page.fill(searchBoxSelector, category);
      
      // Wait for search results or a message saying no results
      await this.page.waitForTimeout(1500);
      
      // Check if there are results
      const resultSelector = `[role="listbox"] [role="option"], .ms-ContextualMenu-item button`;
      const results = await this.page.$$(resultSelector);
      
      if (results.length > 0) {
        // Just press Enter on the first result usually works well
        await this.page.keyboard.press('Enter');
        console.log(`      ✅ Successfully triggered move to "${category}"`);
        
        // Wait for the move action to complete and UI to update
        await this.page.waitForTimeout(2000);
        return true;
      } else {
        console.warn(`      ⚠️ Folder "${category}" not found in search results.`);
        // Close the menu
        await this.page.keyboard.press('Escape');
        return false;
      }
    } catch (error) {
      console.error(`      ❌ Error moving to folder "${category}":`, error.message);
      
      // Escape if menu is stuck open
      await this.page.keyboard.press('Escape').catch(() => {});
      await this.page.keyboard.press('Escape').catch(() => {});
      return false;
    }
  }

  /**
   * Assign a category to the current message
   * @param {string} categoryName
   */
  async setCategory(categoryName) {
    if (!categoryName) return false;
    
    try {
      console.log(`      🏷️ Setting category: ${categoryName}...`);
      
      // Look for "Categorize" button
      const categorizeButtonSelector = 'button[aria-label^="Categorize"], button[name*="Categorize"], [data-testid="CategorizeButton"]';
      await this.page.waitForSelector(categorizeButtonSelector, { timeout: 5000 });
      await this.page.click(categorizeButtonSelector);
      
      // Wait for the menu
      await this.page.waitForTimeout(1000);
      
      // Look for the specific category in the menu
      // Outlook categories are often in a list with the name
      const categoryItemSelector = `button[role="menuitem"] span:has-text("${categoryName}"), [role="menuitem"] [title="${categoryName}"]`;
      const categoryItem = await this.page.$(categoryItemSelector);
      
      if (categoryItem) {
        await categoryItem.click();
        console.log(`      ✅ Applied category "${categoryName}"`);
        return true;
      } else {
        console.warn(`      ⚠️ Category "${categoryName}" not found in the menu.`);
        await this.page.keyboard.press('Escape');
        return false;
      }
    } catch (error) {
      console.error(`      ❌ Error setting category "${categoryName}":`, error.message);
      await this.page.keyboard.press('Escape').catch(() => {});
      return false;
    }
  }

  /**
   * Mark the current message as unread
   */
  async markAsUnread() {
    try {
      const unreadButtonSelector = 'button[aria-label="Mark as unread"]';
      await this.page.click(unreadButtonSelector);
      await this.page.waitForTimeout(1000);
      return true;
    } catch (error) {
      console.error('Error marking as unread:', error);
      return false;
    }
  }

  /**
   * Close the browser
   */
  async close() {
    if (this.context) {
      await this.context.close();
    }
  }
}

module.exports = OutlookDriver;
