/**
 * Category Decision Engine
 * 
 * Pure classification logic — no browser interaction.
 * Takes email metadata and returns a category decision.
 */

const CATEGORIES = {
  APPLICANT: '26-27 Applicant Follow Up',
  NEEDS_RESPONSE: '1: Needs Response',
  WAITING: '3: Waiting for Reply',
  DONE: '4: Done',
  FYI: '2: FYI',
};

// Priority order per spec Section 9
const PRIORITY = [
  CATEGORIES.APPLICANT,
  CATEGORIES.NEEDS_RESPONSE,
  CATEGORIES.WAITING,
  CATEGORIES.DONE,
  CATEGORIES.FYI,
];

const APPROVED_CATEGORIES = new Set(Object.values(CATEGORIES));

// ─── Keyword / Pattern Banks ────────────────────────────────────────────

const APPLICANT_PATTERNS = [
  /\bapplicant/i, /\brecruitment/i, /\binterview/i, /\bcandidat/i,
  /\bplacement/i, /\btrainee/i, /\bapplication\b/i, /\branking/i,
  /\bportal\b/i, /\bmatch\b/i, /\bintern\b/i, /\bpracticum/i,
  /\bexternship/i, /\bpostdoc/i, /\bfellow/i, /\bresidency/i,
  /\b20[2-3][4-9]\s*[-–]\s*20[2-3][5-9]/i,  // year ranges like 2026-2027
  /\b26\s*[-–]\s*27\b/i,                     // shorthand 26-27
  /\bappic/i, /\bcas\b/i,                    // application portals
];

const NEEDS_RESPONSE_PATTERNS = [
  /\bcan you\b/i, /\bcould you\b/i, /\bwould you\b/i,
  /\bplease (send|provide|confirm|review|approve|complete|submit|share|let me know|respond)/i,
  /\bdo you have\b/i, /\bwhat (is|are|do|should|would)\b/i,
  /\bwhen (can|will|should|are|is)\b/i,
  /\bare you (available|able|free|interested)/i,
  /\blet me know\b/i, /\bget back to me\b/i,
  /\baction required\b/i, /\baction needed\b/i,
  /\byour (approval|input|feedback|decision|response|signature|confirmation)\b/i,
  /\bdeadline\b/i, /\bby (monday|tuesday|wednesday|thursday|friday|tomorrow|end of|eod|eow|cop)/i,
  /\brsvp\b/i, /\bplease (rsvp|reply|respond)/i,
  /\bapproval needed\b/i, /\bsign and return\b/i,
  /\bschedule\b.*\b(call|meeting|time)\b/i,
  /\?/,  // questions are a signal (weak, combined with others)
];

const WAITING_PATTERNS = [
  /\bi('ll| will) (get back|follow up|send|review|check|look into|respond)/i,
  /\bwill get back to you\b/i, /\bworking on (it|this|that)\b/i,
  /\bpending\b/i, /\bin progress\b/i,
  /\bgive me (a moment|some time|a few days)/i,
  /\bwill follow up\b/i, /\bwill send\b/i, /\bwill let you know\b/i,
  /\breceived.*(will|and)\b/i,
  /\bthanks.*i('ll| will)\b/i,
  /\bnoted.*will\b/i, /\bgot it.*will\b/i,
];

const DONE_PATTERNS = [
  /\bthank(s| you)\b.*\b(for|so much|very much)\b/i,
  /\ball (set|done|good|taken care of)\b/i,
  /\bcompleted\b/i, /\bfinalized\b/i, /\bconfirmed\b/i,
  /\bno (further|additional|more) (action|steps|items)\b/i,
  /\bsounds good\b/i, /\bperfect\b/i,
  /\bmeeting went well\b/i, /\bsuccessfully\b/i,
  /\bclosing (the|this) (loop|out|item)\b/i,
  /\bnothing else needed\b/i,
  /\bresolved\b/i, /\bwrapped up\b/i,
];

const FYI_PATTERNS = [
  /\bfyi\b/i, /\bfor your (information|awareness|reference|records)\b/i,
  /\bjust (wanted to|letting you|a heads up|sharing|an update|to let)/i,
  /\bannouncement\b/i, /\bupdate\b/i, /\breminder\b/i,
  /\bno (action|response) (needed|required|necessary)\b/i,
  /\bplease (note|be aware|see below|see attached)\b/i,
  /\bheads up\b/i, /\bsharing this\b/i,
];

// ─── Classification Logic ───────────────────────────────────────────────

function scorePatterns(text, patterns) {
  let score = 0;
  const matched = [];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      score++;
      matched.push(pat.source);
    }
  }
  return { score, matched };
}

/**
 * Classify an email based on its content.
 * 
 * @param {Object} email
 * @param {string} email.subject
 * @param {string} email.sender
 * @param {string} email.body - Full body text (or preview if body unavailable)
 * @param {string} email.preview - Preview snippet
 * @param {string|null} email.existingCategory - Currently assigned category
 * @param {string[]} [email.threadSnippets] - Previous messages in thread
 * @returns {{ category: string|null, confidence: 'high'|'medium'|'low', reason: string, action: 'apply'|'update'|'remove'|'skip' }}
 */
function classifyEmail(email) {
  const { subject = '', sender = '', body = '', preview = '', existingCategory = null } = email;

  // Combine all text for analysis
  const fullText = [subject, body || preview].join('\n');

  // Score each category
  const scores = {
    [CATEGORIES.APPLICANT]:       scorePatterns(fullText, APPLICANT_PATTERNS),
    [CATEGORIES.NEEDS_RESPONSE]:  scorePatterns(fullText, NEEDS_RESPONSE_PATTERNS),
    [CATEGORIES.WAITING]:         scorePatterns(fullText, WAITING_PATTERNS),
    [CATEGORIES.DONE]:            scorePatterns(fullText, DONE_PATTERNS),
    [CATEGORIES.FYI]:             scorePatterns(fullText, FYI_PATTERNS),
  };

  // Determine best category using priority order
  let bestCategory = null;
  let bestScore = 0;
  let bestMatched = [];

  for (const cat of PRIORITY) {
    const { score, matched } = scores[cat];
    // Require minimum threshold to classify
    const threshold = cat === CATEGORIES.APPLICANT ? 1 : 2;
    if (score >= threshold && score > bestScore) {
      bestCategory = cat;
      bestScore = score;
      bestMatched = matched;
    }
  }

  // Special: if applicant patterns match at all (even 1), and another category
  // also matches, applicant wins per priority rule
  if (scores[CATEGORIES.APPLICANT].score >= 1 && bestCategory !== CATEGORIES.APPLICANT) {
    // Applicant has highest priority — override
    bestCategory = CATEGORIES.APPLICANT;
    bestScore = scores[CATEGORIES.APPLICANT].score;
    bestMatched = scores[CATEGORIES.APPLICANT].matched;
  }

  // Confidence level
  let confidence;
  if (bestScore >= 4) confidence = 'high';
  else if (bestScore >= 2) confidence = 'medium';
  else confidence = 'low';

  // If no category hits threshold, leave uncategorized
  if (!bestCategory) {
    // If there's an existing category, check if we should remove it
    if (existingCategory && APPROVED_CATEGORIES.has(existingCategory)) {
      return {
        category: null,
        confidence: 'low',
        reason: `No confident replacement for existing "${existingCategory}". Removing per category removal rule.`,
        action: 'remove',
        matchDetails: scores,
      };
    }
    return {
      category: null,
      confidence: 'low',
      reason: 'Insufficient confidence to assign any category. Leaving uncategorized.',
      action: 'skip',
      matchDetails: scores,
    };
  }

  // Determine action
  let action;
  let reason;

  if (!existingCategory || !APPROVED_CATEGORIES.has(existingCategory)) {
    action = 'apply';
    reason = `Applying "${bestCategory}" (score: ${bestScore}, confidence: ${confidence}). Matched: ${bestMatched.slice(0, 3).join(', ')}`;
  } else if (existingCategory === bestCategory) {
    action = 'skip';
    reason = `Existing category "${existingCategory}" still correct (score: ${bestScore}). No change needed.`;
  } else {
    action = 'update';
    reason = `Updating from "${existingCategory}" to "${bestCategory}" (score: ${bestScore}, confidence: ${confidence}). Matched: ${bestMatched.slice(0, 3).join(', ')}`;
  }

  return {
    category: bestCategory,
    confidence,
    reason,
    action,
    matchDetails: scores,
  };
}

module.exports = { classifyEmail, CATEGORIES, APPROVED_CATEGORIES, PRIORITY };
