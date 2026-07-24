import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    });
  }
  return transporter;
}

/**
 * Sends through SMTP when credentials exist, otherwise writes the message to
 * the log so flows like password reset remain testable without a mail account.
 * Delivery failure never propagates — a broken mailbox must not break signup.
 */
export async function sendMail(message: MailMessage): Promise<boolean> {
  const from = `"${env.MAIL_FROM_NAME}" <${env.MAIL_FROM_ADDRESS}>`;

  if (!env.hasSmtp) {
    logger.info(
      `[mail:console] To: ${message.to} — ${message.subject}\n${indent(message.text)}`,
    );
    return false;
  }

  try {
    await getTransporter().sendMail({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    logger.info(`Email sent to ${message.to}: ${message.subject}`);
    return true;
  } catch (error) {
    logger.error(`Failed to send email to ${message.to}`, error);
    return false;
  }
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}

export function describeMailProvider(): string {
  return env.hasSmtp
    ? `SMTP (${env.SMTP_HOST}:${env.SMTP_PORT})`
    : 'console logger — no SMTP credentials configured';
}
