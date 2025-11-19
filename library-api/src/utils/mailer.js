const nodemailer = require('nodemailer');

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  MAIL_FROM
} = process.env;

const transporter =
  SMTP_HOST && SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT || 587),
        secure: Number(SMTP_PORT || 587) === 465,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS
        }
      })
    : null;

async function sendMail({ to, subject, text, html }) {
  if (!transporter || !to) return false;
  try {
    await transporter.sendMail({
      from: MAIL_FROM || SMTP_USER,
      to,
      subject,
      text,
      html
    });
    return true;
  } catch (err) {
    console.error('[Mailer] Failed to send mail to', to, err);
    return false;
  }
}

function mailerReady() {
  return Boolean(transporter);
}

module.exports = { sendMail, mailerReady };
