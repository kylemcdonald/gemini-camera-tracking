import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const generationConfig = {
  temperature: 0.7,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
};

export async function POST(request) {
  try {
    const { prompt, image } = await request.json();

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig,
    });

    let result;
    
    if (image) {
      // If image is provided, use multimodal generation
      const imageData = image.split(',')[1]; // Remove data URL prefix
      
      result = await model.generateContent([
        {
          inlineData: {
            data: imageData,
            mimeType: "image/jpeg"
          }
        },
        prompt
      ]);
    } else {
      // Text-only generation
      result = await model.generateContent(prompt);
    }
    
    const response = await result.response;
    const text = response.text();

    try {
      // Parse markdown JSON block if present
      let jsonData;
      const jsonBlockMatch = text.match(/```json\n([\s\S]*?)\n```/);
      if (jsonBlockMatch) {
        jsonData = JSON.parse(jsonBlockMatch[1]);
      } else {
        // If no markdown block, try parsing the entire text as JSON
        jsonData = JSON.parse(text);
      }

      return Response.json(jsonData);
    } catch (parseError) {
      console.error('Error parsing JSON from Gemini response:', parseError);
      return Response.json({ 
        error: 'Failed to parse JSON from Gemini response', 
        originalText: text 
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Error generating response:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
} 