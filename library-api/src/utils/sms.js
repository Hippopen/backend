const twilio = require('twilio');

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM
} = process.env;

const smsClient =
  TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
    ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    : null;

async function sendSms(to, body) {
  if (!smsClient || !TWILIO_FROM || !to) {
    console.log('[SMS] Unable to send', { to, body });
    return false;
  }
  try {
    await smsClient.messages.create({ from: TWILIO_FROM, to, body });
    return true;
  } catch (err) {
    console.error('[SMS] Failed to send to', to, err);
    return false;
  }
}

function smsReady() {
  return Boolean(smsClient && TWILIO_FROM);
}

module.exports = { sendSms, smsReady };
