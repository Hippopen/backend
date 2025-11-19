const fetch = require('node-fetch');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM = process.env.MAIL_FROM || 'WebShelf <no-reply@example.com>';

function mailerReady() {
  return !!RESEND_API_KEY;
}

/**
 * Gửi email bằng Resend API
 * @param {string} to
 * @param {string} subject
 * @param {string} text
 * @param {string} [html]
 * @returns {Promise<boolean>}
 */
async function sendMail(to, subject, text, html) {
  if (!RESEND_API_KEY) {
    console.log('[Mailer] RESEND_API_KEY not set, skip sending email to', to);
    return false;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to,
        subject,
        text,
        html: html || text.replace(/\n/g, '<br/>'),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[Mailer] Resend API error', res.status, body);
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
  mailerReady,
  sendMail,
};
