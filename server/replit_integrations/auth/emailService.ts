import { Resend } from "resend";
import { config } from "../../config";
const resend = new Resend(config.resend.apiKey);

const FROM = config.resend.from || "HostPulse <noreply@hostpulse.ai>";

const BASE_URL = config.resend.baseUrl || "http://localhost:3001";

export async function sendMagicLinkEmail(
  toEmail: string,
  userName: string,
  token: string,
  isNewUser: boolean,
): Promise<void> {
  const magicLinkUrl = `${BASE_URL}/api/auth/magic?token=${token}`;
  const displayName = userName?.trim() || "there";
  const subject = isNewUser ? "Complete your sign up" : "Your sign-in link";
  const actionText = isNewUser
    ? "Click below to create your account."
    : "Click below to sign in.";
  const ctaText = isNewUser ? "Create Account" : "Sign In";

  try {
    await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">
          <tr>
            <td style="background:#111827;padding:28px 36px;border-radius:12px 12px 0 0;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">HostPulse</h1>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:32px 36px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
              <p style="margin:0 0 14px;color:#111827;font-size:18px;font-weight:600;">Hi ${displayName},</p>
              <p style="margin:0 0 22px;color:#374151;font-size:15px;line-height:1.6;">
                ${actionText}
              </p>
              <div style="text-align:center;margin:26px 0 24px;">
                <a href="${magicLinkUrl}"
                   style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:14px 30px;border-radius:8px;font-size:16px;font-weight:600;">
                  ${ctaText}
                </a>
              </div>
              <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0 0 8px;">
                Or copy this link into your browser:
              </p>
              <p style="background:#f3f4f6;border-radius:6px;padding:10px 12px;margin:0 0 18px;font-size:12px;color:#374151;word-break:break-all;">
                ${magicLinkUrl}
              </p>
              <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0;">
                This link expires in 15 minutes and can only be used once.
                If you did not request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="text-align:center;padding:18px 0 0;">
              <p style="color:#9ca3af;font-size:12px;margin:0;">
                © ${new Date().getFullYear()} HostPulse. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim(),
      text: `Hi ${displayName},\n\n${actionText}\n\n${magicLinkUrl}\n\nThis link expires in 15 minutes and can only be used once.\nIf you did not request this, you can safely ignore this email.\n\n- The HostPulse Team`,
    });
  } catch (error) {
    console.error("[emailService] Failed to send magic link email:", error);
  }
}
