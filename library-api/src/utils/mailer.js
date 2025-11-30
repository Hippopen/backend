const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MAIL_FROM = process.env.MAIL_FROM || 'WebShelf <no-reply@example.com>';

let transporter;

// Check if SMTP credentials are available
function mailerReady() {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // true for 465, false for 587/25
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  }
  return transporter;
}

/**
 * Send email via SMTP (AWS SES)
 * @param {{ to: string, subject: string, text?: string, html?: string }} params
 * @returns {Promise<boolean>}
 */
async function sendMail({ to, subject, text, html } = {}) {
  if (!mailerReady()) {
    console.log('[Mailer] SMTP credentials missing, skip email to', to);
    return false;
  }

  if (!to || !subject) {
    console.log('[Mailer] Missing "to" or "subject", skip email');
    return false;
  }

  const hasText = typeof text === 'string' && text.trim() !== '';
  const hasHtml = typeof html === 'string' && html.trim() !== '';

  const mailOptions = {
    from: MAIL_FROM,
    to,
    subject,
  };

  if (hasText) {
    mailOptions.text = text;
  }

  if (hasHtml) {
    mailOptions.html = html;
  } else if (hasText) {
    mailOptions.html = text.replace(/\n/g, '<br/>');
  }

  try {
    await getTransporter().sendMail(mailOptions);
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
