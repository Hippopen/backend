const cron = require('node-cron');
const { Op } = require('sequelize');
const Loan = require('../models/Loan');
const Invoice = require('../models/Invoice');

const FEE = Number(process.env.FEE_OVERDUE_PER_DAY_VND || 10000);

async function runOverdueSweep() {
  const today = new Date();

  const loans = await Loan.findAll({
    where: { status: { [Op.in]: ['borrowed','overdue'] }, due_date: { [Op.lt]: today } },
    attributes: ['loan_id','user_id','due_date','status','borrow_at']
  });

  for (const l of loans) {
    const days = Math.max(0, Math.ceil((today - new Date(l.due_date)) / (24*3600*1000)));
    const amount = days * FEE;

    if (l.status !== 'overdue') { l.status = 'overdue'; await l.save(); }

    const [inv, created] = await Invoice.findOrCreate({
      where: { loan_id: l.loan_id, type: 'overdue' },
      defaults: {
        user_id: l.user_id, days_overdue: days, amount_vnd: amount,
        issued_at: l.due_date, status: 'unpaid'
      }
    });
    if (!created && inv.status === 'unpaid') {
      inv.days_overdue = days; inv.amount_vnd = amount;
      await inv.save();
    }
  }
  console.log(`[overdue] invoices updated: ${loans.length}`);
}

function startOverdueJob() {
  const cronExpr = process.env.JOB_OVERDUE_CRON || '0 2 * * *';
  console.log('[overdue] starting job with', { cronExpr, fee: FEE });
  runOverdueSweep().catch(console.error);
  cron.schedule(cronExpr, () => runOverdueSweep().catch(console.error));
}

module.exports = { startOverdueJob, runOverdueSweep };
