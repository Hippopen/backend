const jwt = require('jsonwebtoken');

const signPickupToken = (loan_id, code, ttl = '7d') =>
  jwt.sign({ loan_id, code, purpose: 'pickup' }, process.env.JWT_SECRET, { expiresIn: ttl });

const verifyPickupToken = (token) =>
  jwt.verify(token, process.env.JWT_SECRET);

module.exports = { signPickupToken, verifyPickupToken };
