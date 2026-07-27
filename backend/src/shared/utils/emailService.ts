import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../../config/env';
import { logger } from './logger';

/**
 * FIX EMAIL-01: this is the missing piece flagged as the single
 * production blocker — forgotPassword previously only logged the reset
 * token (`// TODO: send email with reset link containing token`), so
 * users had no way to actually receive their password reset link.
 *
 * Uses nodemailer over SMTP, which works with any provider that exposes
 * an SMTP relay (Gmail, AWS SES, SendGrid, Resend, Mailgun, a self-hosted
 * Postfix, etc.) without locking the project into one vendor's SDK.
 *
 * Degrades gracefully: if SMTP isn't configured (env.email.isConfigured
 * is false — the default in dev/test/CI without real credentials), every
 * send function logs what *would* have been sent instead of throwing.
 * This matches the existing project convention for optional third-party
 * integrations (see Cloudinary's optional env vars) — the app must still
 * start and run cleanly without real SMTP credentials.
 */

let transporter: Transporter | null = null;

// PROD-FIX-02: previously nodemailer's transport had no timeout
// configuration at all, and sendEmail() awaited t.sendMail() directly
// with nothing bounding how long that could take. A hung/slow SMTP
// connection (firewall dropping packets, provider outage that doesn't
// cleanly refuse the connection) kept the calling request open
// indefinitely — this matters most for forgotPassword, which awaits
// sendPasswordResetEmail synchronously as part of the HTTP request.
// nodemailer's SMTP transport supports three independent timeouts;
// all three are set so a hang at any stage of the SMTP conversation is
// bounded, not just the initial connection.
const SMTP_CONNECTION_TIMEOUT_MS = 10_000; // time to establish the TCP connection
const SMTP_GREETING_TIMEOUT_MS = 10_000; // time to wait for the SMTP greeting after connecting
const SMTP_SOCKET_TIMEOUT_MS = 15_000; // time to wait for any response once the connection is idle

function getTransporter(): Transporter | null {
  if (!env.email.isConfigured) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.email.smtpHost,
    port: env.email.smtpPort,
    secure: env.email.smtpSecure,
    auth: {
      user: env.email.smtpUser,
      pass: env.email.smtpPassword,
    },
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
  });

  return transporter;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

// PROD-FIX-13: sendEmail is awaited synchronously inside the calling
// HTTP request (e.g. forgotPassword — see auth.service.ts), so a
// single transient SMTP failure (a momentary provider blip, not a
// sustained outage) previously meant a real user's password-reset
// email silently never sent, with no chance to recover within the
// same request. A small number of quick retries with backoff absorbs
// exactly that kind of transient failure without meaningfully slowing
// down the request: worst case here is 2 retries × (500ms + 1500ms)
// = 2s added on top of the original attempt, well under the 15s
// SMTP_SOCKET_TIMEOUT_MS already bounding each individual attempt.
// This is NOT a substitute for a real background job queue (Bull/
// BullMQ) — a sustained SMTP outage still ultimately fails after these
// retries, same as before, just with a better chance of surviving a
// blip that a queue-based retry-over-minutes approach would also catch
// but far more slowly. Deliberately not applied to Cloudinary uploads
// (config/cloudinary.ts) — retrying a multi-MB image upload
// automatically would compound, not help, a slow connection, and
// createAd's caller already surfaces the failure to the user
// immediately rather than silently degrading.
const EMAIL_RETRY_DELAYS_MS = [500, 1500];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const t = getTransporter();

  if (!t) {
    // FIX EMAIL-01: fallback behavior — previously this was the only
    // thing that happened (logger.info with the token). Now it's
    // explicitly the *fallback* path, clearly labeled, so it's obvious
    // in logs that an email was supposed to go out but SMTP isn't set up.
    logger.warn('[EMAIL NOT SENT — SMTP not configured] Would have sent email', {
      to: options.to,
      subject: options.subject,
    });
    return false;
  }

  const mail = {
    from: `"${env.email.fromName}" <${env.email.fromEmail}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  };

  let lastError: unknown;
  const attempts = EMAIL_RETRY_DELAYS_MS.length + 1;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await t.sendMail(mail);
      if (attempt > 1) {
        logger.info('Email sent after retry', { to: options.to, subject: options.subject, attempt });
      }
      return true;
    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt === attempts;
      if (isLastAttempt) break;

      const delayMs = EMAIL_RETRY_DELAYS_MS[attempt - 1];
      logger.warn('Email send attempt failed, retrying', {
        to: options.to,
        subject: options.subject,
        attempt,
        delayMs,
      });
      await sleep(delayMs);
    }
  }

  // Never let an email failure crash the calling request — password
  // reset / security alerts should fail soft, not 500 the whole flow.
  logger.error('Failed to send email after all retries', {
    to: options.to,
    subject: options.subject,
    attempts,
    err: lastError,
  });
  return false;
}

// ── Templates ────────────────────────────────────────────────────────

function passwordResetEmail(resetUrl: string): { html: string; text: string } {
  return {
    text: [
      'طلب إعادة تعيين كلمة المرور',
      '',
      'لقد طلبت إعادة تعيين كلمة المرور لحسابك في سوق غزة.',
      `لإعادة التعيين، افتح هذا الرابط: ${resetUrl}`,
      '',
      'هذا الرابط صالح لمدة ساعة واحدة فقط.',
      'إذا لم تطلب هذا، يمكنك تجاهل هذه الرسالة بأمان.',
    ].join('\n'),
    html: `
      <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
        <h2 style="margin-bottom: 16px;">طلب إعادة تعيين كلمة المرور</h2>
        <p>لقد طلبت إعادة تعيين كلمة المرور لحسابك في <strong>سوق غزة</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}"
             style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
            إعادة تعيين كلمة المرور
          </a>
        </p>
        <p style="color:#666;font-size:14px;">هذا الرابط صالح لمدة ساعة واحدة فقط.</p>
        <p style="color:#666;font-size:14px;">إذا لم تطلب هذا، يمكنك تجاهل هذه الرسالة بأمان — لن يتم تغيير كلمة المرور.</p>
      </div>
    `,
  };
}

function securityAlertEmail(event: string, details: Record<string, unknown>): { html: string; text: string } {
  const eventLabels: Record<string, string> = {
    TOKEN_REUSE: 'تم اكتشاف إعادة استخدام رمز الجلسة — تم إلغاء جميع الجلسات',
    ACCOUNT_LOCKED: 'تم قفل حسابك مؤقتاً بسبب محاولات تسجيل دخول فاشلة متكررة',
    SUSPICIOUS_LOGIN: 'تم رصد نشاط تسجيل دخول غير معتاد على حسابك',
  };
  const label = eventLabels[event] ?? event;

  return {
    text: [
      'تنبيه أمني بخصوص حسابك',
      '',
      label,
      '',
      `الوقت: ${new Date().toISOString()}`,
      details.ip ? `عنوان IP: ${details.ip}` : '',
      '',
      'إذا لم يكن هذا أنت، يُرجى تغيير كلمة المرور فوراً.',
    ].filter(Boolean).join('\n'),
    html: `
      <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
        <h2 style="margin-bottom: 16px; color: #dc2626;">تنبيه أمني بخصوص حسابك</h2>
        <p>${label}</p>
        <p style="color:#666;font-size:14px;">الوقت: ${new Date().toLocaleString('ar-EG')}</p>
        ${details.ip ? `<p style="color:#666;font-size:14px;">عنوان IP: ${details.ip}</p>` : ''}
        <p style="margin-top:24px;">إذا لم يكن هذا أنت، يُرجى <strong>تغيير كلمة المرور فوراً</strong>.</p>
      </div>
    `,
  };
}

// ── Public API ───────────────────────────────────────────────────────

export const emailService = {
  /**
   * FIX EMAIL-01: called from auth.service.ts's forgotPassword. Builds
   * the same /reset-password?token=... link the frontend's
   * ResetPasswordForm already expects (see app/(auth)/reset-password).
   */
  sendPasswordResetEmail: async (toEmail: string, token: string): Promise<void> => {
    const resetUrl = `${env.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const { html, text } = passwordResetEmail(resetUrl);
    await sendEmail({
      to: toEmail,
      subject: 'إعادة تعيين كلمة المرور — سوق غزة',
      html,
      text,
    });
  },

  /**
   * FIX SEC-ALERT-01: called from securityAlert.ts. Requires the user's
   * email to be looked up by the caller (securityAlert.ts only has a
   * userId), since this module intentionally has no DB access of its
   * own — keeping it a pure "given an address, send this" service.
   */
  sendSecurityAlertEmail: async (
    toEmail: string,
    event: string,
    details: Record<string, unknown>,
  ): Promise<void> => {
    const { html, text } = securityAlertEmail(event, details);
    await sendEmail({
      to: toEmail,
      subject: 'تنبيه أمني — سوق غزة',
      html,
      text,
    });
  },
};
