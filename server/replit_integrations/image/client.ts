import { GoogleGenAI, Modality, Part } from "@google/genai";

let _ai: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!_ai) {
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("AI_INTEGRATIONS_GEMINI_API_KEY is not configured");
    }
    _ai = new GoogleGenAI({ apiKey });
  }
  return _ai;
}

// Lazy proxy: module can be imported without an API key.
// The key is only required when a method is actually called.
export const ai: GoogleGenAI = new Proxy({} as GoogleGenAI, {
  get(_, prop: string) {
    return (getAiClient() as any)[prop];
  },
});

/**
 * Generate an image and return as base64.
 * Uses gemini-2.5-flash-image (Nano Banana) model via Replit AI Integrations.
 * @param prompt - The text prompt for image generation
 * @param aspectRatio - Optional aspect ratio (e.g., "16:9", "4:3", "1:1"). Defaults to "1:1"
 */
export async function generateImageBase64(
  prompt: string, 
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" = "1:1"
): Promise<{ base64: string; mimeType: string }> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
      // @ts-ignore - aspectRatio may be supported in newer versions
      aspectRatio: aspectRatio,
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data in response");
  }

  return {
    base64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}

/**
 * Crop a generated image to horizontal 4:1 aspect ratio using sharp.
 * This is used as post-processing since Gemini doesn't always respect aspect ratio requests.
 */
export async function cropToHorizontalAspect(
  base64Image: string,
  mimeType: string
): Promise<{ base64: string; mimeType: string }> {
  const sharp = (await import('sharp')).default;
  
  const imgBuffer = Buffer.from(base64Image, 'base64');
  
  // Get image dimensions
  const metadata = await sharp(imgBuffer).metadata();
  const sourceWidth = metadata.width || 512;
  const sourceHeight = metadata.height || 512;
  
  // Target aspect ratio 4:1 (width:height)
  const targetRatio = 4;
  
  // Calculate crop dimensions
  // We want to extract the center portion at 4:1 ratio
  let cropWidth = sourceWidth;
  let cropHeight = Math.round(sourceWidth / targetRatio);
  
  // If the calculated height is larger than source, adjust
  if (cropHeight > sourceHeight) {
    cropHeight = sourceHeight;
    cropWidth = Math.round(sourceHeight * targetRatio);
  }
  
  // Ensure dimensions are within bounds
  cropWidth = Math.min(cropWidth, sourceWidth);
  cropHeight = Math.min(cropHeight, sourceHeight);
  
  // Calculate crop position (center of image)
  const cropX = Math.round((sourceWidth - cropWidth) / 2);
  const cropY = Math.round((sourceHeight - cropHeight) / 2);
  
  // Crop using sharp and convert to base64
  const outputBuffer = await sharp(imgBuffer)
    .extract({ left: cropX, top: cropY, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();
  
  const outputBase64 = outputBuffer.toString('base64');
  
  return {
    base64: outputBase64,
    mimeType: 'image/png',
  };
}

/**
 * Generate a square icon by having AI redraw ONLY the icon/symbol from the horizontal logo.
 * The AI analyzes the horizontal logo and recreates just the graphic element in a square format.
 */
export async function generateSquareIconFromLogo(
  horizontalLogoDataUrl: string,
  companyName: string,
  styleDescription: string
): Promise<{ base64: string; mimeType: string }> {
  // Extract base64 data from data URL
  const base64Match = horizontalLogoDataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!base64Match) {
    throw new Error("Invalid data URL format");
  }
  const [, mimeType, base64Data] = base64Match;
  
  const prompt = `I am showing you a horizontal banner logo. This logo contains TWO parts:
1. A GRAPHIC ICON/SYMBOL (usually on the left side) - this could be a house, waves, sun, geometric shape, etc.
2. TEXT with the company name (usually on the right side)

YOUR TASK: Redraw ONLY the graphic icon/symbol part as a new SQUARE image.

STEP BY STEP:
1. Look at the image and identify the graphic icon/symbol (NOT the text)
2. Create a brand new SQUARE image (1:1 ratio)
3. Redraw that EXACT same icon/symbol PERFECTLY CENTERED in this square
4. Use the EXACT same colors from the original
5. Use the same background color from the original logo
6. Make the icon fill about 60-70% of the square
7. DO NOT include ANY text, letters, or words

CRITICAL CENTERING REQUIREMENT:
- The icon MUST be PERFECTLY CENTERED both horizontally AND vertically
- There should be EQUAL padding/space on ALL FOUR sides (top, bottom, left, right)
- The icon should be in the EXACT CENTER of the square image
- Do NOT place the icon in a corner or off to one side

The output must be:
- A perfect SQUARE image
- The icon PERFECTLY CENTERED (equal margins on all sides)
- Containing ONLY the graphic icon/symbol from the original logo
- NO TEXT whatsoever
- Same colors and style as the original`;

  const parts: Part[] = [
    {
      inlineData: {
        mimeType: mimeType,
        data: base64Data,
      },
    },
    { text: prompt },
  ];

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
      // @ts-ignore - aspectRatio is supported but not in types
      aspectRatio: "1:1",
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data in response");
  }

  // Post-process to detect icon content and center it in a TRUE SQUARE
  const sharp = (await import('sharp')).default;
  const imgBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
  
  // Fixed output size - always 512x512 square
  const SQUARE_SIZE = 512;
  
  // Get background color from original image first
  const { dominant } = await sharp(imgBuffer).stats();
  const bgColor = { r: Math.round(dominant.r), g: Math.round(dominant.g), b: Math.round(dominant.b) };
  
  // Trim the image to find just the icon content (remove uniform background)
  let trimmedBuffer: Buffer;
  try {
    trimmedBuffer = await sharp(imgBuffer)
      .trim({ threshold: 15 }) // Trim near-uniform background colors
      .toBuffer();
  } catch (e) {
    // If trim fails (e.g., no content to trim), use original
    trimmedBuffer = imgBuffer;
  }
  
  const trimmedMetadata = await sharp(trimmedBuffer).metadata();
  const iconWidth = trimmedMetadata.width || 256;
  const iconHeight = trimmedMetadata.height || 256;
  
  // Target icon size is 85% of the square
  const targetIconSize = Math.floor(SQUARE_SIZE * 0.85);
  
  // Resize the icon to fit within the target size while maintaining aspect ratio
  const resizedIconBuffer = await sharp(trimmedBuffer)
    .resize({
      width: targetIconSize,
      height: targetIconSize,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .toBuffer();
  
  const resizedMetadata = await sharp(resizedIconBuffer).metadata();
  const finalIconWidth = resizedMetadata.width || targetIconSize;
  const finalIconHeight = resizedMetadata.height || targetIconSize;
  
  // Create a fixed 512x512 square canvas with the background color and composite the centered icon
  const centeredBuffer = await sharp({
    create: {
      width: SQUARE_SIZE,
      height: SQUARE_SIZE,
      channels: 3,
      background: bgColor,
    },
  })
    .composite([
      {
        input: resizedIconBuffer,
        left: Math.round((SQUARE_SIZE - finalIconWidth) / 2),
        top: Math.round((SQUARE_SIZE - finalIconHeight) / 2),
      },
    ])
    .png()
    .toBuffer();

  return {
    base64: centeredBuffer.toString('base64'),
    mimeType: 'image/png',
  };
}

/**
 * Generate a high-quality image using Nano Banana Pro model.
 * Uses gemini-3-pro-image-preview for higher quality results.
 */
export async function generateImageBase64Pro(prompt: string): Promise<{ base64: string; mimeType: string }> {
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-image-preview",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data in response");
  }

  return {
    base64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}

/**
 * Fetch an image from URL and convert to base64 for Gemini input.
 */
async function fetchImageAsBase64(imageUrl: string): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  
  return { base64, mimeType: contentType };
}

/**
 * Generate an enhanced version of an existing image based on a prompt.
 * Uses the source image as input for conditioning the generation.
 */
export async function enhanceImageWithPrompt(
  sourceImageUrl: string, 
  enhancementPrompt: string
): Promise<{ base64: string; mimeType: string }> {
  // Fetch the source image
  const sourceImage = await fetchImageAsBase64(sourceImageUrl);
  
  // Create the prompt with context about enhancement
  const fullPrompt = `You are an expert photo editor. Look at this vacation rental listing photo and create an enhanced version with the following improvements applied:

${enhancementPrompt}

Important guidelines:
- Keep the exact same room, furniture, layout, and composition
- Maintain the same perspective and viewing angle
- Apply ONLY the specified lighting and atmosphere enhancements
- The result should look like a photorealistic, professional real estate photo
- Do NOT add, remove, or reposition any furniture or objects
- Make the enhancements subtle but noticeable

Generate an enhanced version of this photo with the improvements applied.`;

  // Build the parts array with both the image and text
  const parts: Part[] = [
    {
      inlineData: {
        mimeType: sourceImage.mimeType,
        data: sourceImage.base64,
      },
    },
    { text: fullPrompt },
  ];

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-image-preview",
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data in response");
  }

  return {
    base64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}
