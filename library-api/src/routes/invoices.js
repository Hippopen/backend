// src/routes/invoices.js
const express = require('express');
const { Op } = require('sequelize');
const Invoice = require('../models/Invoice');
const Loan = require('../models/Loan');

const router = express.Router();

/**
 * GET /invoices
 * Liệt kê hoá đơn của chính user (có thể lọc status, thời gian)
 * Query: ?status=&from=&to=
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
 * GET /invoices/:invoice_id
 * Xem chi tiết 1 hoá đơn (user sở hữu hoặc admin)
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
