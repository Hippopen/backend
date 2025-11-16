const express = require('express');
const { Op } = require('sequelize');
const Transaction = require('../models/Transaction');
const Invoice = require('../models/Invoice');

const router = express.Router();

router.get('/', async (req, res) => {
  const { from, to, type } = req.query;
  const where = { user_id: req.user.user_id };

  if (type) where.type = type;
  if (from || to) {
    where.created_at = {};
    if (from) where.created_at[Op.gte] = new Date(`${from}T00:00:00`);
    if (to)   where.created_at[Op.lte] = new Date(`${to}T23:59:59`);
  }

  const rows = await Transaction.findAll({
    where,
    include: [{ model: Invoice, as: 'invoice', attributes: ['invoice_id', 'loan_id', 'type', 'status', 'amount_vnd'] }],
    order: [['txn_id', 'DESC']]
  });

  res.json(rows);
});

module.exports = router;
