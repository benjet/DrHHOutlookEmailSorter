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

module.exports = { classify, VALID_CATEGORIES };
