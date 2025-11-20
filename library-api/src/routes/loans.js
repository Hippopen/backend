const express = require('express');
const QRCode = require('qrcode');
const { Op } = require('sequelize');
const { signPickupToken } = require('../utils/pickupToken');

const Loan = require('../models/Loan');
const LoanItem = require('../models/LoanItem');
const Inventory = require('../models/Inventory');

const router = express.Router();


const RENEW_DAYS = Number(process.env.POLICY_RENEW_DAYS || 7);
const MAX_RENEW  = Number(process.env.POLICY_MAX_RENEW  || 3);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/**
 * @openapi
 * /loans/{loan_id}/qr.png:
 *   get:
 *     tags: [Loans]
 *     summary: Lấy QR code để pick up sách tại quầy
 *     description: >
 *       Trả về ảnh PNG QR code chứa pickup token.
 *       Chỉ owner hoặc admin mới xem được.
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
 *         description: Ảnh PNG QR code
 *         content:
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Loan không tồn tại
 */

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

/**
 * @openapi
 * /loans:
 *   get:
 *     tags: [Loans]
 *     summary: Lấy danh sách tất cả loan của user hiện tại
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           description: Lọc theo status (pending, borrowed, returned, overdue, ...)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Danh sách loan phân trang
 */

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

/**
 * @openapi
 * /loans/{loan_id}:
 *   get:
 *     tags: [Loans]
 *     summary: Xem chi tiết 1 loan (items, invoice, transactions… nếu có)
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
 *         description: Chi tiết loan
 *       404:
 *         description: Không tìm thấy loan hoặc không thuộc về user
 */

router.get('/:loan_id', async (req, res) => {
  const loan_id = Number(req.params.loan_id);
  const loan = await Loan.findByPk(loan_id, { include: [{ model: LoanItem, as: 'items' }] });
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  if (loan.user_id !== req.user.user_id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(loan);
});

/**
 * @openapi
 * /loans/{loan_id}/cancel:
 *   post:
 *     tags: [Loans]
 *     summary: Huỷ loan khi đang pending
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
 *         description: Loan đã được huỷ
 *       404:
 *         description: Loan không tồn tại
 */

router.post('/:loan_id/cancel', async (req, res) => {
  const loan_id = Number(req.params.loan_id);
  const loan = await Loan.findByPk(loan_id, { include: [{ model: LoanItem, as: 'items' }] });
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  if (loan.user_id !== req.user.user_id) return res.status(403).json({ error: 'Forbidden' });
  if (loan.status !== 'pending') return res.status(409).json({ error: 'Only pending loans can be canceled' });

  for (const item of loan.items) {
    await Inventory.increment({ available: item.quantity }, { where: { book_id: item.book_id } });
  }
  loan.status = 'canceled';
  await loan.save();

  res.json({ message: 'Canceled', loan_id: loan.loan_id });
});

/**
 * @openapi
 * /loans/{loan_id}/renew:
 *   post:
 *     tags: [Loans]
 *     summary: User gia hạn thêm số ngày cho phép (POLICY_RENEW_DAYS)
 *     description: >
 *       Tăng due_date nếu số lần renew < MAX_RENEW và loan đang ở trạng thái borrowed/overdue.
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
 *         description: Không thể gia hạn (vượt MAX_RENEW, trạng thái không hợp lệ...)
 *       404:
 *         description: Loan không tồn tại
 */

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
