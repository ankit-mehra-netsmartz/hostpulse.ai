// Resend Email Service Integration for HostPulse
import { Resend } from "resend";
import { config } from "../config";
import { logger } from "../logger";

const HOSTPULSE_FROM_EMAIL = "HostPulse <noreply@hostpulse.ai>";

function getResendClient() {
  const apiKey = config.resend.apiKey;

  if (!apiKey) {
    throw new Error("HOSTPULSE_RESEND_API_KEY not configured");
  }

  return {
    client: new Resend(apiKey),
    fromEmail: HOSTPULSE_FROM_EMAIL,
  };
}

export interface TeamInviteEmailParams {
  toEmail: string;
  teamName: string;
  workspaceName: string;
  inviterName: string;
  role: string;
  invitationToken: string;
}

export async function sendTeamInviteEmail(
  params: TeamInviteEmailParams,
): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();

    const {
      toEmail,
      teamName,
      workspaceName,
      inviterName,
      role,
      invitationToken,
    } = params;

    const baseUrl = config.appUrl || "https://hostpulse.ai";
    const inviteLink = `${baseUrl}/invite/${invitationToken}`;

    // Extract first name from inviter name
    const inviterFirstName = inviterName.split(" ")[0];

    const result = await client.emails.send({
      from: fromEmail || "HostPulse <noreply@hostpulse.ai>",
      to: toEmail,
      subject: `${inviterFirstName} has invited you to join team ${teamName} on HostPulse`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background: linear-gradient(135deg, #f87171 0%, #fb923c 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <img src="https://hostpulse.ai/favicon.png" alt="HostPulse" style="width: 60px; height: 60px; margin-bottom: 15px; border-radius: 50%;">
            <h1 style="color: white; margin: 0; font-size: 28px;">HostPulse</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">AI-Powered Listing Analysis</p>
          </div>
          
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="margin-top: 0; color: #1f2937;">You're Invited! 🎉</h2>
            
            <p style="color: #4b5563;">
              <strong>${inviterName}</strong> has invited you to join the team <strong style="color: #f87171;">${teamName}</strong> 
              in the <strong>${workspaceName}</strong> workspace on HostPulse.
            </p>
            
            <div style="background: linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%); padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f87171;">
              <p style="margin: 0; color: #6b7280;">
                <strong>Your Role:</strong> ${role === "manager" ? "Team Manager" : "Team Member"}
              </p>
            </div>
            
            <p style="color: #4b5563;">
              As a team member, you'll be able to collaborate on tasks, view shared insights, 
              and help optimize your property listings together.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteLink}" 
                 style="background: linear-gradient(135deg, #f87171 0%, #fb923c 100%); 
                        color: white; 
                        padding: 14px 28px; 
                        text-decoration: none; 
                        border-radius: 8px; 
                        font-weight: 600;
                        display: inline-block;
                        box-shadow: 0 4px 14px rgba(248, 113, 113, 0.4);">
                Accept Invitation
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="color: #9ca3af; font-size: 14px; text-align: center; margin: 0;">
              If you didn't expect this invitation, you can safely ignore this email.
            </p>
          </div>
          
          <div style="text-align: center; padding: 20px 0;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
              © ${new Date().getFullYear()} HostPulse. All rights reserved.
            </p>
          </div>
        </body>
        </html>
      `,
    });

    logger.info("Email", "Team invite sent successfully to", toEmail, result);
    return true;
  } catch (error) {
    logger.error("Email", "Failed to send team invite email:", error);
    return false;
  }
}

export interface FeedbackEmailParams {
  type: "support" | "feedback" | "bug";
  message: string;
  userEmail?: string;
  userName?: string;
}

export async function sendFeedbackEmail(
  params: FeedbackEmailParams,
): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();

    const { type, message, userEmail, userName } = params;

    const typeLabels: Record<string, string> = {
      support: "Support Request",
      feedback: "Product Feedback",
      bug: "Bug Report",
    };

    const typeEmoji: Record<string, string> = {
      support: "🆘",
      feedback: "💡",
      bug: "🐛",
    };

    const result = await client.emails.send({
      from: fromEmail || "HostPulse <noreply@hostpulse.ai>",
      to: "derek@hostpulse.ai",
      replyTo: userEmail || undefined,
      subject: `[HostPulse BETA] ${typeLabels[type]} from ${userName || "Anonymous User"}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">HostPulse BETA Feedback</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">${typeEmoji[type]} ${typeLabels[type]}</p>
          </div>
          
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 0 8px 8px 0; margin-bottom: 20px;">
              <p style="margin: 0; color: #92400e; font-weight: 600;">
                Type: ${typeLabels[type]}
              </p>
            </div>
            
            <h3 style="margin-top: 0; color: #1f2937;">From User:</h3>
            <p style="color: #4b5563;">
              <strong>Name:</strong> ${userName || "Not provided"}<br>
              <strong>Email:</strong> ${userEmail || "Not provided"}
            </p>
            
            <h3 style="color: #1f2937;">Message:</h3>
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #374151; white-space: pre-wrap;">${message}</p>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
              This feedback was submitted through the HostPulse BETA banner.
            </p>
          </div>
        </body>
        </html>
      `,
    });

    logger.info("Email", "Feedback sent successfully:", result);
    return true;
  } catch (error) {
    logger.error("Email", "Failed to send feedback email:", error);
    return false;
  }
}

// Changelog notification email
export interface ChangelogEmailParams {
  toEmail: string;
  entries: Array<{
    title: string;
    description: string;
    location?: string | null;
    hostBenefit?: string | null;
  }>;
}

export async function sendChangelogEmail(
  params: ChangelogEmailParams,
): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();

    const { toEmail, entries } = params;

    if (entries.length === 0) {
      return false;
    }

    const entriesHtml = entries
      .map(
        (entry) => `
      <div style="background: #ffffff; padding: 20px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #f87171;">
        <h3 style="margin: 0 0 10px 0; color: #1f2937; font-size: 18px;">${entry.title}</h3>
        <p style="margin: 0 0 10px 0; color: #4b5563;">${entry.description}</p>
        ${entry.location ? `<span style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-size: 12px; color: #6b7280;">${entry.location}</span>` : ""}
        ${entry.hostBenefit ? `<p style="margin: 10px 0 0 0; color: #059669; font-size: 14px; font-style: italic;">💡 ${entry.hostBenefit}</p>` : ""}
      </div>
    `,
      )
      .join("");

    const result = await client.emails.send({
      from: fromEmail || "HostPulse <noreply@hostpulse.ai>",
      to: toEmail,
      subject: `What's New in HostPulse - ${entries.length} Update${entries.length > 1 ? "s" : ""}!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background: linear-gradient(135deg, #f87171 0%, #fb923c 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <img src="https://hostpulse.ai/favicon.png" alt="HostPulse" style="width: 60px; height: 60px; margin-bottom: 15px; border-radius: 50%;">
            <h1 style="color: white; margin: 0; font-size: 28px;">What's New! ✨</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Here's what we've been working on for you</p>
          </div>
          
          <div style="background: #f3f4f6; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            ${entriesHtml}
            
            <div style="text-align: center; margin: 30px 0 0 0;">
              <a href="https://hostpulse.ai" 
                 style="background: linear-gradient(135deg, #f87171 0%, #fb923c 100%); 
                        color: white; 
                        padding: 14px 28px; 
                        text-decoration: none; 
                        border-radius: 8px; 
                        font-weight: 600;
                        display: inline-block;
                        box-shadow: 0 4px 14px rgba(248, 113, 113, 0.4);">
                Check It Out
              </a>
            </div>
          </div>
          
          <div style="text-align: center; padding: 20px 0;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
              © ${new Date().getFullYear()} HostPulse. All rights reserved.
            </p>
          </div>
        </body>
        </html>
      `,
    });

    logger.info("Email", "Changelog email sent to:", toEmail, result);
    return true;
  } catch (error) {
    logger.error("Email", "Failed to send changelog email:", error);
    return false;
  }
}

// Cleaning reminder email
export interface CleaningReminderEmailParams {
  toEmail: string;
  cleanerName: string;
  listingName: string;
  listingAddress: string;
  scheduledDate: string;
  guestName?: string;
  checklistUrl: string;
}

export async function sendCleaningReminderEmail(
  params: CleaningReminderEmailParams,
): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();

    const {
      toEmail,
      cleanerName,
      listingName,
      listingAddress,
      scheduledDate,
      guestName,
      checklistUrl,
    } = params;

    const result = await client.emails.send({
      from: fromEmail || "HostPulse <noreply@hostpulse.ai>",
      to: toEmail,
      subject: `Cleaning Reminder: ${listingName} - ${scheduledDate}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Cleaning Reminder</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">${scheduledDate}</p>
          </div>
          
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #4b5563; font-size: 16px;">
              Hi <strong>${cleanerName}</strong>,
            </p>
            
            <p style="color: #4b5563;">
              You have a cleaning scheduled for <strong>${scheduledDate}</strong>.
            </p>
            
            <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
              <p style="margin: 0 0 8px 0; color: #1e40af; font-weight: 600; font-size: 18px;">
                ${listingName}
              </p>
              ${listingAddress ? `<p style="margin: 0 0 8px 0; color: #6b7280;">${listingAddress}</p>` : ""}
              ${guestName ? `<p style="margin: 0; color: #6b7280;">Departing guest: <strong>${guestName}</strong></p>` : ""}
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${checklistUrl}" 
                 style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); 
                        color: white; 
                        padding: 16px 32px; 
                        text-decoration: none; 
                        border-radius: 8px; 
                        font-weight: 600;
                        font-size: 16px;
                        display: inline-block;
                        box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);">
                View Cleaning Checklist
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="color: #9ca3af; font-size: 14px; text-align: center; margin: 0;">
              This is an automated reminder from HostPulse.
            </p>
          </div>
          
          <div style="text-align: center; padding: 20px 0;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
              Powered by HostPulse
            </p>
          </div>
        </body>
        </html>
      `,
    });

    logger.info("Email", "Cleaning reminder sent to:", toEmail, result);
    return true;
  } catch (error) {
    logger.error("Email", "Failed to send cleaning reminder email:", error);
    return false;
  }
}

export interface ShortCodeData {
  property_name?: string;
  address?: string;
  check_in_date?: string;
  check_out_date?: string;
  guest_name?: string;
  cleaner_name?: string;
  checklist_link?: string;
  scheduled_date?: string;
}

export function renderTemplate(template: string, data: ShortCodeData): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || "");
  }
  return result;
}

export const DEFAULT_TEMPLATES: Record<
  string,
  { subject?: string; body: string }
> = {
  reminder_email: {
    subject: "Cleaning Reminder: {{property_name}} - {{scheduled_date}}",
    body: "Hi {{cleaner_name}},\n\nYou have a cleaning scheduled for {{scheduled_date}} at {{property_name}}.\n\nAddress: {{address}}\nDeparting guest: {{guest_name}}\n\nView your checklist: {{checklist_link}}",
  },
  reminder_sms: {
    body: "Hi {{cleaner_name}}! Cleaning reminder for {{property_name}} on {{scheduled_date}}.{{guest_name}} Checklist: {{checklist_link}}",
  },
  cancelled_email: {
    subject: "Cleaning Cancelled: {{property_name}} - {{scheduled_date}}",
    body: "Hi {{cleaner_name}},\n\nThe cleaning scheduled for {{scheduled_date}} at {{property_name}} has been cancelled.\n\nAddress: {{address}}\n\nNo action is needed from you. We'll notify you of any future assignments.",
  },
  cancelled_sms: {
    body: "Hi {{cleaner_name}}, the cleaning for {{property_name}} on {{scheduled_date}} has been CANCELLED. No action needed.",
  },
  changed_email: {
    subject: "Cleaning Updated: {{property_name}} - {{scheduled_date}}",
    body: "Hi {{cleaner_name}},\n\nThe reservation for {{property_name}} has been updated. Your cleaning is now scheduled for {{scheduled_date}}.\n\nAddress: {{address}}\nGuest: {{guest_name}}\n\nView your checklist: {{checklist_link}}",
  },
  changed_sms: {
    body: "Hi {{cleaner_name}}, cleaning update for {{property_name}}: now scheduled for {{scheduled_date}}. Checklist: {{checklist_link}}",
  },
};

export interface TemplatedNotificationParams {
  toEmail?: string;
  toPhone?: string;
  subject?: string;
  body: string;
  shortCodeData: ShortCodeData;
}

export async function sendTemplatedEmail(
  params: TemplatedNotificationParams,
): Promise<boolean> {
  if (!params.toEmail) return false;
  try {
    const { client, fromEmail } = getResendClient();
    const renderedSubject = renderTemplate(
      params.subject || "",
      params.shortCodeData,
    );
    const renderedBody = renderTemplate(params.body, params.shortCodeData);
    const htmlBody = renderedBody.replace(/\n/g, "<br>");

    await client.emails.send({
      from: fromEmail || "HostPulse <noreply@hostpulse.ai>",
      to: params.toEmail,
      subject: renderedSubject,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">${renderedSubject}</h1>
          </div>
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #4b5563; font-size: 16px;">${htmlBody}</p>
          </div>
          <div style="text-align: center; padding: 20px 0;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">Powered by HostPulse</p>
          </div>
        </body>
        </html>
      `,
    });
    logger.info("Email", "Templated notification sent to:", params.toEmail);
    return true;
  } catch (error) {
    logger.error("Email", "Failed to send templated email:", error);
    return false;
  }
}

interface CleanerInviteEmailParams {
  toEmail: string;
  cleanerName: string;
  workspaceName: string;
  inviterName: string;
  role: "individual" | "company" | "cleaning_manager" | "team_member";
  companyName?: string;
  inviteToken: string;
  baseUrl?: string;
}

export async function sendCleanerInviteEmail(
  params: CleanerInviteEmailParams,
): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendClient();

    const {
      toEmail,
      cleanerName,
      workspaceName,
      inviterName,
      role,
      companyName,
      inviteToken,
    } = params;

    const baseUrl = params.baseUrl || config.appUrl || "https://hostpulse.ai";
    const mobileLink = `${baseUrl}/cleaner-invite/${inviteToken}`;

    const inviterFirstName = inviterName.split(" ")[0];

    const roleLabel =
      role === "company"
        ? "Cleaning Company"
        : role === "cleaning_manager"
          ? "Cleaning Manager"
          : role === "team_member"
            ? "Team Member"
            : "Cleaner";

    const teamMemberLine =
      role === "team_member" && companyName
        ? `<p style="color: #4b5563; font-size: 16px; margin: 0 0 15px 0;">You have been added as a team member of <strong>${companyName}</strong>.</p>`
        : "";

    const result = await client.emails.send({
      from: fromEmail || "HostPulse <noreply@hostpulse.ai>",
      to: toEmail,
      subject: `You've been invited to join ${workspaceName} on HostPulse`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to HostPulse</h1>
          </div>
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #4b5563; font-size: 16px; margin: 0 0 15px 0;">Hi ${cleanerName},</p>
            <p style="color: #4b5563; font-size: 16px; margin: 0 0 15px 0;">${inviterFirstName} has added you as a <strong>${roleLabel}</strong> to <strong>${workspaceName}</strong> on HostPulse.</p>
            ${teamMemberLine}
            <p style="color: #4b5563; font-size: 16px; margin: 0 0 20px 0;">You can use the HostPulse mobile app to view your assigned cleaning tasks, follow procedures, and manage turnovers.</p>
            <p style="color: #4b5563; font-size: 16px; margin: 0 0 15px 0;"><strong>To get started:</strong></p>
            <ol style="color: #4b5563; font-size: 16px; margin: 0 0 20px 0; padding-left: 20px;">
              <li style="margin-bottom: 8px;">Click the button below to open the mobile app</li>
              <li style="margin-bottom: 8px;">Sign in to create your account</li>
              <li style="margin-bottom: 8px;">You'll be able to see your assigned tasks and cleaning procedures</li>
            </ol>
            <div style="text-align: center; margin: 25px 0;">
              <a href="${mobileLink}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">Open Mobile App</a>
            </div>
            <p style="color: #9ca3af; font-size: 13px; margin: 20px 0 0 0; text-align: center;">If the button doesn't work, copy and paste this link into your browser:<br><a href="${mobileLink}" style="color: #3b82f6;">${mobileLink}</a></p>
          </div>
          <div style="text-align: center; padding: 20px 0;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">Powered by HostPulse</p>
          </div>
        </body>
        </html>
      `,
    });

    logger.info("Email", "Cleaner invite sent to:", toEmail, "Result:", result);
    return true;
  } catch (error) {
    logger.error("Email", "Failed to send cleaner invite email:", error);
    return false;
  }
}
