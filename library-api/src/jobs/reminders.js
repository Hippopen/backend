const cron = require('node-cron');
const { Op } = require('sequelize');

const Loan = require('../models/Loan');
const User = require('../models/User');
const { mailerReady, sendMail } = require('../utils/mailer');

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function startReminders() {
  if (!mailerReady()) {
    console.log('Reminders disabled: mailer not configured (RESEND_API_KEY missing).');
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
          due_date: { [Op.between]: [today, in3Days] }
        },
        include: [{ model: User, as: 'user' }]
      });

      for (const loan of soonLoans) {
        const user = loan.user;
        if (!user) continue;

        const text =
          `Xin chào ${user.first_name || ''} ${user.last_name || ''}\n\n` +
          `Phiếu mượn #${loan.loan_id} của bạn sắp đến hạn trả vào ngày ${formatDate(loan.due_date)}.\n` +
          `Vui lòng sắp xếp thời gian đến thư viện để trả hoặc gia hạn (nếu được phép).\n\n` +
          `Trân trọng,\nThư viện`;

        let delivered = false;
        if (user.email) {
          delivered = await sendMail({
            to: user.email,
            subject: 'Nhắc trả sách sắp đến hạn',
            text
          });
        }
        if (!delivered) {
          console.log('[Reminders] Could not notify user', user.user_id);
        }
      }

      const overdueLoans = await Loan.findAll({
        where: {
          status: { [Op.in]: ['borrowed', 'overdue'] },
          due_date: { [Op.lt]: today }
        },
        include: [{ model: User, as: 'user' }]
      });

      for (const loan of overdueLoans) {
        const user = loan.user;
        if (!user) continue;

        const text =
          `Xin chào ${user.first_name || ''} ${user.last_name || ''}\n\n` +
          `Phiếu mượn #${loan.loan_id} của bạn đã quá hạn trả (ngày hẹn: ${formatDate(loan.due_date)}).\n` +
          `Vui lòng đến thư viện sớm nhất để trả sách. Phí phạt (nếu có) được tính theo quy định.\n\n` +
          `Trân trọng,\nThư viện`;

        let delivered = false;
        if (user.email) {
          delivered = await sendMail({
            to: user.email,
            subject: 'Bạn đang quá hạn trả sách',
            text
          });
        }
        if (!delivered) {
          console.log('[Reminders] Could not notify user', user.user_id);
        }
      }

      console.log(
        `[Reminders] Done: soon=${soonLoans.length}, overdue=${overdueLoans.length}`
      );
    } catch (err) {
      console.error('[Reminders] Job error:', err);
    }
  });
}

module.exports = { startReminders };
