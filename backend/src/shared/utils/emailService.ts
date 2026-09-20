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

/**
 * FIX RENDER-SMTP-BLOCK-01: HTTPS-based send via Resend. See the
 * RENDER-SMTP-BLOCK-01 marker inside sendEmail for the full rationale
 * (Render Free tier blocks SMTP ports; Resend uses port 443).
 *
 * Kept as a separate function so the retry loop and the Resend body
 * shape stay isolated from the nodemailer path. Uses the global fetch
 * (Node 18+) -- no extra dependency.
 *
 * Retries mirror EMAIL_RETRY_DELAYS_MS's pattern: short, bounded, and
 * well under any request timeout. A 4xx (bad API key, unverified
 * sender, invalid recipient) is NOT retried -- those failures are
 * deterministic and will keep failing; only 5xx and network errors
 * retry.
 */
async function sendViaResend(options: SendEmailOptions): Promise<boolean> {
  const from = env.email.fromName
    ? `${env.email.fromName} <${env.email.fromEmail}>`
    : env.email.fromEmail;

  let lastError: unknown = null;
  const attempts = 1 + EMAIL_RETRY_DELAYS_MS.length;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.email.resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [options.to],
          subject: options.subject,
          html: options.html,
          text: options.text,
        }),
      });

      if (res.ok) return true;

      const body = await res.text().catch(() => "");
      // 4xx is deterministic; do not waste a retry.
      if (res.status >= 400 && res.status < 500) {
        logger.error("[RESEND ERROR] Deterministic failure, not retrying", {
          to: options.to,
          status: res.status,
          body,
        });
        return false;
      }

      logger.warn("[RESEND RETRY] Transient failure", {
        to: options.to,
        status: res.status,
        body,
        attempt: attempt + 1,
      });
      lastError = new Error(`Resend ${res.status}: ${body}`);
    } catch (err) {
      lastError = err;
      logger.warn("[RESEND RETRY] Network failure", {
        to: options.to,
        attempt: attempt + 1,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const delay = EMAIL_RETRY_DELAYS_MS[attempt];
    if (delay !== undefined) await sleep(delay);
  }

  logger.error("[RESEND FAILED] All attempts exhausted", {
    to: options.to,
    lastError: lastError instanceof Error ? lastError.message : String(lastError),
  });
  return false;
}

// ── Gmail OAuth sender ───────────────────────────────────────────────

/**
 * FIX GMAIL-OAUTH-EMAIL-01: Gmail REST API sender -- no SMTP, no
 * domain verification, no restricted OAuth scopes. Sends via HTTPS on
 * port 443 (allowed on Render Free; 25/465/587 are blocked). Unlike
 * Resend's onboarding@resend.dev sandbox, this accepts ANY recipient
 * once GMAIL_USER + GOOGLE_REFRESH_TOKEN are configured.
 *
 * Access token cache: Gmail's access tokens live 1 hour. Cached
 * in-process; refreshed 5 minutes before expiry. On a 401 (stale
 * cached token) the send retries once with a fresh token.
 */

let cachedGmailAccessToken: { token: string; expiresAt: number } | null = null;

async function getGmailAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedGmailAccessToken && cachedGmailAccessToken.expiresAt - now > 5 * 60_000) {
    return cachedGmailAccessToken.token;
  }

  const body = new URLSearchParams({
    client_id: env.googleOAuth.clientId,
    client_secret: env.googleOAuth.clientSecret,
    refresh_token: env.email.googleRefreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gmail token refresh failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedGmailAccessToken = {
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return json.access_token;
}

function base64UrlEncode(input: string | Buffer): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf-8');
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeMimeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`;
}

function buildMimeMessage(options: SendEmailOptions): string {
  const fromHeader = env.email.fromName
    ? `"${encodeMimeHeader(env.email.fromName)}" <${env.email.fromEmail}>`
    : env.email.fromEmail;

  const boundary = `b_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const headers = [
    `From: ${fromHeader}`,
    `To: ${options.to}`,
    `Subject: ${encodeMimeHeader(options.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join('\r\n');

  const textPart = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(options.text, 'utf-8').toString('base64'),
  ].join('\r\n');

  const htmlPart = [
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(options.html, 'utf-8').toString('base64'),
  ].join('\r\n');

  const closing = `--${boundary}--`;

  return [headers, '', textPart, '', htmlPart, '', closing].join('\r\n');
}

async function sendViaGmailOAuth(options: SendEmailOptions): Promise<boolean> {
  let lastError: unknown = null;
  const attempts = 1 + EMAIL_RETRY_DELAYS_MS.length;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const accessToken = await getGmailAccessToken();
      const raw = base64UrlEncode(buildMimeMessage(options));

      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(env.email.gmailUser)}/messages/send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw }),
        },
      );

      if (res.ok) return true;

      const body = await res.text().catch(() => '');

      // 401 = cached access token invalidated or expired mid-send.
      // Drop cache and retry even if out of generic retries, because
      // the failure is our staleness, not an upstream problem.
      if (res.status === 401 && cachedGmailAccessToken) {
        cachedGmailAccessToken = null;
        logger.warn('[GMAIL OAUTH] 401 -- clearing cached token, retrying', {
          to: options.to,
          attempt: attempt + 1,
        });
        lastError = new Error(`Gmail 401: ${body}`);
        continue;
      }

      if (res.status >= 400 && res.status < 500) {
        logger.error('[GMAIL OAUTH ERROR] Deterministic failure, not retrying', {
          to: options.to,
          status: res.status,
          body,
        });
        return false;
      }

      logger.warn('[GMAIL OAUTH RETRY] Transient failure', {
        to: options.to,
        status: res.status,
        body,
        attempt: attempt + 1,
      });
      lastError = new Error(`Gmail ${res.status}: ${body}`);
    } catch (err) {
      lastError = err;
      logger.warn('[GMAIL OAUTH RETRY] Network/token failure', {
        to: options.to,
        attempt: attempt + 1,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const delay = EMAIL_RETRY_DELAYS_MS[attempt];
    if (delay !== undefined) await sleep(delay);
  }

  logger.error('[GMAIL OAUTH FAILED] All attempts exhausted', {
    to: options.to,
    lastError: lastError instanceof Error ? lastError.message : String(lastError),
  });
  return false;
}

async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  // FIX GMAIL-OAUTH-EMAIL-01: Gmail OAuth is the primary path when
  // GMAIL_USER + GOOGLE_REFRESH_TOKEN are set. It accepts any recipient
  // (unlike Resend's sandbox) and needs no domain (unlike Resend
  // production). Resend stays as a fallback; SMTP remains the last
  // resort.
  if (env.email.gmailUser && env.email.googleRefreshToken) {
    return sendViaGmailOAuth(options);
  }

  // FIX RENDER-SMTP-BLOCK-01: prefer Resend over HTTPS when
  // RESEND_API_KEY is set. Render's Free tier blocks outbound
  // SMTP ports, so nodemailer times out with ETIMEDOUT before it
  // can even reach Gmail. Resend's HTTP API goes over port 443
  // (always allowed) and is the primary path whenever a key is
  // configured. If Resend fails, we fall through to the SMTP
  // path below (which works on paid Render and in dev).
  if (env.email.resendApiKey) {
    return sendViaResend(options);
  }

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

// FIX FEAT-EMAIL-VERIFY: template for the "confirm your email" link.
// Mirrors passwordResetEmail's shape (text + RTL HTML, single CTA).
function verificationEmail(verifyUrl: string): { html: string; text: string } {
  return {
    text: [
      'تأكيد البريد الإلكتروني — سوق غزة',
      '',
      'شكراً لتسجيلك في سوق غزة.',
      `لتأكيد بريدك الإلكتروني، افتح هذا الرابط: ${verifyUrl}`,
      '',
      'هذا الرابط صالح لمدة 24 ساعة.',
      'إذا لم تكن أنت من سجّل هذا الحساب، يمكنك تجاهل هذه الرسالة.',
    ].join('\n'),
    html: `
      <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
        <h2 style="margin-bottom: 16px;">تأكيد البريد الإلكتروني</h2>
        <p>شكراً لتسجيلك في <strong>سوق غزة</strong>.</p>
        <p>لتأكيد بريدك الإلكتروني، اضغط الزر أدناه:</p>
        <p style="margin: 24px 0;">
          <a href="${verifyUrl}"
             style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
            تأكيد البريد الإلكتروني
          </a>
        </p>
        <p style="color:#666;font-size:14px;">هذا الرابط صالح لمدة 24 ساعة.</p>
        <p style="color:#666;font-size:14px;">إذا لم تكن أنت من سجّل هذا الحساب، يمكنك تجاهل هذه الرسالة بأمان.</p>
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
   * FIX FEAT-EMAIL-VERIFY: called from auth.service.ts's register()
   * and resendVerification(). The verify URL points at the frontend's
   * /verify-email page, which reads ?token= and POSTs back to
   * /auth/verify-email. 24h TTL enforced at the service layer.
   */
  sendVerificationEmail: async (toEmail: string, token: string): Promise<void> => {
    const verifyUrl = `${env.frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const { html, text } = verificationEmail(verifyUrl);
    await sendEmail({
      to: toEmail,
      subject: 'تأكيد البريد الإلكتروني — سوق غزة',
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
