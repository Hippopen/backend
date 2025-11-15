const { verify } = require('../utils/jwt');

module.exports = function authGuard(req, res, next) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'Missing bearer token' });

  try {
    const payload = verify(m[1]);
    req.user = { user_id: payload.sub, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid/expired token' });
  }
};
