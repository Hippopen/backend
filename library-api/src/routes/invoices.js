// src/routes/invoices.js
const express = require('express');
const { Op } = require('sequelize');
const Invoice = require('../models/Invoice');
const Loan = require('../models/Loan');

const router = express.Router();

/**
 * @openapi
 * /invoices:
 *   get:
 *     tags: [Invoices]
 *     summary: Liệt kê hoá đơn của user hiện tại
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           description: unpaid | paid | void ...
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

/**
 * @openapi
 * /invoices/{invoice_id}:
 *   get:
 *     tags: [Invoices]
 *     summary: Xem chi tiết 1 invoice
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
 *         description: Chi tiết invoice
 *       403:
 *         description: Không phải owner và không phải admin
 *       404:
 *         description: Không tìm thấy invoice
 */

router.get('/', async (req, res) => {
  const { status, from, to } = req.query;
  const where = { user_id: req.user.user_id };

  if (status) where.status = status;
  if (from || to) {
    where.issued_at = {};
    if (from) where.issued_at[Op.gte] = new Date(from);
    if (to)   where.issued_at[Op.lte] = new Date(to);
  }

  const rows = await Invoice.findAll({
    where,
    order: [['issued_at', 'DESC']],
    include: [{ model: Loan, as: 'loan' }],
  });

  res.json({ count: rows.length, rows });
});

/**
 * @openapi
 * /invoices/{invoice_id}:
 *   get:
 *     tags: [Invoices]
 *     summary: Xem chi tiết 1 invoice
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
 *         description: Chi tiết invoice
 *       403:
 *         description: Không phải owner và không phải admin
 *       404:
 *         description: Không tìm thấy invoice
 */

router.get('/:invoice_id', async (req, res) => {
  const inv = await Invoice.findByPk(req.params.invoice_id, {
    include: [{ model: Loan, as: 'loan' }],
  });
  if (!inv) return res.status(404).json({ error: 'Not found' });

  // Bảo vệ: chỉ chủ sở hữu hoặc admin mới xem được
  if (inv.user_id !== req.user.user_id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.json(inv);
});

module.exports = router;
