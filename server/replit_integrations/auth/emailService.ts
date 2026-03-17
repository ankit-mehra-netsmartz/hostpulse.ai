import { Resend } from "resend";

// Uses the same API key as the rest of the app (HOSTPULSE_RESEND_API_KEY)
const resend = new Resend(process.env.HOSTPULSE_RESEND_API_KEY);

const FROM = process.env.RESEND_FROM || "HostPulse <noreply@hostpulse.ai>";

const BASE_URL = process.env.APP_URL || "http://localhost:3001";

export async function sendVerificationEmail(
  toEmail: string,
  userName: string,
  token: string,
): Promise<void> {
  const verifyUrl = `${BASE_URL}/api/auth/verify-email?token=${token}`;
  const firstName = userName.split(" ")[0] || userName;

  try {
    await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: "Verify your email address",
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#f87171 0%,#fb923c 100%);padding:32px 40px;border-radius:12px 12px 0 0;text-align:center;">
              <img src="https://hostpulse.ai/favicon.png" alt="HostPulse" width="56" height="56"
                   style="border-radius:50%;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;">
              <h1 style="color:#fff;margin:0;font-size:26px;font-weight:700;">HostPulse</h1>
              <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;">Verify your email address</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background:#fff;padding:36px 40px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
              <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">Hi ${firstName}! 👋</h2>
              <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px;">
                Thanks for signing up for HostPulse. Click the button below to verify your 
                email address and activate your account.
              </p>
              <!-- CTA Button -->
              <div style="text-align:center;margin:32px 0;">
                <a href="${verifyUrl}"
                   style="display:inline-block;background:linear-gradient(135deg,#f87171 0%,#fb923c 100%);
                          color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;
                          font-size:16px;font-weight:600;
                          box-shadow:0 4px 14px rgba(248,113,113,0.4);">
                  Verify Email Address
                </a>
              </div>
              <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0 0 12px;">
                Or copy this link into your browser:
              </p>
              <p style="background:#f3f4f6;border-radius:6px;padding:10px 14px;margin:0 0 24px;
                        font-size:12px;color:#374151;word-break:break-all;">
                ${verifyUrl}
              </p>
              <p style="color:#9ca3af;font-size:13px;margin:0;">
                ⏱ This link expires in <strong>24 hours</strong>. If you didn't create a 
                HostPulse account, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="text-align:center;padding:24px 0 0;">
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
      text: `Hi ${firstName},\n\nVerify your HostPulse email address by visiting the link below:\n${verifyUrl}\n\nThis link expires in 24 hours.\n\nIf you did not create a HostPulse account, you can safely ignore this email.\n\n— The HostPulse Team`,
    });
  } catch (error) {
    // Non-fatal: signup still succeeds even if the email fails to send
    console.error("[emailService] Failed to send verification email:", error);
  }
}
