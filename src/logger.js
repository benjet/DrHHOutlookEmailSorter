/**
 * Action Logger
 * 
 * Records all classification decisions to a JSON log file for audit.
 */

const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    const logsDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logPath = path.join(logsDir, `sort_log_${timestamp}.json`);
    this.entries = [];
    this.stats = {
      total: 0,
      applied: 0,
      updated: 0,
      removed: 0,
      skipped: 0,
      errors: 0,
    };
  }

  /**
   * Log info message to console
   */
  info(...args) {
    console.log('ℹ️', ...args);
  }

  /**
   * Log warning message to console
   */
  warn(...args) {
    console.warn('⚠️', ...args);
  }

  /**
   * Log error message to console
   */
  error(...args) {
    console.error('❌', ...args);
  }

  /**
   * Log notice message to console
   */
  notice(...args) {
    console.log('🔔', ...args);
  }

  /**
   * Log and record a classification decision
   */
  log(entry) {
    const record = {
      timestamp: new Date().toISOString(),
      index: this.entries.length + 1,
      ...entry,
    };
    this.entries.push(record);
    this.stats.total++;

    if (entry.action === 'apply') this.stats.applied++;
    else if (entry.action === 'update') this.stats.updated++;
    else if (entry.action === 'remove') this.stats.removed++;
    else if (entry.action === 'skip') this.stats.skipped++;
    else if (entry.action === 'error') this.stats.errors++;

    // Write after each entry for safety
    this._flush();

    // Console output
    const icon = {
      apply: '✅', update: '🔄', remove: '❌', skip: '⏭️', error: '⚠️',
    }[entry.action] || '•';

    console.log(
      `  ${icon} [${record.index}] ${entry.subject?.substring(0, 60) || '(no subject)'}` +
      `\n     ${entry.action?.toUpperCase() || 'ACTION'}: ${entry.reason || entry.category || ''}`
    );
  }

  _flush() {
    const output = {
      runTimestamp: this.entries[0]?.timestamp,
      stats: this.stats,
      entries: this.entries,
    };
    fs.writeFileSync(this.logPath, JSON.stringify(output, null, 2));
  }

  printSummary() {
    console.log('\n' + '═'.repeat(60));
    console.log('  SORT COMPLETE — Summary');
    console.log('═'.repeat(60));
    console.log(`  Total processed:  ${this.stats.total}`);
    console.log(`  Applied:          ${this.stats.applied}`);
    console.log(`  Updated:          ${this.stats.updated}`);
    console.log(`  Removed:          ${this.stats.removed}`);
    console.log(`  Skipped:          ${this.stats.skipped}`);
    console.log(`  Errors:           ${this.stats.errors}`);
    console.log(`\n  Log saved to: ${this.logPath}`);
    console.log('═'.repeat(60) + '\n');
  }
}

// Export a singleton instance
module.exports = new Logger();
