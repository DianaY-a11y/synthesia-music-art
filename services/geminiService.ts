import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, AnalysisSchema } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function analyzeArtwork(base64Image: string): Promise<AnalysisResult> {
  try {
    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png', // Assuming PNG or compatible for generic upload
              data: cleanBase64
            }
          },
          {
            text: `Analyze this artwork. Extract metadata and determine appropriate musical parameters to procedurally generate a soundtrack for it.
            
            Visuals to Sound logic:
            - Chaotic/noisy images -> High roughness, chromatic/wholetone scales.
            - Calm/nature images -> Low roughness, pentatonic/major scales, pad instruments.
            - Dark/moody images -> Minor scales, drone instruments, high reverb.
            - Geometric/structured images -> Pluck/synth, steady tempo.
            `
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: AnalysisSchema,
        systemInstruction: "You are an expert art critic and music theorist. You translate visual art into sonic properties."
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    
    return JSON.parse(text) as AnalysisResult;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
}