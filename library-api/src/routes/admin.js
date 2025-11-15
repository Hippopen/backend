const express = require('express');
const { verifyPickupToken } = require('../utils/pickupToken');
const Loan = require('../models/Loan');
const LoanItem = require('../models/LoanItem');

const router = express.Router();

Loan.hasMany(LoanItem, { foreignKey: 'loan_id', as: 'items' });
LoanItem.belongsTo(Loan, { foreignKey: 'loan_id' });

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

module.exports = router;
