/**
 * Microsoft Graph API client for Outlook email operations.
 * Drop-in replacement for OutlookDriver (outlook.js) — same interface,
 * but uses API calls instead of Playwright browser automation.
 *
 * ~100x faster: no browser, no DOM scraping, no click-and-wait.
 */
const { Client } = require('@microsoft/microsoft-graph-client');
const { createMsalClient, getAccessToken } = require('./graph-auth');
const config = require('./config');

const GRAPH_SCOPES = ['Mail.Read', 'Mail.ReadWrite'];

class GraphOutlookClient {
  constructor() {
    this.client = null;
    this.msalApp = null;
    this._currentMessages = [];
    this._currentIndex = 0;
    this._currentOpenMessage = null;
  }

  /**
   * Authenticate and create Graph client. Replaces browser init.
   */
  async init() {
    console.log('Authenticating with Microsoft Graph...');

    this.msalApp = createMsalClient(config);
    const accessToken = await getAccessToken(this.msalApp, GRAPH_SCOPES);

    this.client = Client.init({
      authProvider: (done) => done(null, accessToken),
    });

    // Verify access
    const user = await this.client.api('/me').select('displayName,mail').get();
    console.log(`Authenticated as: ${user.displayName} (${user.mail})\n`);
  }

  /**
   * Load inbox messages. Replaces searchUncategorized().
   */
  async searchUncategorized() {
    console.log('Fetching uncategorized inbox messages...');

    // Fetch messages with no categories
    // Graph API: messages where categories collection is empty
    const response = await this.client
      .api('/me/mailFolders/inbox/messages')
      .filter('categories/any() eq false')
      .select('id,subject,from,body,isRead,categories,conversationId,receivedDateTime')
      .top(config.maxMessages)
      .orderby('receivedDateTime desc')
      .get();

    this._currentMessages = response.value || [];
    this._currentIndex = 0;

    console.log(`Found ${this._currentMessages.length} uncategorized messages.\n`);
  }

  /**
   * Get next uncategorized email. Returns same shape as OutlookDriver.
   */
  async getNextEmail() {
    if (this._currentIndex >= this._currentMessages.length) return null;

    const msg = this._currentMessages[this._currentIndex++];
    this._currentOpenMessage = msg;

    return this._formatMessage(msg);
  }

  /**
   * Load messages with a specific category. Used by verify.js and catch-missed.js.
   * @param {string} categoryName - category to filter for
   * @param {string|null} excludeCategory - skip messages also having this category
   */
  async loadMessagesWithCategory(categoryName, excludeCategory = null) {
    console.log(`Fetching "${categoryName}" messages...`);

    // Graph API filter for messages containing a specific category
    const filterStr = `categories/any(c: c eq '${categoryName}')`;

    const response = await this.client
      .api('/me/mailFolders/inbox/messages')
      .filter(filterStr)
      .select('id,subject,from,body,isRead,categories,conversationId,receivedDateTime')
      .top(config.maxMessages)
      .orderby('receivedDateTime desc')
      .get();

    let messages = response.value || [];

    // Client-side exclude filter
    if (excludeCategory) {
      const excLower = excludeCategory.toLowerCase();
      messages = messages.filter(
        (m) => !m.categories.some((c) => c.toLowerCase() === excLower)
      );
    }

    this._currentMessages = messages;
    this._currentIndex = 0;

    console.log(`Found ${this._currentMessages.length} messages.\n`);
  }

  /**
   * Get next email with a specific category. Same interface as OutlookDriver.
   */
  async getNextEmailWithCategory(categoryName, excludeCategory = null) {
    // Lazy-load on first call
    if (this._currentMessages.length === 0 && this._currentIndex === 0) {
      await this.loadMessagesWithCategory(categoryName, excludeCategory);
    }

    if (this._currentIndex >= this._currentMessages.length) return null;

    const msg = this._currentMessages[this._currentIndex++];
    this._currentOpenMessage = msg;

    return this._formatMessage(msg);
  }

  /**
   * Apply a category to the currently open email (replaces setCategory).
   */
  async setCategory(categoryName) {
    if (!this._currentOpenMessage || !categoryName) return false;

    try {
      const newCategories = [...new Set([
        ...(this._currentOpenMessage.categories || []),
        categoryName,
      ])];

      await this.client
        .api(`/me/messages/${this._currentOpenMessage.id}`)
        .patch({ categories: newCategories });

      this._currentOpenMessage.categories = newCategories;
      console.log(`    Applied category "${categoryName}"`);
      return true;
    } catch (err) {
      console.error(`    Error setting category "${categoryName}":`, err.message);
      return false;
    }
  }

  /**
   * Add a category (same as setCategory but named for clarity).
   */
  async addCategory(categoryName) {
    return this.setCategory(categoryName);
  }

  /**
   * Remove a category from the currently open email.
   */
  async removeCategory(categoryName) {
    if (!this._currentOpenMessage || !categoryName) return false;

    try {
      const newCategories = (this._currentOpenMessage.categories || []).filter(
        (c) => c.toLowerCase() !== categoryName.toLowerCase()
      );

      await this.client
        .api(`/me/messages/${this._currentOpenMessage.id}`)
        .patch({ categories: newCategories });

      this._currentOpenMessage.categories = newCategories;
      console.log(`    Removed category "${categoryName}"`);
      return true;
    } catch (err) {
      console.error(`    Error removing category "${categoryName}":`, err.message);
      return false;
    }
  }

  /**
   * Swap one category for another in a single PATCH call.
   */
  async swapCategory(removeCat, addCat) {
    if (!this._currentOpenMessage) return false;

    try {
      let cats = (this._currentOpenMessage.categories || []).filter(
        (c) => c.toLowerCase() !== removeCat.toLowerCase()
      );
      cats = [...new Set([...cats, addCat])];

      await this.client
        .api(`/me/messages/${this._currentOpenMessage.id}`)
        .patch({ categories: cats });

      this._currentOpenMessage.categories = cats;
      console.log(`    Swapped "${removeCat}" -> "${addCat}"`);
      return true;
    } catch (err) {
      console.error(`    Error swapping categories:`, err.message);
      return false;
    }
  }

  /**
   * Mark the currently open email as unread.
   */
  async markAsUnread() {
    if (!this._currentOpenMessage) return false;

    try {
      await this.client
        .api(`/me/messages/${this._currentOpenMessage.id}`)
        .patch({ isRead: false });
      return true;
    } catch (err) {
      console.error('Could not mark as unread:', err.message);
      return false;
    }
  }

  /**
   * No-op for API mode (no reading pane to dismiss).
   */
  async pressEscape() {}

  /**
   * No-op for API mode (no browser to close).
   */
  async close() {
    console.log('Done. (No browser to close in API mode.)');
  }

  /**
   * Format a Graph API message into the shape expected by the entry points.
   */
  _formatMessage(msg) {
    const sender =
      msg.from?.emailAddress?.name ||
      msg.from?.emailAddress?.address ||
      '(unknown)';
    const subject = msg.subject || '(no subject)';

    // Strip HTML from body if needed
    let content = '';
    if (msg.body) {
      if (msg.body.contentType === 'text') {
        content = msg.body.content || '';
      } else {
        // Strip HTML tags for classification
        content = (msg.body.content || '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, ' ')
          .trim();
      }
    }

    return {
      subject,
      sender,
      content,
      isUnread: !msg.isRead,
    };
  }
}

module.exports = GraphOutlookClient;
