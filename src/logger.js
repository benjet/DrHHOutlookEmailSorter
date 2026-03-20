const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    const logsDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logPath = path.join(logsDir, `sort_log_${timestamp}.md`);
    this.entries = [];
    this.stats = { total: 0, applied: 0, skipped: 0, errors: 0 };
    this._headerWritten = false;
  }

  info(...args) {
    console.log(...args);
  }

  warn(...args) {
    console.warn('WARNING:', ...args);
  }

  error(...args) {
    console.error('ERROR:', ...args);
  }

  log(entry) {
    const record = {
      timestamp: new Date().toISOString(),
      index: this.entries.length + 1,
      ...entry,
    };
    this.entries.push(record);
    this.stats.total++;

    if (entry.action === 'apply') this.stats.applied++;
    else if (entry.action === 'skip') this.stats.skipped++;
    else if (entry.action === 'error') this.stats.errors++;

    this._appendToFile(record);

    const icon = { apply: '+', skip: '-', error: '!' }[entry.action] || ' ';
    console.log(
      `  [${icon}] #${record.index} ${(entry.subject || '(no subject)').substring(0, 60)}` +
      `\n      ${(entry.action || '').toUpperCase()}: ${entry.category || ''} ${entry.reason ? '— ' + entry.reason : ''}`
    );
  }

  _appendToFile(record) {
    if (!this._headerWritten) {
      const header = `# Sort Log — ${record.timestamp}\n\n` +
        '| # | Action | Subject | Sender | Category | Reason |\n' +
        '|---|--------|---------|--------|----------|--------|\n';
      fs.writeFileSync(this.logPath, header);
      this._headerWritten = true;
    }

    const esc = (s) => (s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').substring(0, 80);
    const row = `| ${record.index} | ${esc(record.action)} | ${esc(record.subject)} | ${esc(record.sender)} | ${esc(record.category)} | ${esc(record.reason)} |\n`;
    fs.appendFileSync(this.logPath, row);
  }

  printSummary() {
    const summary = '\n' + '='.repeat(50) +
      '\n  SORT COMPLETE\n' +
      '='.repeat(50) +
      `\n  Total:   ${this.stats.total}` +
      `\n  Applied: ${this.stats.applied}` +
      `\n  Skipped: ${this.stats.skipped}` +
      `\n  Errors:  ${this.stats.errors}` +
      `\n\n  Log: ${this.logPath}\n` +
      '='.repeat(50) + '\n';
    console.log(summary);

    // Append summary to log file
    if (this._headerWritten) {
      const mdSummary = `\n## Summary\n\n` +
        `- **Total**: ${this.stats.total}\n` +
        `- **Applied**: ${this.stats.applied}\n` +
        `- **Skipped**: ${this.stats.skipped}\n` +
        `- **Errors**: ${this.stats.errors}\n`;
      fs.appendFileSync(this.logPath, mdSummary);
    }
  }
}

module.exports = new Logger();
