const cron = require('node-cron');
const nodemailer = require('nodemailer');
const { Op } = require('sequelize');

const Loan = require('../models/Loan');
const User = require('../models/User');

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  MAIL_FROM,
} = process.env;

// Tạo transporter gửi mail
const transporter = SMTP_HOST
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 587),
      secure: false,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    })
  : null;

async function sendMail(to, subject, text) {
  if (!to || !transporter) return;

  try {
    await transporter.sendMail({
      from: MAIL_FROM || SMTP_USER,
      to,
      subject,
      text,
    });
    console.log('Reminder mail sent to', to, '-', subject);
  } catch (err) {
    console.error('Error sending reminder mail to', to, err);
  }
}

function startReminders() {
  if (!transporter) {
    console.log('Reminders disabled: SMTP not configured.');
    return;
  }

  cron.schedule('0 7 * * *', async () => {
    console.log('[Reminders] Job started at 7:00');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const in3Days = new Date(today);
    in3Days.setDate(in3Days.getDate() + 3);

    try {
      const soonLoans = await Loan.findAll({
        where: {
          status: 'borrowed',
          due_date: {
            [Op.between]: [today, in3Days],
          },
        },
        include: [{ model: User, as: 'user' }],
      });

      for (const loan of soonLoans) {
        const user = loan.user;
        if (!user || !user.email) continue;

        const text =
          `Xin chào ${user.first_name || ''} ${user.last_name || ''}\n\n` +
          `Phiếu mượn #${loan.loan_id} của bạn sẽ đến hạn trả sách vào ngày ${loan.due_date.toISOString().slice(0, 10)}.\n` +
          `Vui lòng sắp xếp thời gian đến thư viện để trả hoặc gia hạn (nếu được phép).\n\n` +
          `Trân trọng,\nThư viện`;

        await sendMail(user.email, 'Nhắc trả sách sắp đến hạn', text);
      }

      const overdueLoans = await Loan.findAll({
        where: {
          status: {
            [Op.in]: ['borrowed', 'overdue'],
          },
          due_date: {
            [Op.lt]: today,
          },
        },
        include: [{ model: User, as: 'user' }],
      });

      for (const loan of overdueLoans) {
        const user = loan.user;
        if (!user || !user.email) continue;

        const text =
          `Xin chào ${user.first_name || ''} ${user.last_name || ''}\n\n` +
          `Phiếu mượn #${loan.loan_id} của bạn đã quá hạn trả sách (ngày hẹn trả: ${loan.due_date.toISOString().slice(0, 10)}).\n` +
          `Vui lòng đến thư viện sớm nhất có thể để trả sách. Phí phạt (nếu có) sẽ được tính theo quy định.\n\n` +
          `Trân trọng,\nThư viện`;

        await sendMail(user.email, 'Bạn đang quá hạn trả sách', text);
      }

      console.log(
        `[Reminders] Done: soon=${soonLoans.length}, overdue=${overdueLoans.length}`,
      );
    } catch (err) {
      console.error('[Reminders] Job error:', err);
    }
  });
}

module.exports = { startReminders };
