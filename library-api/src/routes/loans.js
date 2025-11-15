const express = require('express');
const QRCode = require('qrcode');
const { signPickupToken } = require('../utils/pickupToken');
const Loan = require('../models/Loan');

const router = express.Router();

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

module.exports = router;
