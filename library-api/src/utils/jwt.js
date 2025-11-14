const jwt = require('jsonwebtoken');

const signAccess = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.ACCESS_TOKEN_TTL || '15m' });

const verify = (token) =>
  jwt.verify(token, process.env.JWT_SECRET);

module.exports = { signAccess, verify };
