// Twilio Integration Service
import twilio from 'twilio';
import { config } from '../config';
import { logger } from '../logger';

function getCredentials() {
  const accountSid = config.twilio.accountSid;
  const authToken = config.twilio.authToken;
  const phoneNumber = config.twilio.phoneNumber;

  if (!accountSid || !authToken || !phoneNumber) {
    throw new Error('Twilio credentials not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in your secrets.');
  }

  return {
    accountSid,
    authToken,
    phoneNumber
  };
}

export function getTwilioClient() {
  const { accountSid, authToken } = getCredentials();
  return twilio(accountSid, authToken);
}

export function getTwilioFromPhoneNumber() {
  const { phoneNumber } = getCredentials();
  return phoneNumber;
}

export async function sendSMS(to: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const client = getTwilioClient();
    const fromNumber = getTwilioFromPhoneNumber();
    
    const result = await client.messages.create({
      body: message,
      from: fromNumber,
      to: to
    });
    
    return { success: true, messageId: result.sid };
  } catch (error: any) {
    logger.error('Twilio', 'Error sending SMS:', error);
    return { success: false, error: error.message };
  }
}
