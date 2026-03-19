/**
 * Category Decision Engine
 * 
 * AI-powered classification logic using Google Gemini.
 * Takes email metadata and returns a category decision.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini
if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is not defined in environment variables.');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: 'gemini-1.5-flash',
  generationConfig: { responseMimeType: 'application/json' }
});

const CATEGORIES = {
  NEEDS_RESPONSE: '1: Needs Response',
  FYI: '2: FYI',
  WAITING: '3: Waiting for Reply',
  DONE: '4: Done',
};

const APPROVED_CATEGORIES = new Set(Object.values(CATEGORIES));

/**
 * Classify an email using Gemini AI.
 * 
 * @param {Object} email { subject, sender, body, preview, existingCategory }
 * @returns {Promise<{ category: string|null, confidence: string, reason: string, action: string }>}
 */
async function classifyEmail(email) {
  const { subject = '', sender = '', body = '', preview = '', existingCategory = null } = email;

  const prompt = `
    Classify the following email into one of these categories:
    - "${CATEGORIES.NEEDS_RESPONSE}": Use if there's an action for the recipient to take or a question to answer. High priority.
    - "${CATEGORIES.FYI}": Use for newsletters, notifications, or information sharing where no action is required.
    - "${CATEGORIES.WAITING}": Use if the recipient (DrHH) sent a message and is waiting for a reply from the sender.
    - "${CATEGORIES.DONE}": Use if the conversation is settled or "thank you" was the final exchange.

    Rules:
    - "Needs Response" takes priority over others.
    - If no category is clearly professional / productive, leave as null.
    - Return a JSON object with:
      {
        "category": string | null,
        "confidence": "high" | "medium" | "low",
        "reason": "Brief explanation of why this category was chosen",
        "action": "apply" | "update" | "remove" | "skip"
      }
    - "action" logic:
      - "apply" if existingCategory is None and category is not null.
      - "update" if category is different from existingCategory.
      - "remove" if category is null but existingCategory exists.
      - "skip" if category matches existingCategory or both are null.

    Email Metadata:
    - Subject: ${subject}
    - Sender: ${sender}
    - Existing Category: ${existingCategory || 'None'}
    - Preview: ${preview}
    - Body: ${body?.substring(0, 5000)}
  `;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const decision = JSON.parse(responseText);

    // Validate category is approved
    if (decision.category && !APPROVED_CATEGORIES.has(decision.category)) {
      decision.category = null;
      decision.action = existingCategory ? 'remove' : 'skip';
    }

    return decision;
  } catch (error) {
    console.error('  ❌ Gemini Classification Error:', error.message);
    return {
      category: existingCategory,
      confidence: 'low',
      reason: `AI Error: ${error.message}`,
      action: 'skip'
    };
  }
}

module.exports = { classifyEmail, CATEGORIES, APPROVED_CATEGORIES };
