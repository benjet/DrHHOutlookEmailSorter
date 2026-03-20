const { chromium } = require('playwright');
const path = require('path');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

class OutlookDriver {
  constructor() {
    this.outlookUrl = 'https://outlook.office.com/mail/inbox';
    this.userDataDir = path.join(__dirname, '..', 'browser-data-chromium');
    this.context = null;
    this.page = null;
  }

  /**
   * Launch browser with persistent context, navigate to inbox, wait for it to load.
   * On first run the user must log in manually in the browser window.
   */
  async init() {
    console.log('Launching browser...');

    this.context = await chromium.launchPersistentContext(this.userDataDir, {
      headless: false,
      viewport: { width: 1400, height: 900 },
      args: [
        '--disable-gpu',
        '--disable-gpu-compositing',
        '--disable-software-rasterizer',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    this.page = this.context.pages()[0] || (await this.context.newPage());

    console.log('Navigating to Outlook inbox...');
    await this.page.goto(this.outlookUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await this._waitForInbox();
    console.log('Inbox loaded and ready.\n');
  }

  /**
   * Wait until the inbox message list is visible.
   * If a login prompt appears, the user has up to 2 minutes to complete it.
   */
  async _waitForInbox() {
    console.log('Waiting for inbox to load (log in if prompted)...');
    try {
      await this.page.waitForSelector(
        'div[role="option"], [role="listbox"] > div',
        { timeout: 120000 }
      );
    } catch {
      // Fallback selectors for different Outlook layouts
      await this.page.waitForSelector(
        '[aria-label*="message"], [data-convid]',
        { timeout: 60000 }
      );
    }
    await delay(2000);
  }

  /**
   * Ensure we're viewing the inbox (no search filter needed).
   */
  async searchUncategorized() {
    console.log('Loading inbox...');
    await this.page.goto(this.outlookUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this._waitForInbox();
  }

  /**
   * Find the next uncategorized email in the list, open it, and return its details.
   * Skips any emails that already have a category badge.
   * Returns null if no uncategorized emails are found.
   */
  async getNextEmail() {
    const allItems = await this.page.$$('div[role="option"]');
    if (!allItems.length) return null;

    // Find the first item with no category badge
    let item = null;
    for (const el of allItems) {
      const hasCategory = await el.evaluate((node) => {
        // Outlook renders category badges as colored tags in the list item
        return (
          node.querySelector('.O6uB9, [class*="category"], [class*="Category"]') !== null ||
          (node.getAttribute('aria-label') || '').toLowerCase().includes('category')
        );
      }).catch(() => false);

      if (!hasCategory) {
        item = el;
        break;
      }
    }

    if (!item) return null;

    // Extract metadata from the list item before clicking
    // On some versions of Outlook, the row itself has an aria-label with the info
    const rowLabel = await item.getAttribute('aria-label').catch(() => '');
    
    let subject = await item
      .$eval(
        '[data-testid="SubjectLine"], [title], .lvHighlightSubjectClass, span[title]',
        (n) => n.textContent?.trim() || ''
      )
      .catch(() => '');

    let sender = await item
      .$eval(
        '[data-testid="SenderName"], [data-testid="PersonaName"], .lvHighlightFromClass, [aria-label*="From"]',
        (n) => n.textContent?.trim() || ''
      )
      .catch(() => '');

    // Fallback parsing from aria-label if selectors failed
    if (!sender && rowLabel) {
      const match = rowLabel.match(/From (.*?);/i) || rowLabel.match(/From (.*?),/i) || rowLabel.match(/From (.*?)\./i);
      if (match) sender = match[1].trim();
    }
    if (!subject && rowLabel) {
      const match = rowLabel.match(/Subject (.*?);/i) || rowLabel.match(/Subject (.*?)\./i);
      if (match) subject = match[1].trim();
    }

    // Ultimate fallback from innerText
    if (!sender || !subject) {
      const text = await item.innerText().catch(() => '');
      const parts = text.split('\n').filter(p => p.trim().length > 2);
      if (!sender && parts.length > 0) sender = parts[0].trim();
      if (!subject && parts.length > 1) subject = parts[1].trim();
    }

    const isUnread = await item
      .evaluate((node) => {
        const label = (node.getAttribute('aria-label') || '').toLowerCase();
        return (
          label.includes('unread') ||
          node.querySelector('[aria-label*="Unread"]') !== null
        );
      })
      .catch(() => false);

    // Open the email to read full body
    await item.click();
    await delay(1500);

    // After the reading pane loads, extract subject/sender from it (more reliable than list DOM)
    if (!subject) {
      subject = await this.page
        .$eval(
          'h1, [data-testid="subject"], [data-testid="SubjectLine"], .allowTextSelection',
          (n) => n.textContent?.trim() || ''
        )
        .catch(() => '');
    }
    if (!sender) {
      sender = await this.page
        .$eval(
          '[data-testid="SenderName"], [data-testid="PersonaName"], ' +
          '[aria-label^="From"], .ms-Persona-primaryText, .RecipientWell span',
          (n) => n.textContent?.trim() || ''
        )
        .catch(() => '');
    }

    let content = '';
    try {
      content = await this.page.$eval(
        '[role="document"], .ReadMsgBody, [aria-label="Message body"], .ReadingPaneContentsContainer',
        (n) => n.innerText?.trim() || n.textContent?.trim() || ''
      );
    } catch {
      // Some Outlook layouts use an iframe for the message body
      try {
        const frame = this.page
          .frames()
          .find((f) => f.url().includes('projection'));
        if (frame) {
          content = await frame.$eval(
            'body',
            (n) => n.innerText?.trim() || ''
          );
        }
      } catch {
        content = '';
      }
    }

    return { subject, sender, content, isUnread };
  }

  /**
   * Apply an Outlook category to the currently open email.
   */
  async setCategory(categoryName) {
    if (!categoryName) return false;

    try {
      console.log(`    Setting category: ${categoryName}...`);

      // Click the Categorize button in the toolbar
      const btnSelector =
        'button[aria-label^="Categorize"], button[name*="Categorize"], [data-testid="CategorizeButton"]';
      await this.page.waitForSelector(btnSelector, { timeout: 5000 });
      await this.page.click(btnSelector);
      await delay(1000);

      // Find and click the specific category in the dropdown menu
      const categoryItem = await this.page.$(
        `button[role="menuitem"] span:has-text("${categoryName}"), [role="menuitem"] [title="${categoryName}"], [role="menuitemcheckbox"]:has-text("${categoryName}")`
      );

      if (categoryItem) {
        await categoryItem.click();
        console.log(`    Applied category "${categoryName}"`);
        await delay(500);
        return true;
      }

      console.warn(`    Category "${categoryName}" not found in menu.`);
      await this.page.keyboard.press('Escape');
      return false;
    } catch (err) {
      console.error(`    Error setting category "${categoryName}":`, err.message);
      await this.page.keyboard.press('Escape').catch(() => {});
      return false;
    }
  }

  /**
   * Mark the currently open email as unread to restore its original state.
   */
  async markAsUnread() {
    try {
      const selectors = [
        'button[aria-label="Mark as unread"]',
        'button[aria-label*="nread"]',
        '[data-testid="MarkAsUnread"]',
      ];

      for (const sel of selectors) {
        const btn = await this.page.$(sel);
        if (btn) {
          await btn.click();
          await delay(500);
          return true;
        }
      }

      // Fallback: use keyboard shortcut (Ctrl+U marks as unread in Outlook Web)
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('u');
      await this.page.keyboard.up('Control');
      return true;
    } catch (err) {
      console.error('Could not mark as unread:', err.message);
      return false;
    }
  }

  /**
   * Dismiss open menus or reading pane.
   */
  async pressEscape() {
    await this.page.keyboard.press('Escape').catch(() => {});
  }

  /**
   * Close the browser.
   */
  async close() {
    if (this.context) {
      await this.context.close();
    }
  }
}

module.exports = OutlookDriver;
