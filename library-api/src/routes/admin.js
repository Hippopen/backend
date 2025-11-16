// src/routes/admin.js
const express = require('express');
const { Op } = require('sequelize');
const { sequelize } = require('../db');

const adminOnly = require('../middleware/admin');
const { verifyPickupToken } = require('../utils/pickupToken');

const Loan        = require('../models/Loan');
const LoanItem    = require('../models/LoanItem');
const Inventory   = require('../models/Inventory');
const Invoice     = require('../models/Invoice');
const Transaction = require('../models/Transaction');
const Review      = require('../models/Review');
const User        = require('../models/User');

const runOverdueJob = require('../jobs/overdue'); // POST /admin/jobs/run-overdue

const router = express.Router();

// toàn bộ /admin/* yêu cầu admin
router.use(adminOnly);

// Các hằng phục vụ kiểm tra trạng thái
const RESERVED_STATUSES   = ['reserved', 'pending', 'awaiting_pickup'];
const BORROWABLE_STATUSES = ['reserved', 'pending', 'awaiting_pickup'];
const RETURNABLE_STATUSES = ['borrowed', 'overdue'];
const POLICY_LOAN_DAYS    = Number(process.env.POLICY_LOAN_DAYS || 7);
const POLICY_MAX_RENEW    = Number(process.env.POLICY_MAX_RENEW || 3);

/* =========================================================
 * 1) SCAN QR: nhận token, trả thông tin phiếu để xác nhận
 * =======================================================*/
router.post('/scan', async (req, res) => {
  try {
    const token = req.body.token || req.query.token;
    if (!token) return res.status(400).json({ error: 'token required' });

    const payload = verifyPickupToken(token); // { loan_id, code }
    const loan = await Loan.findByPk(payload.loan_id, {
      include: [{ model: LoanItem, as: 'items' }],
    });
    if (!loan || loan.code !== payload.code) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    return res.json({
      loan_id: loan.loan_id,
      user_id: loan.user_id,
      status: loan.status,
      items: loan.items.map(i => ({ book_id: i.book_id, quantity: i.quantity })),
    });
  } catch (e) {
    return res.status(400).json({ error: 'invalid/expired token' });
  }
});

/* =========================================================
 * 2) CONFIRM PICKUP: đổi reserved/pending -> borrowed
 * =======================================================*/
router.post('/loans/:loan_id/confirm', async (req, res) => {
  const loan = await Loan.findByPk(req.params.loan_id, {
    include: [{ model: LoanItem, as: 'items' }],
  });
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  if (!BORROWABLE_STATUSES.includes(loan.status)) {
    return res.status(409).json({ error: 'Loan not in reserved/pending' });
  }
  const now = new Date();
  const due = new Date(now);
  due.setDate(due.getDate() + POLICY_LOAN_DAYS);

  loan.status    = 'borrowed';
  loan.borrow_at = now;
  loan.due_date  = due;
  await loan.save();

  return res.json({ message: 'Borrowed', loan_id: loan.loan_id, due_date: loan.due_date });
});

/* =========================================================
 * 3) RENEW: gia hạn (chặn nếu đã đạt max hoặc có invoice unpaid)
 * =======================================================*/
router.post('/loans/:loan_id/renew', async (req, res) => {
  const loan = await Loan.findByPk(req.params.loan_id);
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  if (loan.status !== 'borrowed') return res.status(409).json({ error: 'Loan not borrowed' });

  const unpaid = await Invoice.count({ where: { user_id: loan.user_id, status: 'unpaid' } });
  if (unpaid) return res.status(409).json({ error: 'Unpaid invoices' });

  if ((loan.renew_count || 0) >= POLICY_MAX_RENEW) {
    return res.status(409).json({ error: 'Renew limit reached' });
  }

  const base = loan.due_date ? new Date(loan.due_date) : new Date();
  base.setDate(base.getDate() + POLICY_LOAN_DAYS);

  loan.due_date   = base;
  loan.renew_count = (loan.renew_count || 0) + 1;
  await loan.save();

  return res.json({ message: 'Renewed', due_date: loan.due_date, renew_count: loan.renew_count });
});

/* =========================================================
 * 4) CANCEL: hủy phiếu reserved/pending, trả lại tồn kho
 * =======================================================*/
router.post('/loans/:loan_id/cancel', async (req, res) => {
  const loan = await Loan.findByPk(req.params.loan_id, {
    include: [{ model: LoanItem, as: 'items' }],
  });
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  if (!RESERVED_STATUSES.includes(loan.status)) {
    return res.status(409).json({ error: 'Only reserved/pending can be cancelled' });
  }

  for (const item of loan.items) {
    await Inventory.increment({ available: item.quantity }, { where: { book_id: item.book_id } });
  }
  loan.status = 'cancelled';
  await loan.save();

  return res.json({ message: 'Cancelled', loan_id: loan.loan_id });
});

/* =========================================================
 * 5) RETURN: trả sách borrowed/overdue, cộng lại tồn kho
 * =======================================================*/
router.post('/loans/:loan_id/return', async (req, res) => {
  const loan = await Loan.findByPk(req.params.loan_id, {
    include: [{ model: LoanItem, as: 'items' }],
  });
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  if (!RETURNABLE_STATUSES.includes(loan.status)) {
    return res.status(409).json({ error: 'Loan not in borrowed/overdue' });
  }

  for (const item of loan.items) {
    await Inventory.increment({ available: item.quantity }, { where: { book_id: item.book_id } });
  }
  loan.status    = 'returned';
  loan.return_at = new Date();
  await loan.save();

  return res.json({ message: 'Returned', loan_id: loan.loan_id });
});

/* =========================================================
 * 6) INVOICES: list/filters cho admin
 *    GET /admin/invoices?status=&user_id=&loan_id=&from=&to=
 * =======================================================*/
router.get('/invoices', async (req, res) => {
  const { status, user_id, loan_id, from, to } = req.query;
  const where = {};
  if (status)  where.status  = status;
  if (user_id) where.user_id = user_id;
  if (loan_id) where.loan_id = loan_id;
  if (from || to) {
    where.issued_at = {};
    if (from) where.issued_at[Op.gte] = new Date(from);
    if (to)   where.issued_at[Op.lte] = new Date(to);
  }

  const invoices = await Invoice.findAll({
    where,
    order: [['issued_at', 'DESC']],
    include: [
      { model: Loan, as: 'loan' },
      { model: User, as: 'user', attributes: ['user_id','email','phone','first_name','last_name'] }
    ],
  });
  res.json({ count: invoices.length, rows: invoices });
});

/* =========================================================
 * 7) MARK PAID: thanh toán 1 invoice (tạo Transaction, trong transaction DB)
 *    POST /admin/invoices/:invoice_id/mark-paid
 * =======================================================*/
router.post('/invoices/:invoice_id/mark-paid', async (req, res) => {
  const id  = Number(req.params.invoice_id);
  const inv = await Invoice.findByPk(id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });

  if (inv.status === 'paid') {
    return res.status(409).json({ error: 'Invoice already paid' });
  }
  if (inv.status === 'void') {
    return res.status(409).json({ error: 'Invoice is void' });
  }

  const provider = req.body?.provider || 'cash';
  const txRef    = req.body?.tx_ref || `CASH-${Date.now()}`;
  const note     = req.body?.note || inv.note;

  await sequelize.transaction(async (t) => {
    // cập nhật invoice
    inv.status  = 'paid';
    inv.paid_at = new Date();
    inv.note    = note;
    await inv.save({ transaction: t });

    // ghi log transaction
    await Transaction.create({
      user_id:      inv.user_id,
      loan_id:      inv.loan_id,
      loan_item_id: null,
      invoice_id:   inv.invoice_id,
      type:         'payment',
      status:       'succeeded',
      currency:     'VND',
      amount_vnd:   inv.amount_vnd,
      provider:     provider,
      tx_ref:       txRef,
      tx_meta:      null,
      paid_at:      inv.paid_at
    }, { transaction: t });
  });

  res.json({ message: 'Marked paid', invoice_id: inv.invoice_id, paid_at: inv.paid_at });
});

/* =========================================================
 * 8) VOID invoice (hủy hoá đơn – không thu tiền)
 *    POST /admin/invoices/:invoice_id/void
 * =======================================================*/
router.post('/invoices/:invoice_id/void', async (req, res) => {
  const id  = Number(req.params.invoice_id);
  const inv = await Invoice.findByPk(id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });

  if (inv.status !== 'unpaid') {
    return res.status(409).json({ error: 'Only unpaid can be void' });
  }

  inv.status = 'void';
  inv.note   = req.body?.note || inv.note;
  await inv.save();

  res.json({ message: 'Invoice voided', invoice_id: inv.invoice_id });
});

/* =========================================================
 * 9) TRANSACTIONS: list (lọc cơ bản)
 *    GET /admin/transactions?user_id=&invoice_id=&provider=&status=&from=&to=
 * =======================================================*/
router.get('/transactions', async (req, res) => {
  const { user_id, invoice_id, provider, status, from, to } = req.query;
  const where = {};
  if (user_id)    where.user_id    = user_id;
  if (invoice_id) where.invoice_id = invoice_id;
  if (provider)   where.provider   = provider;
  if (status)     where.status     = status;
  if (from || to) {
    where.created_at = {};
    if (from) where.created_at[Op.gte] = new Date(from);
    if (to)   where.created_at[Op.lte] = new Date(to);
  }

  const txs = await Transaction.findAll({
    where,
    order: [['created_at', 'DESC']],
  });
  res.json({ count: txs.length, rows: txs });
});

/* =========================================================
 * 10) REVIEWS moderation: show / hide / list pending
 * =======================================================*/
router.get('/reviews', async (req, res) => {
  const { status, book_id, user_id } = req.query;
  const where = {};
  if (status)  where.status  = status; // 'visible' | 'hidden' | 'pending'
  if (book_id) where.book_id = book_id;
  if (user_id) where.user_id = user_id;

  const rows = await Review.findAll({ where, order: [['created_at', 'DESC']] });
  res.json({ count: rows.length, rows });
});

// Ẩn review
router.put('/reviews/:review_id/hide', async (req, res) => {
  const review = await Review.findByPk(req.params.review_id);
  if (!review) return res.status(404).json({ error: 'Review not found' });
  review.status = 'hidden';
  await review.save();
  res.json({ message: 'Review hidden', review_id: review.review_id });
});

// Hiện/duyệt review
router.put('/reviews/:review_id/show', async (req, res) => {
  const review = await Review.findByPk(req.params.review_id);
  if (!review) return res.status(404).json({ error: 'Review not found' });
  review.status = 'visible';
  await review.save();
  res.json({ message: 'Review visible', review_id: review.review_id });
});

/* =========================================================
 * 11) Chạy job overdue thủ công (đối soát / test)
 * =======================================================*/
router.post('/jobs/run-overdue', async (req, res) => {
  try {
    const result = await runOverdueJob(); // trả { updated }
    res.json({ message: 'overdue job done', ...result });
  } catch (e) {
    res.status(500).json({ error: 'job failed', detail: e?.message });
  }
});

module.exports = router;
