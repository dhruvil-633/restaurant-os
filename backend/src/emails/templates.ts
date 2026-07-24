import { env } from '../config/env';
import type { MailMessage } from '../services/mail';

const BRAND = '#059669';
const INK = '#0f172a';
const MUTED = '#64748b';

function layout(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:32px 16px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
      <tr>
        <td style="padding:28px 32px;border-bottom:1px solid #f1f5f9;">
          <span style="font-size:18px;font-weight:700;color:${INK};letter-spacing:-0.02em;">
            <span style="color:${BRAND};">●</span>&nbsp; RestaurantOS
          </span>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${INK};letter-spacing:-0.02em;">${heading}</h1>
          ${bodyHtml}
        </td>
      </tr>
      <tr>
        <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #f1f5f9;">
          <p style="margin:0;font-size:12px;color:${MUTED};">
            Sent by RestaurantOS. If you weren't expecting this email, you can safely ignore it.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr><td style="border-radius:10px;background:${BRAND};">
      <a href="${url}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a>
    </td></tr>
  </table>`;
}

const paragraph = (text: string): string =>
  `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155;">${text}</p>`;

export function buildPasswordResetEmail(params: {
  to: string;
  name: string;
  token: string;
  expiresInMinutes: number;
}): MailMessage {
  const resetUrl = `${env.CLIENT_URL}/reset-password?token=${params.token}`;

  return {
    to: params.to,
    subject: 'Reset your RestaurantOS password',
    html: layout(
      'Reset your password',
      paragraph(`Hi ${escapeHtml(params.name)},`) +
        paragraph(
          `We received a request to reset your RestaurantOS password. This link expires in ${params.expiresInMinutes} minutes.`,
        ) +
        button('Reset password', resetUrl) +
        paragraph(
          `<span style="color:${MUTED};font-size:13px;">If the button doesn't work, paste this into your browser:<br/><a href="${resetUrl}" style="color:${BRAND};word-break:break-all;">${resetUrl}</a></span>`,
        ) +
        paragraph(
          `<span style="color:${MUTED};font-size:13px;">Didn't request this? Your password is unchanged and no action is needed.</span>`,
        ),
    ),
    text: [
      `Hi ${params.name},`,
      '',
      'We received a request to reset your RestaurantOS password.',
      `This link expires in ${params.expiresInMinutes} minutes:`,
      resetUrl,
      '',
      "Didn't request this? Your password is unchanged.",
    ].join('\n'),
  };
}

export function buildWelcomeEmail(params: {
  to: string;
  name: string;
  role: string;
  temporaryPassword?: string;
}): MailMessage {
  const credentialsBlock = params.temporaryPassword
    ? paragraph(
        `Your temporary password is <strong style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#f1f5f9;padding:2px 8px;border-radius:6px;">${escapeHtml(
          params.temporaryPassword,
        )}</strong>. Please change it after your first sign-in.`,
      )
    : '';

  return {
    to: params.to,
    subject: 'Your RestaurantOS account is ready',
    html: layout(
      'Welcome to RestaurantOS',
      paragraph(`Hi ${escapeHtml(params.name)},`) +
        paragraph(`An account has been created for you with the role <strong>${escapeHtml(params.role)}</strong>.`) +
        credentialsBlock +
        button('Sign in', `${env.CLIENT_URL}/login`),
    ),
    text: [
      `Hi ${params.name},`,
      '',
      `An account has been created for you with the role ${params.role}.`,
      params.temporaryPassword ? `Temporary password: ${params.temporaryPassword}` : '',
      `Sign in: ${env.CLIENT_URL}/login`,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
