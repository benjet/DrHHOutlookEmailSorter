const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./config');

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const model = genAI.getGenerativeModel({ model: config.geminiModel });

const VALID_CATEGORIES = [
  '1: Needs Response',
  '2: FYI',
  '3: Waiting for Reply',
  '4: Done',
];

/**
 * Classify an email into one of the 4 action categories using Gemini AI.
 * Returns the category string, or 'Unknown' if uncertain.
 */
async function classify({ subject, sender, content }) {
  const prompt = `You are an email triage assistant for a medical professional (Dr. HH).
Your task is to classify a single email into EXACTLY ONE of these categories:

- "1: Needs Response" — There is an explicit or implied ask directed to Dr. HH and they still owe a reply or action.
- "2: FYI" — The email is informational only, does not ask for a reply, and does not require action from Dr. HH.
- "3: Waiting for Reply" — Dr. HH has already replied and the next move belongs to someone else.
- "4: Done" — Dr. HH has already replied and the thread appears resolved or no further action is needed.

Decision rules:
- Do NOT assign "2: FYI" if there is any explicit or implied ask directed to Dr. HH, even if not phrased as a question.
- Do NOT assign "2: FYI" if the email includes an attachment, deadline, request for review, or invitation directed to Dr. HH, unless the thread clearly shows no action is needed.
- Do NOT assign "4: Done" unless the thread clearly appears complete.
- If Dr. HH's reply status cannot be confirmed, leave it unclassified.
- Be conservative. If the email is ambiguous, confidence is low, or it contains mixed signals, return "Unknown".
- Prefer false negatives over false positives — it is better to return "Unknown" than to assign the wrong category.

Return ONLY the category string exactly as shown above (e.g. "1: Needs Response"), or "Unknown". No extra text, reasoning, or punctuation.

From: ${sender || '(unknown)'}
Subject: ${subject || '(no subject)'}
Body:
${(content || '').slice(0, 5000)}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        topK: 1,
        topP: 1,
      },
    });

    const response = await result.response;
    let category = response.text().trim();

    // Clean up formatting artifacts
    category = category.replace(/^[\s\-*"'`]+|[\s\-*"'`.,]+$/g, '').trim();

    // Match against valid categories (case-insensitive)
    const matched = VALID_CATEGORIES.find(
      (c) => c.toLowerCase() === category.toLowerCase()
    );
    return matched || 'Unknown';
  } catch (err) {
    console.error(`Classification error for "${subject}":`, err.message);
    return 'Unknown';
  }
}

/**
 * Re-verify an email currently tagged "1: Needs Response".
 * Returns a new category string if miscategorized, or 'Unchanged' if correct/ambiguous.
 */
const VERIFY_VALID = ['2: FYI', '3: Waiting for Reply', '4: Done', 'Unchanged'];

async function verifyNeedsResponse({ subject, sender, content }) {
  const prompt = `You are an email triage assistant for a medical professional (Dr. HH).
This email is CURRENTLY categorized as "1: Needs Response". Your task is to verify whether that is correct.

Re-evaluate and determine the SINGLE best category:
- "2: FYI" — The thread is informational only, does not ask for a reply, and does not require action from Dr. HH.
- "3: Waiting for Reply" — Dr. HH has already replied and the next move belongs to someone else.
- "4: Done" — Dr. HH has already replied and the thread appears resolved or no further action is needed.
- "Unchanged" — The email truly needs a response from Dr. HH, OR the status is ambiguous/unclear.

Decision rules:
- Change to "2: FYI" when the thread is informational only, does not ask for a reply, and does not require action from Dr. HH.
- Change to "3: Waiting for Reply" when Dr. HH has already replied and the next move belongs to someone else.
- Change to "4: Done" when Dr. HH has already replied and the thread appears resolved, closed, or no further response is needed.
- Return "Unchanged" if Dr. HH truly still owes a response or action.
- Return "Unchanged" if it is unclear whether Dr. HH already replied.
- Return "Unchanged" if the thread is ambiguous or contains mixed signals.
- Be conservative. If unsure, return "Unchanged".
- Prefer false negatives over false positives — it is better to leave the category unchanged than to reclassify incorrectly.

Return ONLY the category string exactly as shown above, or "Unchanged". No extra text, reasoning, or punctuation.

From: ${sender || '(unknown)'}
Subject: ${subject || '(no subject)'}
Body:
${(content || '').slice(0, 5000)}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, topK: 1, topP: 1 },
    });

    const response = await result.response;
    let answer = response.text().trim();
    answer = answer.replace(/^[\s\-*"'`]+|[\s\-*"'`.,]+$/g, '').trim();

    const matched = VERIFY_VALID.find(
      (c) => c.toLowerCase() === answer.toLowerCase()
    );
    return matched || 'Unchanged';
  } catch (err) {
    console.error(`Verify error for "${subject}":`, err.message);
    return 'Unchanged';
  }
}

/**
 * Check whether an email tagged "1: Needs Response" is a missed response
 * where Dr. HH clearly still owes a reply.
 * Returns true (add "Serif/Redraft") or false (leave unchanged).
 */
async function detectMissedResponse({ subject, sender, content }) {
  const prompt = `You are an email triage assistant for a medical professional (Dr. HH).
This email is currently categorized as "1: Needs Response".

Your task: Determine whether Dr. HH clearly still owes a reply that appears to have been missed or is overdue.

Return "true" ONLY when ALL of the following are met:
1. There is an explicit or implied ask directed to Dr. HH.
2. The thread shows that Dr. HH has NOT yet responded.
3. The email appears to have been waiting for a response (not just received).

Return "false" if:
- Dr. HH has already replied (even partially).
- The most recent meaningful message in the thread is from Dr. HH.
- The thread is informational only.
- The conversation appears resolved or closed.
- The status is ambiguous or confidence is low.
- It is unclear whether Dr. HH already replied.

Be very conservative. Only return "true" when there is CLEAR evidence that Dr. HH missed responding or still owes a reply. Prefer "false" over "true".

Return ONLY "true" or "false". No extra text, reasoning, or punctuation.

From: ${sender || '(unknown)'}
Subject: ${subject || '(no subject)'}
Body:
${(content || '').slice(0, 5000)}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, topK: 1, topP: 1 },
    });

    const response = await result.response;
    const answer = response.text().trim().toLowerCase();
    return answer === 'true' || answer === 'yes';
  } catch (err) {
    console.error(`Missed-response detection error for "${subject}":`, err.message);
    return false;
  }
}

module.exports = { classify, verifyNeedsResponse, detectMissedResponse, VALID_CATEGORIES };
