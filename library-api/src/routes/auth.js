const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

const { signAccess } = require('../utils/jwt');
const { hash, compare } = require('../utils/password');
const { generateToken, hashToken } = require('../utils/tokens');

const User = require('../models/User');
const UserToken = require('../models/UserToken');

/* ---------- helpers ---------- */
const normalizeEmail = (v) =>
  (typeof v === 'string' && v.trim() !== '' ? v.trim().toLowerCase() : undefined);

const normalizePhone = (v) =>
  (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);

// (demo) “gửi” link: in ra console
async function sendActivationLink(emailOrPhone, token) {
  const url = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/auth/activate?token=${token}`;
  console.log('[Activation]', emailOrPhone, url);
}
async function sendResetLink(emailOrPhone, token) {
  const url = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/auth/reset?token=${token}`;
  console.log('[Reset]', emailOrPhone, url);
}

/* ---------- routes ---------- */

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    let { email, phone, password, first_name, last_name } = req.body;

    email = normalizeEmail(email);
    phone = normalizePhone(phone);

    if (!password || (!email && !phone)) {
      return res.status(400).json({ error: 'Missing email/phone or password' });
    }

    // Chỉ kiểm tra những field thật sự được cung cấp
    const orConds = [];
    if (email) orConds.push({ email });
    if (phone) orConds.push({ phone });

    if (orConds.length) {
      const existed = await User.findOne({ where: { [Op.or]: orConds } });
      if (existed) return res.status(409).json({ error: 'Email/phone already registered' });
    }

    const user = await User.create({
      email: email ?? null,
      phone: phone ?? null,
      password_hash: await hash(password),
      first_name,
      last_name,
      is_activated: false,
      role: 'user'
    });

    // Tạo token kích hoạt
    const raw = generateToken();
    const token_hash = hashToken(raw);
    const expires = new Date(Date.now() + 48 * 3600 * 1000);
    await UserToken.create({
      token_hash,
      user_id: user.user_id,
      type: 'activation',
      channel: email ? 'email' : 'sms',
      expires_at: expires
    });

    await sendActivationLink(email || phone, raw);
    res.status(201).json({ message: 'Registered. Check activation link (console)', user_id: user.user_id });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Email/phone already registered' });
    }
    console.error(e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /auth/activate?token=...
router.get('/activate', async (req, res) => {
  try {
    const raw = req.query.token;
    if (!raw) return res.status(400).json({ error: 'Missing token' });

    const token_hash = hashToken(raw);
    const ut = await UserToken.findOne({
      where: {
        token_hash,
        type: 'activation',
        consumed_at: null,
        expires_at: { [Op.gt]: new Date() }
      }
    });
    if (!ut) return res.status(400).json({ error: 'Invalid/expired token' });

    await Promise.all([
      User.update({ is_activated: true }, { where: { user_id: ut.user_id } }),
      ut.update({ consumed_at: new Date() })
    ]);
    res.json({ message: 'Account activated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    let { email, phone, password } = req.body;

    email = normalizeEmail(email);
    phone = normalizePhone(phone);

    if (!password || (!email && !phone)) {
      return res.status(400).json({ error: 'Missing email/phone or password' });
    }

    const where = email ? { email } : { phone };
    const user = await User.findOne({ where });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    if (!user.is_activated) return res.status(403).json({ error: 'Account not activated' });

    const token = signAccess({ sub: user.user_id, role: user.role });
    res.json({
      access_token: token,
      token_type: 'bearer',
      user: { user_id: user.user_id, role: user.role }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /auth/request-reset
router.post('/request-reset', async (req, res) => {
  try {
    let { email, phone } = req.body;

    email = normalizeEmail(email);
    phone = normalizePhone(phone);

    if (!email && !phone) return res.status(400).json({ error: 'Missing email/phone' });

    const where = email ? { email } : { phone };
    const user = await User.findOne({ where });
    // Không tiết lộ user tồn tại hay không
    if (!user) return res.json({ message: 'If account exists, we sent a reset link' });

    const raw = generateToken();
    const token_hash = hashToken(raw);
    const expires = new Date(Date.now() + 30 * 60 * 1000);
    await UserToken.create({
      token_hash,
      user_id: user.user_id,
      type: 'reset',
      channel: email ? 'email' : 'sms',
      expires_at: expires
    });

    await sendResetLink(email || phone, raw);
    res.json({ message: 'If account exists, we sent a reset link (console)' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /auth/reset
router.post('/reset', async (req, res) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) return res.status(400).json({ error: 'Missing token or new_password' });

    const token_hash = hashToken(token);
    const ut = await UserToken.findOne({
      where: {
        token_hash,
        type: 'reset',
        consumed_at: null,
        expires_at: { [Op.gt]: new Date() }
      }
    });
    if (!ut) return res.status(400).json({ error: 'Invalid/expired token' });

    await Promise.all([
      User.update({ password_hash: await hash(new_password) }, { where: { user_id: ut.user_id } }),
      ut.update({ consumed_at: new Date() })
    ]);
    res.json({ message: 'Password updated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
