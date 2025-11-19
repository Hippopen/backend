// src/utils/mailer.js
const fetch = require('node-fetch');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM = process.env.MAIL_FROM || 'WebShelf <no-reply@example.com>';

function mailerReady() {
  return !!RESEND_API_KEY;
}

/**
 * Gửi email (dùng HTTP API – ví dụ Resend)
 * Dùng được cả cho kiểu gọi:
 *   sendMail({ to, subject, text, html })
 */
async function sendMail({ to, subject, text, html } = {}) {
  if (!RESEND_API_KEY) {
    console.log('[Mailer] RESEND_API_KEY not set, skip email to', to);
    return false;
  }

  if (!to || !subject) {
    console.log('[Mailer] Missing "to" or "subject", skip email');
    return false;
  }

  // Xử lý text / html an toàn
  const hasText = typeof text === 'string' && text.trim() !== '';
  const hasHtml = typeof html === 'string' && html.trim() !== '';

  const body = {
    from: MAIL_FROM,
    to,
    subject,
  };

  if (hasText) {
    body.text = text;
  }

  // Nếu có html thì dùng, không thì lấy từ text (nếu có)
  if (hasHtml) {
    body.html = html;
  } else if (hasText) {
    body.html = text.replace(/\n/g, '<br/>');
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[Mailer] Resend API error:', res.status, errText);
      return false;
    }

    console.log('[Mailer] Email sent to', to);
    return true;
  } catch (err) {
    console.error('[Mailer] Error sending email', err);
    return false;
  }
}

module.exports = {
  sendMail,
  mailerReady,
};
