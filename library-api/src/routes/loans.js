const express = require('express');
const QRCode = require('qrcode');
const { Op } = require('sequelize');
const { signPickupToken } = require('../utils/pickupToken');

const Loan = require('../models/Loan');
const LoanItem = require('../models/LoanItem');

const router = express.Router();


const RENEW_DAYS = Number(process.env.POLICY_RENEW_DAYS || 7);
const MAX_RENEW  = Number(process.env.POLICY_MAX_RENEW  || 3);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

router.get('/:loan_id/qr.png', async (req, res) => {
  const loan_id = Number(req.params.loan_id);
  const loan = await Loan.findByPk(loan_id);
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  if (loan.user_id !== req.user.user_id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const token = signPickupToken(loan.loan_id, loan.code, '7d');
  const url = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/pickup?token=${token}`;
  const png = await QRCode.toBuffer(url, { type: 'png', width: 256, errorCorrectionLevel: 'M' });
  res.set('Content-Type', 'image/png').send(png);
});

if (process.env.ENABLE_QR_DEBUG === '1' && process.env.NODE_ENV !== 'production') {
  router.get('/:loan_id/qr-debug', async (req, res) => {
    const loan_id = Number(req.params.loan_id);
    const loan = await Loan.findByPk(loan_id);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    if (loan.user_id !== req.user.user_id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const token = signPickupToken(loan.loan_id, loan.code, '7d');
    const url = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/pickup?token=${token}`;
    res.json({ token, url });
  });
}

router.get('/', async (req, res) => {
  const user_id = req.user.user_id;
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const offset = Number(req.query.offset || 0);
  const status = req.query.status;

  const where = { user_id };
  if (status) where.status = status;

  const { rows, count } = await Loan.findAndCountAll({
    where, include: [{ model: LoanItem, as: 'items' }],
    order: [['loan_id', 'DESC']], limit, offset
  });

  res.json({
    total: count,
    items: rows.map(l => ({
      loan_id: l.loan_id, code: l.code, status: l.status,
      borrow_at: l.borrow_at, due_date: l.due_date, return_at: l.return_at,
      renew_count: l.renew_count,
      items: l.items.map(i => ({ book_id: i.book_id, quantity: i.quantity }))
    }))
  });
});

router.get('/:loan_id', async (req, res) => {
  const loan_id = Number(req.params.loan_id);
  const loan = await Loan.findByPk(loan_id, { include: [{ model: LoanItem, as: 'items' }] });
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  if (loan.user_id !== req.user.user_id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(loan);
});

router.post('/:loan_id/renew', async (req, res) => {
  const loan_id = Number(req.params.loan_id);
  const loan = await Loan.findByPk(loan_id);
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  if (loan.user_id !== req.user.user_id) return res.status(403).json({ error: 'Forbidden' });

  if (loan.status !== 'borrowed') return res.status(409).json({ error: 'Only borrowed loans can be renewed' });
  if (loan.renew_count >= MAX_RENEW) return res.status(409).json({ error: 'Max renew reached' });

  const now = new Date();
  const due = new Date(loan.due_date);
  if (now > due) return res.status(409).json({ error: 'Past due date' });

  const newDue = addDays(due, RENEW_DAYS);
  loan.due_date = newDue;
  loan.renew_count += 1;
  await loan.save();

  res.json({ message: 'Renewed', due_date: loan.due_date, renew_count: loan.renew_count });
});

module.exports = router;
