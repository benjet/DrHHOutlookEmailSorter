/**
 * Outlook Web Automation
 * 
 * All browser interactions with Outlook Web (outlook.office.com).
 * Uses Playwright to navigate, read messages, and apply categories.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SELECTORS = {
  // Message list
  messageList: '[role="list"]',
  messageRow: '[role="listitem"]',
  messageSubject: '[data-testid="SubjectLine"]',
  messageSender: '[data-testid="SenderName"]',
  messagePreview: '[data-testid="PreviewText"]',
  
  // Read/unread indicators
  unreadIndicator: '[aria-label*="Unread"]',
  
  // Message reading pane / full view
  messageBody: '[role="document"]',
  messageBodyAlt: '.ReadMsgBody, .ReadingPaneContentsContainer, [aria-label="Message body"]',
  
  // Category UI (right-click context menu)
  contextMenu: '[role="menu"]',
  categorizeOption: '[role="menuitem"]',
  
  // Back navigation
  backButton: 'button[aria-label="Back"]',
};

class OutlookAutomation {
  constructor(config = {}) {
    this.outlookUrl = config.outlookUrl || 'https://outlook.office.com/mail/inbox';
    this.userDataDir = config.userDataDir || path.join(__dirname, '..', 'browser-data-chromium');
    this.browser = null;
    this.context = null;
    this.page = null;
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
   * Wait until the inbox message list is visible (handles login flow)
   */
  async _waitForInboxReady() {
    console.log('⏳ Waiting for inbox to load (log in if prompted)...');
    
    // Wait up to 5 minutes for the message list to appear (user may need to log in)
    try {
      await this.page.waitForSelector(
        '[role="listbox"], [role="list"], [data-testid="MailList"]',
        { timeout: 300000 }
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
  async getInboxMessages(batchSize = 10) {
    console.log(`📋 Scanning inbox for up to ${batchSize} messages...`);
    
    const selector = '[role="listbox"] > div, [data-convid], [aria-label*="mail"]';
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
      
      await this.page.waitForTimeout(1500);
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
        
        // Check existing category
        const existingCategory = await el.$eval(
          '[data-testid="CategoryContainer"] span, .categoryLabelText',
          node => node.textContent?.trim() || null
        ).catch(() => null);
        
        if (subject || sender) {
          messages.push({
            index: i,
            element: el,
            subject,
            sender,
            preview,
            isUnread,
            existingCategory,
          });
        }
      } catch (err) {
        // Skip messages that can't be parsed
        continue;
      }
    }
    
    console.log(`  Found ${messages.length} messages to process.\n`);
    return messages;
  }

  /**
   * Open a message to read its full body
   * @param {ElementHandle} messageElement
   * @returns {string} Full message body text
   */
  async openMessage(messageElement) {
    // Click the message to open it in reading pane or full view
    await messageElement.click();
    await this.page.waitForTimeout(1500);
    
    // Try to get body text from reading pane
    let bodyText = '';
    
    try {
      bodyText = await this.page.$eval(
        '[role="document"], .ReadMsgBody, [aria-label="Message body"], .ReadingPaneContentsContainer',
        node => node.innerText?.trim() || node.textContent?.trim() || ''
      );
    } catch {
      // Fallback: try iframe-based body
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
   * Get the existing category of the currently open message
   */
  async getOpenMessageCategory() {
    try {
      return await this.page.$eval(
        '[data-testid="CategoryContainer"] span, .categoryLabelText, [aria-label*="Category"]',
        node => node.textContent?.trim() || null
      );
    } catch {
      return null;
    }
  }

  /**
   * Apply a category to the currently selected message via right-click menu
   * @param {ElementHandle} messageElement - The message list item element
   * @param {string} categoryName - The category to apply
   */
  async applyCategory(messageElement, categoryName) {
    // Right-click the message to open context menu
    await messageElement.click({ button: 'right' });
    await this.page.waitForTimeout(800);
    
    // Look for "Categorize" in the context menu
    const categorizeBtn = await this.page.$(
      '[role="menuitem"]:has-text("Categorize"), [aria-label*="Categorize"]'
    );
    
    if (!categorizeBtn) {
      // Try the toolbar categorize button instead
      const toolbarBtn = await this.page.$(
        'button[aria-label*="Categorize"], [data-testid="Categorize"]'
      );
      if (toolbarBtn) {
        await toolbarBtn.click();
      } else {
        throw new Error('Could not find Categorize option');
      }
    } else {
      await categorizeBtn.click();
    }
    
    await this.page.waitForTimeout(600);
    
    // Click the specific category
    const categoryBtn = await this.page.$(
      `[role="menuitem"]:has-text("${categoryName}"), [aria-label*="${categoryName}"]`
    );
    
    if (!categoryBtn) {
      throw new Error(`Could not find category "${categoryName}" in menu`);
    }
    
    await categoryBtn.click();
    await this.page.waitForTimeout(500);
    
    // Close any remaining menus by pressing Escape
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
  }

  /**
   * Remove all categories from the currently selected message
   * @param {ElementHandle} messageElement
   */
  async removeCategory(messageElement) {
    // Right-click the message
    await messageElement.click({ button: 'right' });
    await this.page.waitForTimeout(800);
    
    // Find Categorize menu
    const categorizeBtn = await this.page.$(
      '[role="menuitem"]:has-text("Categorize"), [aria-label*="Categorize"]'
    );
    
    if (categorizeBtn) {
      await categorizeBtn.click();
      await this.page.waitForTimeout(600);
      
      // Look for "Clear all categories" option
      const clearBtn = await this.page.$(
        '[role="menuitem"]:has-text("Clear"), [aria-label*="Clear"]'
      );
      
      if (clearBtn) {
        await clearBtn.click();
        await this.page.waitForTimeout(500);
      }
    }
    
    // Close any remaining menus
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
  }

  /**
   * Mark the currently open/selected message as unread
   * @param {ElementHandle} messageElement
   */
  async markAsUnread(messageElement) {
    // Right-click and find "Mark as unread"
    await messageElement.click({ button: 'right' });
    await this.page.waitForTimeout(600);
    
    const unreadBtn = await this.page.$(
      '[role="menuitem"]:has-text("Mark as unread"), [aria-label*="Mark as unread"]'
    );
    
    if (unreadBtn) {
      await unreadBtn.click();
      await this.page.waitForTimeout(300);
    } else {
      // Try keyboard shortcut (Ctrl+U)
      await this.page.keyboard.press('Escape');
      await messageElement.click();
      await this.page.waitForTimeout(200);
      await this.page.keyboard.press('Control+u');
      await this.page.waitForTimeout(300);
    }
  }

  /**
   * Close the browser
   */
  async close() {
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
  }
}

module.exports = OutlookAutomation;
