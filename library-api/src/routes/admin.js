const express = require('express');
const { sequelize } = require('../db');
const { Transaction, Op } = require('sequelize');
const { verifyPickupToken } = require('../utils/pickupToken');

const Loan = require('../models/Loan');
const LoanItem = require('../models/LoanItem');
const Inventory = require('../models/Inventory');

const router = express.Router();

router.post('/scan', async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Missing token' });

  let payload;
  try {
    payload = verifyPickupToken(token);
    if (payload.purpose !== 'pickup') throw new Error('bad purpose');
  } catch {
    return res.status(400).json({ error: 'Invalid/expired token' });
  }

  const loan = await Loan.findByPk(payload.loan_id, { include: [{ model: LoanItem, as: 'items' }] });
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  if (loan.code !== payload.code) return res.status(400).json({ error: 'Mismatched code' });

  res.json({
    loan_id: loan.loan_id,
    user_id: loan.user_id,
    code: loan.code,
    status: loan.status,
    items: loan.items.map(i => ({ book_id: i.book_id, quantity: i.quantity }))
  });
});

const LOAN_DAYS  = Number(process.env.POLICY_LOAN_DAYS  || 14);
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

router.post('/loans/:loan_id/confirm', async (req, res) => {
  const loan_id = Number(req.params.loan_id);
  const loan = await Loan.findByPk(loan_id);
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  if (loan.status !== 'pending') return res.status(409).json({ error: 'Loan not pending' });

  const now = new Date();
  loan.status = 'borrowed';
  loan.borrow_at = now;
  loan.due_date = addDays(now, LOAN_DAYS);
  await loan.save();

  res.json({ message: 'Checked-out to user', loan_id: loan.loan_id, due_date: loan.due_date });
});

router.post('/loans/:loan_id/return', async (req, res) => {
  const loan_id = Number(req.params.loan_id);
  const t = await sequelize.transaction();
  try {
    const loan = await Loan.findByPk(loan_id, { transaction: t });
    if (!loan) { await t.rollback(); return res.status(404).json({ error: 'Loan not found' }); }
    if (loan.status !== 'borrowed') { await t.rollback(); return res.status(409).json({ error: 'Loan not borrowed' }); }

    const items = await LoanItem.findAll({ where: { loan_id }, transaction: t, lock: Transaction.LOCK.UPDATE });

    for (const it of items) {
      const inv = await Inventory.findOne({ where: { book_id: it.book_id }, transaction: t, lock: Transaction.LOCK.UPDATE });
      if (!inv) { await t.rollback(); return res.status(500).json({ error: `Inventory missing for book ${it.book_id}` }); }
      inv.available += it.quantity;
      await inv.save({ transaction: t });
    }

    loan.status = 'returned';
    loan.return_at = new Date();
    await loan.save({ transaction: t });

    await t.commit();
    res.json({ message: 'Returned', loan_id });
  } catch (e) {
    await t.rollback();
    console.error(e);
    res.status(500).json({ error: 'Return failed' });
  }
});

router.post('/loans/:loan_id/cancel', async (req, res) => {
  const loan_id = Number(req.params.loan_id);
  const t = await sequelize.transaction();
  try {
    const loan = await Loan.findByPk(loan_id, { transaction: t });
    if (!loan) { await t.rollback(); return res.status(404).json({ error: 'Loan not found' }); }
    if (loan.status !== 'pending') { await t.rollback(); return res.status(409).json({ error: 'Only pending can be canceled' }); }

    const items = await LoanItem.findAll({ where: { loan_id }, transaction: t, lock: Transaction.LOCK.UPDATE });
    for (const it of items) {
      const inv = await Inventory.findOne({ where: { book_id: it.book_id }, transaction: t, lock: Transaction.LOCK.UPDATE });
      inv.available += it.quantity;
      await inv.save({ transaction: t });
    }

    loan.status = 'canceled';
    await loan.save({ transaction: t });

    await t.commit();
    res.json({ message: 'Canceled', loan_id });
  } catch (e) {
    await t.rollback();
    console.error(e);
    res.status(500).json({ error: 'Cancel failed' });
  }
});

module.exports = router;
