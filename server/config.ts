import dotenv from "dotenv";
dotenv.config();

const nodeEnv = process.env.NODE_ENV || "development";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const config = {
  nodeEnv,
  isDevelopment: nodeEnv !== "production",
  isProduction: nodeEnv === "production",
  port: parseInt(process.env.PORT || "5000", 10),

  database: {
    url: process.env.DATABASE_URL,
  },

  session: {
    secret: process.env.SESSION_SECRET || "",
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL,
  },

  openai: {
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseUrl: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  },

  openRouter: {
    apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
    baseUrl: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
  },

  gemini: {
    apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },

  hospitable: {
    clientId: process.env.HOSPITABLE_CLIENT_ID,
    clientSecret: process.env.HOSPITABLE_CLIENT_SECRET,
    clientIdDev: process.env.HOSPITABLE_CLIENT_ID_DEV,
    clientSecretDev: process.env.HOSPITABLE_CLIENT_SECRET_DEV,
    redirectUriDev: process.env.HOSPITABLE_REDIRECT_URI_DEV,
    webhookSecret: process.env.HOSPITABLE_WEBHOOK_SECRET,
    webhookSecretDev: process.env.HOSPITABLE_WEBHOOK_SECRET_DEV,
  },

  notion: {
    clientId: process.env.NOTION_CLIENT_ID,
    clientSecret: process.env.NOTION_CLIENT_SECRET,
    clientIdDev: process.env.NOTION_CLIENT_ID_DEV,
    clientSecretDev: process.env.NOTION_CLIENT_SECRET_DEV,
    redirectUriDev: process.env.NOTION_REDIRECT_URI_DEV,
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },

  resend: {
    apiKey: process.env.HOSTPULSE_RESEND_API_KEY,
    from: process.env.HOSTPULSE_RESEND_FROM,
    baseUrl: process.env.HOSTPULSE_BASE_URL,
  },

  elevenLabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
  },

  appUrl: process.env.APP_URL,
};
