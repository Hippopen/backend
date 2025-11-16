const express = require('express');
const router = express.Router();
const Invoice = require('../models/Invoice');
const Loan = require('../models/Loan');
const LoanItem = require('../models/LoanItem');

router.get('/', async (req, res) => {
  const status = req.query.status;
  const where = { user_id: req.user.user_id };
  if (status) where.status = status;

  const items = await Invoice.findAll({
    where, order: [['invoice_id','DESC']],
    include: [{ model: Loan, as: 'loan', include: [{ model: LoanItem, as: 'items' }] }]
  });
  res.json(items);
});

router.get('/:id', async (req, res) => {
  const inv = await Invoice.findByPk(Number(req.params.id), {
    include: [{ model: Loan, as: 'loan', include: [{ model: LoanItem, as: 'items' }] }]
  });
  if (!inv || inv.user_id !== req.user.user_id) return res.status(404).json({ error: 'Not found' });
  res.json(inv);
});

router.get('/by-loan/:loan_id', async (req, res) => {
  const loan_id = Number(req.params.loan_id);
  const inv = await Invoice.findOne({ where: { user_id: req.user.user_id, loan_id, type:'overdue' } });
  if (!inv) return res.status(404).json({ error: 'Not found' });
  res.json(inv);
});

module.exports = router;
