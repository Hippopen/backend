// src/routes/admin.js
const express = require('express');
const { Op } = require('sequelize');
const { sequelize } = require('../db');

const adminOnly = require('../middleware/admin');
const { verifyPickupToken } = require('../utils/pickupToken');
const { hash } = require('../utils/password');

const Book        = require('../models/Book');
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

/**
 * @openapi
 * /admin/scan:
 *   post:
 *     tags: [Admin]
 *     summary: Quầy thủ thư quét QR / code để lấy thông tin loan pending
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *                 description: Mã loan (hoặc token pick-up tuỳ implement)
 *     responses:
 *       200:
 *         description: Thông tin loan + items để chuẩn bị giao sách
 *       404:
 *         description: Không tìm thấy loan
 */

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

/**
 * @openapi
 * /admin/loans:
 *   get:
 *     tags: [Admin]
 *     summary: Danh sA�ch loan (c��% filter)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           description: pending | borrowed | returned | cancelled | overdue | lost
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Danh sách loan
 *       500:
 *         description: Lỗi server
 */
router.get('/loans', async (req, res) => {
  try {
    const { status, code } = req.query;
    let { user_id, limit = 50, offset = 0 } = req.query;

    const where = {};
    if (typeof status === 'string' && status.trim() !== '') {
      where.status = status.trim();
    }
    if (typeof code === 'string' && code.trim() !== '') {
      where.code = code.trim();
    }
    if (user_id !== undefined) {
      user_id = Number(user_id);
      if (Number.isFinite(user_id)) where.user_id = user_id;
    }
    limit = Number(limit);
    if (!Number.isInteger(limit) || limit <= 0) limit = 50;
    limit = Math.min(limit, 200);
    offset = Number(offset);
    if (!Number.isInteger(offset) || offset < 0) offset = 0;

    const result = await Loan.findAndCountAll({
      where,
      limit,
      offset,
      order: [['loan_id', 'DESC']],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'email', 'phone', 'first_name', 'last_name']
        },
        {
          model: LoanItem,
          as: 'items',
          attributes: ['loan_item_id', 'book_id', 'quantity'],
          include: [
            {
              model: Book,
              as: 'book',
              attributes: ['book_id', 'title', 'author']
            }
          ]
        }
      ],
      distinct: true
    });

    res.json({
      count: result.count,
      rows: result.rows,
      limit,
      offset
    });
  } catch (e) {
    console.error('List loans error:', e);
    res.status(500).json({ error: 'Failed to load loans' });
  }
});

/**
 * @openapi
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: Danh sách user role = user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           description: Search theo email / phone / tên
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Danh sách user
 */
router.get('/users', async (req, res) => {
  try {
    let { search, limit = 50, offset = 0 } = req.query;
    limit = Number(limit);
    if (!Number.isInteger(limit) || limit <= 0) limit = 50;
    limit = Math.min(limit, 200);
    offset = Number(offset);
    if (!Number.isInteger(offset) || offset < 0) offset = 0;

    const where = { role: 'user' };
    if (typeof search === 'string' && search.trim() !== '') {
      const pattern = `%${search.trim()}%`;
      where[Op.or] = [
        { email: { [Op.like]: pattern } },
        { phone: { [Op.like]: pattern } },
        { first_name: { [Op.like]: pattern } },
        { last_name: { [Op.like]: pattern } }
      ];
    }

    const result = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password_hash', 'role'] },
      limit,
      offset,
      order: [['user_id', 'DESC']],
      distinct: true
    });

    res.json({ count: result.count, rows: result.rows, limit, offset });
  } catch (e) {
    console.error('List admin users error:', e);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

/**
 * @openapi
 * /admin/users/{user_id}:
 *   put:
 *     tags: [Admin]
 *     summary: Cập nhật user (first/last name, password)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: user_id
 *         schema:
 *           type: integer
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: User sau khi cập nhật
 *       400:
 *         description: Thiếu hoặc sai dữ liệu
 *       404:
 *         description: User không tồn tại
 */
router.put('/users/:user_id', async (req, res) => {
  try {
    const user_id = Number(req.params.user_id);
    if (!Number.isInteger(user_id)) return res.status(400).json({ error: 'Invalid user_id' });

    const user = await User.findOne({ where: { user_id, role: 'user' } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { first_name, last_name, password } = req.body || {};
    let updated = false;

    if (typeof first_name === 'string') {
      user.first_name = first_name.trim();
      updated = true;
    }
    if (typeof last_name === 'string') {
      user.last_name = last_name.trim();
      updated = true;
    }
    if (password !== undefined) {
      if (typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      user.password_hash = await hash(password);
      updated = true;
    }
    if (!updated) return res.status(400).json({ error: 'Nothing to update' });

    await user.save();
    const plain = user.toJSON();
    delete plain.password_hash;
    delete plain.role;
    res.json(plain);
  } catch (e) {
    console.error('Update admin user error:', e);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * @openapi
 * /admin/users/{user_id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Xoá user role=user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Đã xoá
 *       404:
 *         description: User không tồn tại
 */
router.delete('/users/:user_id', async (req, res) => {
  try {
    const user_id = Number(req.params.user_id);
    if (!Number.isInteger(user_id)) return res.status(400).json({ error: 'Invalid user_id' });

    const user = await User.findOne({ where: { user_id, role: 'user' } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await user.destroy();
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error('Delete admin user error:', e);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

/**
 * @openapi
 * /admin/loans/{loan_id}/confirm:
 *   post:
 *     tags: [Admin]
 *     summary: Xác nhận cho mượn (từ pending → borrowed)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: loan_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Loan được set sang borrowed, có borrow_at & due_date
 *       400:
 *         description: Loan không ở trạng thái hợp lệ
 *       404:
 *         description: Không tìm thấy loan
 */

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

/**
 * @openapi
 * /admin/loans/{loan_id}/renew:
 *   post:
 *     tags: [Admin]
 *     summary: Admin gia hạn loan (ví dụ khi xử lý tại quầy)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: loan_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Gia hạn thành công
 *       400:
 *         description: Không thể gia hạn
 *       404:
 *         description: Loan không tồn tại
 */

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

/**
 * @openapi
 * /admin/loans/{loan_id}/cancel:
 *   post:
 *     tags: [Admin]
 *     summary: Huỷ loan (trả lại stock đã giữ chỗ)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: loan_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Loan bị huỷ
 *       404:
 *         description: Loan không tồn tại
 */

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

/**
 * @openapi
 * /admin/loans/{loan_id}/return:
 *   post:
 *     tags: [Admin]
 *     summary: Đánh dấu loan đã trả sách
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: loan_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Cập nhật return_at, status=returned
 *       404:
 *         description: Loan không tồn tại
 */

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

/**
 * @openapi
 * /admin/invoices:
 *   get:
 *     tags: [Admin]
 *     summary: Admin xem danh sách invoice của tất cả user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           description: overdue | damage | lost ...
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Danh sách invoice
 */

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

/**
 * @openapi
 * /admin/invoices/{invoice_id}/mark-paid:
 *   post:
 *     tags: [Admin]
 *     summary: Đánh dấu invoice đã thanh toán & tạo transaction
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invoice_id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               provider:
 *                 type: string
 *                 example: cash
 *               ref:
 *                 type: string
 *                 description: Mã hoá đơn/hoá đơn giấy, mã giao dịch POS...
 *     responses:
 *       200:
 *         description: Đánh dấu paid & ghi transaction thành công
 *       400:
 *         description: Invoice không ở trạng thái unpaid
 *       404:
 *         description: Không tìm thấy invoice
 */

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

/**
 * @openapi
 * /admin/invoices/{invoice_id}/void:
 *   post:
 *     tags: [Admin]
 *     summary: Huỷ invoice (void) – dùng khi tạo nhầm
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invoice_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Invoice được set status=void
 *       404:
 *         description: Không tìm thấy invoice
 */

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

/**
 * @openapi
 * /admin/transactions:
 *   get:
 *     tags: [Admin]
 *     summary: Xem lịch sử transaction của toàn hệ thống
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Danh sách transaction
 */

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

/**
 * @openapi
 * /admin/reviews:
 *   get:
 *     tags: [Admin]
 *     summary: Liệt kê review để moderation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           description: pending | visible | hidden
 *       - in: query
 *         name: book_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Danh sách review theo filter
 */

router.get('/reviews', async (req, res) => {
  const { status, book_id, user_id } = req.query;
  const where = {};
  if (status)  where.status  = status; // 'visible' | 'hidden' | 'pending'
  if (book_id) where.book_id = book_id;
  if (user_id) where.user_id = user_id;

  const rows = await Review.findAll({ where, order: [['created_at', 'DESC']] });
  res.json({ count: rows.length, rows });
});

/**
 * @openapi
 * /admin/reviews/{review_id}/hide:
 *   put:
 *     tags: [Admin]
 *     summary: Ẩn review (status=hidden)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: review_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Ẩn review thành công
 *       404:
 *         description: Review không tồn tại
 */

router.put('/reviews/:review_id/hide', async (req, res) => {
  const review = await Review.findByPk(req.params.review_id);
  if (!review) return res.status(404).json({ error: 'Review not found' });
  review.status = 'hidden';
  await review.save();
  res.json({ message: 'Review hidden', review_id: review.review_id });
});

/**
 * @openapi
 * /admin/reviews/{review_id}/show:
 *   put:
 *     tags: [Admin]
 *     summary: Duyệt / hiện review (status=visible)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: review_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Hiện review thành công
 *       404:
 *         description: Review không tồn tại
 */

router.put('/reviews/:review_id/show', async (req, res) => {
  const review = await Review.findByPk(req.params.review_id);
  if (!review) return res.status(404).json({ error: 'Review not found' });
  review.status = 'visible';
  await review.save();
  res.json({ message: 'Review visible', review_id: review.review_id });
});

/**
 * @openapi
 * /admin/jobs/run-overdue:
 *   post:
 *     tags: [Admin]
 *     summary: Chạy job tính phí overdue thủ công (dùng để test/đối soát)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job chạy xong, trả về số invoice được cập nhật
 *       500:
 *         description: Job lỗi
 */

router.post('/jobs/run-overdue', async (req, res) => {
  try {
    const result = await runOverdueJob(); // trả { updated }
    res.json({ message: 'overdue job done', ...result });
  } catch (e) {
    res.status(500).json({ error: 'job failed', detail: e?.message });
  }
});

module.exports = router;
