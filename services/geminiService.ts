import { GoogleGenAI, Type } from "@google/genai";
import { FinancialState, Recommendation } from "../types.ts";

const MODEL_NAME = 'gemini-3-flash-preview';

export class GeminiService {
  async analyzeDocument(base64Data: string, mimeType: string): Promise<Partial<FinancialState>> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    
    const prompt = `Analyze this financial document. Extract income, expenses, and debts. 
    Return a clean JSON object.
    
    CRITICAL CONSISTENCY RULES: 
    1. DATE: Strictly YYYY-MM-DD. Use the date printed on the document.
    2. DESCRIPTION: You must be extremely consistent. Extract the merchant or employer BRAND NAME ONLY. 
       - DO NOT include store numbers, dates, locations, or sequence codes in the description.
       - EXAMPLE: "PURCHASE STARBUCKS #1234 SEATTLE" -> "STARBUCKS".
       - EXAMPLE: "PAYROLL ADPR - GOOGLE INC" -> "GOOGLE".
    3. REFERENCE NUMBER: Always extract any unique ID, Check #, or Confirmation # if it exists. This is the most important field for deduplication.
    4. ACCOUNTS: Last 4 digits only. If not found, return null.
    5. TYPE: Strictly 'credit' for money in, 'debit' for money out.
    6. CATEGORY: Strictly 'income', 'expense', 'debt_payment', or 'other'.`;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { inlineData: { data: base64Data, mimeType } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            monthlyIncome: { type: Type.NUMBER },
            transactions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  date: { type: Type.STRING },
                  description: { type: Type.STRING },
                  amount: { type: Type.NUMBER },
                  category: { type: Type.STRING },
                  transactionType: { type: Type.STRING },
                  sourceAccount: { type: Type.STRING },
                  destinationAccount: { type: Type.STRING },
                  referenceNumber: { type: Type.STRING }
                },
                required: ["date", "description", "amount", "transactionType"]
              }
            },
            debts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  balance: { type: Type.NUMBER },
                  interestRate: { type: Type.NUMBER },
                  minimumPayment: { type: Type.NUMBER }
                }
              }
            }
          }
        }
      }
    });

    try {
      const text = response.text || '{}';
      return JSON.parse(text);
    } catch (e) {
      console.error("Failed to parse AI response", e);
      return {};
    }
  }

  async generateFinancialPlan(state: FinancialState): Promise<{ analysis: string; recommendations: Recommendation[] }> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    
    const prompt = `Act as a world-class financial advisor. Based on the following financial state:
    - Monthly Income: $${state.monthlyIncome}
    - Recent Transactions: ${JSON.stringify(state.transactions.slice(0, 15))}
    - Current Debts: ${JSON.stringify(state.debts)}
    - Financial Goals: ${JSON.stringify(state.goals)}
    
    Provide a comprehensive analysis and an action plan.`;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            analysis: { type: Type.STRING },
            recommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  impact: { type: Type.STRING },
                  steps: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["title", "description", "impact", "steps"]
              }
            }
          },
          required: ["analysis", "recommendations"]
        }
      }
    });

    try {
      const text = response.text || '{}';
      return JSON.parse(text);
    } catch (e) {
      console.error("Failed to parse AI response", e);
      return { analysis: "Error generating plan.", recommendations: [] };
    }
  }
}
