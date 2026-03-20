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
  async _ensureSortOrder() {
    this.logger.info('Ensuring reverse chronological order (newest first)...');
    try {
      // Look for the Filter/Sort button. Outlook often uses a button with "Filter" or a sort icon.
      // A common selector for the sort/filter button in the message list header:
      const filterButton = await this.page.$('button[data-automation-id="FilterButton"]');
      if (filterButton) {
        await filterButton.click();
        await this.page.waitForTimeout(1000);

        // Look for "Sort" in the menu
        const sortOption = await this.page.$('button[aria-label="Sort"], span:text("Sort")');
        if (sortOption) {
          await sortOption.click();
          await this.page.waitForTimeout(500);
        }

        // Look for "Newest on top"
        const newestOnTop = await this.page.$('button[aria-label="Newest on top"], span:text("Newest on top")');
        if (newestOnTop) {
          const isSelected = await newestOnTop.evaluate(el => el.getAttribute('aria-checked') === 'true' || el.classList.contains('is-checked'));
          if (!isSelected) {
            await newestOnTop.click();
            this.logger.info('Set sort order to "Newest on top".');
            await this.page.waitForTimeout(2000);
          } else {
            this.logger.info('Sort order is already "Newest on top".');
            // Click filter button again to close menu if still open
            await filterButton.click();
          }
        } else {
          this.logger.warn('Could not find "Newest on top" option in sort menu.');
          // Click filter button again to close menu
          await filterButton.click();
        }
      } else {
        this.logger.warn('Could not find Filter/Sort button. Proceeding with default order.');
      }
    } catch (err) {
      this.logger.error('Error ensuring sort order:', err.message);
    }
  }

  async _ensureInboxSelected() {
    this.logger.info('Ensuring Inbox is selected...');
    try {
      // Check if we are already in the inbox by looking at the header or sidebar
      const inboxLink = await this.page.$('div[title="Inbox"], a[title="Inbox"]');
      if (inboxLink) {
        const isSelected = await inboxLink.evaluate(el => el.getAttribute('aria-selected') === 'true' || el.classList.contains('is-selected'));
        if (!isSelected) {
          await inboxLink.click();
          this.logger.info('Selected Inbox from sidebar.');
          await this.page.waitForTimeout(2000);
        } else {
          this.logger.info('Inbox is already selected.');
        }
      }
    } catch (err) {
      this.logger.error('Error ensuring Inbox selection:', err.message);
    }
  }

  async searchUncategorized() {
    console.log('Loading inbox...');
    await this.page.goto(this.outlookUrl, { waitUntil: 'networkidle2' });
    await this._waitForInbox();
    await this._ensureInboxSelected();
    await this._ensureSortOrder();
  }

  /**
   * Find the next uncategorized email in the list, open it, and return its details.
   * Skips any emails that already have a category badge.
   * Returns null if no uncategorized emails are found.
   */
  async getNextEmail() {
    const allItems = await this.page.$$('div[role="option"]');
    if (!allItems.length) return null;

    let item = null;
    for (const el of allItems) {
      const hasCategory = await el.evaluate((node) => {
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
    return this._readEmailItem(item);
  }

  /**
   * Find the next email with a specific category badge, open it, and return its details.
   * Optionally skips emails that also have an exclude category (e.g. skip "Serif/Redraft").
   * Returns null if no matching emails are found.
   */
  async getNextEmailWithCategory(categoryName, excludeCategory = null) {
    const allItems = await this.page.$$('div[role="option"]');
    if (!allItems.length) return null;

    const targetLower = categoryName.toLowerCase();
    const excludeLower = excludeCategory ? excludeCategory.toLowerCase() : null;

    let item = null;
    for (const el of allItems) {
      const { hasTarget, hasExclude } = await el
        .evaluate(
          (node, target, exclude) => {
            const label = (node.getAttribute('aria-label') || '').toLowerCase();
            const badgeEls = node.querySelectorAll(
              '.O6uB9, [class*="category"], [class*="Category"]'
            );
            const badgeText = Array.from(badgeEls)
              .map((b) => (b.textContent || '').toLowerCase())
              .join(' ');
            const allText = label + ' ' + badgeText;
            return {
              hasTarget: allText.includes(target),
              hasExclude: exclude ? allText.includes(exclude) : false,
            };
          },
          targetLower,
          excludeLower
        )
        .catch(() => ({ hasTarget: false, hasExclude: false }));

      if (hasTarget && !hasExclude) {
        item = el;
        break;
      }
    }

    if (!item) return null;
    return this._readEmailItem(item);
  }

  /**
   * Shared helper: extract metadata from a list item, click to open, read body.
   */
  async _readEmailItem(item) {
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

    if (!sender && rowLabel) {
      const match =
        rowLabel.match(/From (.*?);/i) ||
        rowLabel.match(/From (.*?),/i) ||
        rowLabel.match(/From (.*?)\./i);
      if (match) sender = match[1].trim();
    }
    if (!subject && rowLabel) {
      const match =
        rowLabel.match(/Subject (.*?);/i) ||
        rowLabel.match(/Subject (.*?)\./i);
      if (match) subject = match[1].trim();
    }

    if (!sender || !subject) {
      const text = await item.innerText().catch(() => '');
      const parts = text.split('\n').filter((p) => p.trim().length > 2);
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

    await item.click();
    await delay(1500);

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
   * Toggle a category in the Categorize menu. Checks current state first.
   * @param {string} categoryName - category to toggle
   * @param {boolean} desiredState - true = ensure checked, false = ensure unchecked
   * @returns {boolean} success
   */
  async _toggleCategory(categoryName, desiredState) {
    if (!categoryName) return false;

    try {
      const action = desiredState ? 'Adding' : 'Removing';
      console.log(`    ${action} category: ${categoryName}...`);

      const btnSelector =
        'button[aria-label^="Categorize"], button[name*="Categorize"], [data-testid="CategorizeButton"]';
      await this.page.waitForSelector(btnSelector, { timeout: 5000 });
      await this.page.click(btnSelector);
      await delay(1000);

      // Find the category menu item (checkbox style)
      const menuItem = await this.page.$(
        `[role="menuitemcheckbox"]:has-text("${categoryName}"), ` +
          `button[role="menuitem"] span:has-text("${categoryName}"), ` +
          `[role="menuitem"] [title="${categoryName}"]`
      );

      if (!menuItem) {
        console.warn(`    Category "${categoryName}" not found in menu.`);
        await this.page.keyboard.press('Escape');
        return false;
      }

      // Check current state via aria-checked
      const isChecked = await menuItem
        .evaluate((el) => {
          const checkbox =
            el.closest('[role="menuitemcheckbox"]') || el;
          return checkbox.getAttribute('aria-checked') === 'true';
        })
        .catch(() => null);

      if (isChecked === desiredState) {
        // Already in the right state
        console.log(`    Category "${categoryName}" already ${desiredState ? 'applied' : 'removed'}.`);
        await this.page.keyboard.press('Escape');
        return true;
      }

      // Click to toggle
      await menuItem.click();
      console.log(`    ${desiredState ? 'Applied' : 'Removed'} category "${categoryName}"`);
      await delay(500);
      return true;
    } catch (err) {
      console.error(`    Error toggling category "${categoryName}":`, err.message);
      await this.page.keyboard.press('Escape').catch(() => {});
      return false;
    }
  }

  /**
   * Add a category to the currently open email (no-op if already present).
   */
  async addCategory(categoryName) {
    return this._toggleCategory(categoryName, true);
  }

  /**
   * Remove a category from the currently open email (no-op if not present).
   */
  async removeCategory(categoryName) {
    return this._toggleCategory(categoryName, false);
  }

  /**
   * Swap one category for another on the currently open email.
   * Opens the Categorize menu once, unchecks the old, checks the new.
   */
  async swapCategory(removeCategory, addCategory) {
    if (!removeCategory || !addCategory) return false;

    try {
      console.log(`    Swapping "${removeCategory}" -> "${addCategory}"...`);

      const btnSelector =
        'button[aria-label^="Categorize"], button[name*="Categorize"], [data-testid="CategorizeButton"]';
      await this.page.waitForSelector(btnSelector, { timeout: 5000 });
      await this.page.click(btnSelector);
      await delay(1000);

      // Uncheck the old category
      const oldItem = await this.page.$(
        `[role="menuitemcheckbox"]:has-text("${removeCategory}"), ` +
          `button[role="menuitem"] span:has-text("${removeCategory}")`
      );
      if (oldItem) {
        const isChecked = await oldItem
          .evaluate((el) => {
            const cb = el.closest('[role="menuitemcheckbox"]') || el;
            return cb.getAttribute('aria-checked') === 'true';
          })
          .catch(() => false);
        if (isChecked) {
          await oldItem.click();
          console.log(`    Removed "${removeCategory}"`);
          await delay(500);
        }
      }

      // Check the new category
      const newItem = await this.page.$(
        `[role="menuitemcheckbox"]:has-text("${addCategory}"), ` +
          `button[role="menuitem"] span:has-text("${addCategory}")`
      );
      if (newItem) {
        const isChecked = await newItem
          .evaluate((el) => {
            const cb = el.closest('[role="menuitemcheckbox"]') || el;
            return cb.getAttribute('aria-checked') === 'true';
          })
          .catch(() => false);
        if (!isChecked) {
          await newItem.click();
          console.log(`    Applied "${addCategory}"`);
          await delay(500);
        }
      }

      // Close the menu
      await this.page.keyboard.press('Escape').catch(() => {});
      return true;
    } catch (err) {
      console.error(`    Error swapping categories:`, err.message);
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
