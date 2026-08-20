/**
 * lib/notify.ts — Twilio SMS + Resend email delivery for passport invites.
 *
 * SMS via Twilio REST API (no SDK dependency issues — raw fetch).
 * Email via Resend REST API (same pattern).
 */

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS ?? "admin@homeoperator.app";
const APP_URL = process.env.APP_URL ?? "https://homeoperator.app";

export interface SmsResult {
  sid: string;
  status: string;
}

export interface EmailResult {
  id: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SMS via Twilio REST
// ─────────────────────────────────────────────────────────────────────────────
export async function sendInviteSms(
  toPhone: string,
  activateUrl: string,
  agentName: string
): Promise<SmsResult> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    throw new Error("Twilio credentials not configured");
  }

  const body = [
    `${agentName} shared your HomeOps Appliance Passport.`,
    `View your appliances before you move in:`,
    activateUrl,
    `Reply STOP to opt out.`,
  ].join("\n");

  const params = new URLSearchParams({
    To: toPhone.startsWith("+") ? toPhone : `+1${toPhone.replace(/\D/g, "")}`,
    From: TWILIO_FROM_NUMBER,
    Body: body,
  });

  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );

  const data = await res.json() as { sid?: string; status?: string; message?: string; code?: number };
  if (!res.ok || !data.sid) {
    throw new Error(`Twilio error ${res.status}: ${data.message ?? JSON.stringify(data)}`);
  }

  return { sid: data.sid!, status: data.status! };
}

// ─────────────────────────────────────────────────────────────────────────────
// Email via Resend REST
// ─────────────────────────────────────────────────────────────────────────────
export async function sendInviteEmail(
  toEmail: string,
  activateUrl: string,
  agentName: string,
  brokerage: string | null,
  propertyAddress: string,
  qrCodeUrl: string
): Promise<EmailResult> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

  const html = buildInviteEmailHtml({
    activateUrl,
    agentName,
    brokerage,
    propertyAddress,
    qrCodeUrl,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `HomeOps <${RESEND_FROM_ADDRESS}>`,
      to: [toEmail],
      subject: `Your Appliance Passport for ${propertyAddress}`,
      html,
    }),
  });

  const data = await res.json() as { id?: string; message?: string; name?: string };
  if (!res.ok || !data.id) {
    throw new Error(`Resend error ${res.status}: ${data.message ?? JSON.stringify(data)}`);
  }

  return { id: data.id! };
}

// ─────────────────────────────────────────────────────────────────────────────
// QR code URL (zero-dep: Google Charts / qrserver.com public API)
// ─────────────────────────────────────────────────────────────────────────────
export function buildQrCodeUrl(activateUrl: string, sizePx = 300): string {
  const encoded = encodeURIComponent(activateUrl);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${sizePx}x${sizePx}&data=${encoded}&format=png&ecc=M`;
}

export function buildActivateUrl(token: string): string {
  return `${APP_URL}/activate/${token}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Branded invite email HTML
// ─────────────────────────────────────────────────────────────────────────────
function buildInviteEmailHtml(opts: {
  activateUrl: string;
  agentName: string;
  brokerage: string | null;
  propertyAddress: string;
  qrCodeUrl: string;
}): string {
  const { activateUrl, agentName, brokerage, propertyAddress, qrCodeUrl } = opts;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your HomeOps Appliance Passport</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr><td style="background:#1a1a1a;padding:32px 40px;">
          <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">HomeOps</p>
          <p style="margin:6px 0 0;color:#999;font-size:13px;letter-spacing:0.5px;text-transform:uppercase;">Appliance Passport</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:40px;">
          <p style="margin:0 0 8px;color:#666;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">From your agent</p>
          <p style="margin:0 0 4px;font-size:18px;font-weight:600;color:#1a1a1a;">${escHtml(agentName)}</p>
          ${brokerage ? `<p style="margin:0 0 24px;font-size:14px;color:#666;">${escHtml(brokerage)}</p>` : `<p style="margin:0 0 24px;"></p>`}

          <p style="margin:0 0 8px;color:#666;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Property</p>
          <p style="margin:0 0 32px;font-size:16px;font-weight:500;color:#1a1a1a;">${escHtml(propertyAddress)}</p>

          <p style="margin:0 0 20px;font-size:15px;color:#444;line-height:1.6;">
            Before you call. Before you pay. Before you make it worse.<br>
            Your appliance passport is ready — every appliance documented, every recall checked.
          </p>

          <!-- CTA -->
          <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
            <tr><td style="background:#1a1a1a;border-radius:6px;">
              <a href="${activateUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:-0.2px;">
                View Your Passport →
              </a>
            </td></tr>
          </table>

          <!-- QR code -->
          <p style="margin:0 0 12px;color:#666;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Or scan to open on your phone</p>
          <img src="${qrCodeUrl}" alt="QR Code" width="160" height="160" style="display:block;border:1px solid #e5e5e5;border-radius:4px;">

          <p style="margin:32px 0 0;font-size:12px;color:#999;line-height:1.6;">
            If the button doesn't work, paste this link into your browser:<br>
            <a href="${activateUrl}" style="color:#666;">${activateUrl}</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9f9f7;padding:20px 40px;border-top:1px solid #eeeeee;">
          <p style="margin:0;font-size:12px;color:#999;">
            Sent via HomeOps · <a href="${APP_URL}" style="color:#999;">homeoperator.app</a><br>
            You received this because your agent shared an appliance passport with you.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export { APP_URL };
