const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./env-load');

/**
 * AI Email Classifier using Google Gemini.
 */
const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
const model = genAI.getGenerativeModel({ model: config.gemini.model });

const defaultCategories = ['Patients', 'Providers', 'DrHH', 'Admin', 'Newsletter'];

/**
 * Classifies an email based on its subject and content.
 * @param {string} subject 
 * @param {string} content 
 * @returns {Promise<string>} The category name
 */
async function classify(subject, content) {
  const allowedCategories = config.sorting.categories.length > 0 ? config.sorting.categories : defaultCategories;
  
  // Create a structured list for the prompt
  const categoriesList = allowedCategories.join('\n- ');

  const prompt = `
    You are a professional medical assistant for Dr. HH. 
    Your task is to classify an email into EXACTLY ONE of the following folders:
    ${allowedCategories.join(', ')}

    Classification Guidelines:
    - Patients: Emails from people seeking medical advice, booking appointments, or describing symptoms.
    - Providers: Emails from labs, other doctors, or insurance companies about patient records.
    - DrHH: Personal or professional direct communication for the doctor.
    - Admin: Bills, billing inquiries, office logistics, software updates.
    - Newsletter: Health journals, medical news, updates from medical boards.

    Return ONLY the folder name. ABSOLUTELY NO extra text, reasoning, or punctuation.
    If the email doesn't clearly fit, return "Unknown".

    Subject: ${subject}
    Email Body:
    ${content.slice(0, 5000)}
  `;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1, // Keep it deterministic
        topK: 1,
        topP: 1,
      }
    });
    
    const response = await result.response;
    let category = response.text().trim();
    
    // Clean up any extra formatting Gemini might add (like bullet points or quotes)
    category = category.replace(/^[-*"]|["']$/g, '').replace(/\.$/, '').trim();
    
    // Case-insensitive matching to ensure robustness
    const matchedCategory = allowedCategories.find(c => c.toLowerCase() === category.toLowerCase());
    return matchedCategory || 'Unknown';
  } catch (error) {
    console.error(`ERROR in classification for subject: "${subject}":`, error.message);
    return 'Unknown';
  }
}

module.exports = {
  classify
};
