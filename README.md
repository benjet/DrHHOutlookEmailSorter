# Outlook Inbox Category Sorter

Automated Outlook inbox triage — reviews messages and applies the correct category.

## Categories

| Category | When to Apply |
|---|---|
| **26-27 Applicant Follow Up** | Applicant/interview/recruitment for 2026-27 cycle |
| **1: Needs Response** | Direct questions, approval requests, scheduling asks |
| **3: Waiting for Reply** | User already acted, waiting on someone else |
| **4: Done** | Thread complete, no further action needed |
| **2: FYI** | Informational only, no action required |

## Quick Start

```bash
# 1. Install dependencies (already done)
npm install

# 2. First run — DRY RUN (preview decisions, no changes applied)
npm run dry-run

# 3. Live run (applies categories for real)
npm start
```

## Configuration (.env)

| Variable | Default | Description |
|---|---|---|
| `BATCH_SIZE` | 10 | Messages to process per run |
| `DRY_RUN` | true | Preview only — set to `false` for live mode |
| `MESSAGE_DELAY` | 1500 | Pause (ms) between messages |
| `OUTLOOK_URL` | outlook.office.com/mail/inbox | Outlook Web URL |
| `USER_DATA_DIR` | ./browser-data | Stores browser login session |

## How It Works

1. Opens Chromium with Outlook Web (you log in once, session is remembered)
2. Scans inbox messages up to `BATCH_SIZE`
3. For each message:
   - Captures read/unread state
   - Opens and reads full content
   - Classifies using pattern-matching rules
   - Applies, updates, or removes category (unless dry-run)
   - Restores unread state if it was changed
4. Logs all decisions to `logs/sort_log_<timestamp>.json`
5. Prints summary

## Logs

After each run, a JSON log is saved to `logs/` with:
- Every decision (apply, update, remove, skip, error)
- Confidence level and reasoning
- Before/after category state
- Summary statistics

## Safety

- **DRY_RUN=true** by default — nothing changes until you're ready
- Only modifies categories — never moves, deletes, flags, or archives
- Preserves read/unread state
- Leaves uncertain emails uncategorized
- Action log for full audit trail
