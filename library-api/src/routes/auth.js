const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

const { signAccess } = require('../utils/jwt');
const { hash, compare } = require('../utils/password');
const { generateToken, hashToken } = require('../utils/tokens');

const User = require('../models/User');
const UserToken = require('../models/UserToken');

const normalizeEmail = (v) =>
  (typeof v === 'string' && v.trim() !== '' ? v.trim().toLowerCase() : undefined);

const normalizePhone = (v) =>
  (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);

async function sendActivationLink(emailOrPhone, token) {
  const url = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/auth/activate?token=${token}`;
  console.log('[Activation]', emailOrPhone, url);
}
async function sendResetLink(emailOrPhone, token) {
  const url = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/auth/reset?token=${token}`;
  console.log('[Reset]', emailOrPhone, url);
}

/* ---------- routes ---------- */

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Đăng ký tài khoản mới
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email (bắt buộc nếu không dùng phone)
 *               phone:
 *                 type: string
 *                 description: Số điện thoại (bắt buộc nếu không dùng email)
 *               password:
 *                 type: string
 *                 format: password
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Đăng ký thành công, trả về user_id
 *       400:
 *         description: Thiếu email/phone hoặc password
 *       409:
 *         description: Email/phone đã tồn tại
 *       500:
 *         description: Lỗi server
 */
router.post('/register', async (req, res) => {
  try {
    let { email, phone, password, first_name, last_name } = req.body;

    email = normalizeEmail(email);
    phone = normalizePhone(phone);

    if (!password || (!email && !phone)) {
      return res.status(400).json({ error: 'Missing email/phone or password' });
    }

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

/**
 * @openapi
 * /auth/activate:
 *   get:
 *     tags: [Auth]
 *     summary: Kích hoạt tài khoản bằng token
 *     parameters:
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *         required: true
 *         description: Token kích hoạt đã gửi qua console/email/sms
 *     responses:
 *       200:
 *         description: Kích hoạt thành công
 *       400:
 *         description: Token không hợp lệ hoặc hết hạn
 *       500:
 *         description: Lỗi server
 */

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

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Đăng nhập, trả về JWT access_token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *               password:
 *                 type: string
 *                 format: password
 *             description: >
 *               Truyền email + password HOẶC phone + password.
 *     responses:
 *       200:
 *         description: Đăng nhập thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access_token:
 *                   type: string
 *                 token_type:
 *                   type: string
 *                   example: bearer
 *                 user:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: integer
 *                     role:
 *                       type: string
 *       400:
 *         description: Thiếu thông tin đăng nhập
 *       401:
 *         description: Sai tài khoản hoặc mật khẩu
 *       403:
 *         description: Tài khoản chưa kích hoạt
 *       500:
 *         description: Lỗi server
 */

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

/**
 * @openapi
 * /auth/request-reset:
 *   post:
 *     tags: [Auth]
 *     summary: Yêu cầu reset mật khẩu
 *     description: >
 *       Nếu account tồn tại, server sẽ tạo reset token (in ra console) và trả về message chung,
 *       không tiết lộ user có tồn tại hay không.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Luôn trả message "If account exists..."
 *       400:
 *         description: Thiếu email/phone
 *       500:
 *         description: Lỗi server
 */

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

/**
 * @openapi
 * /auth/reset:
 *   post:
 *     tags: [Auth]
 *     summary: Đặt lại mật khẩu bằng reset token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Mật khẩu mới (ưu tiên sử dụng trường này)
 *               new_password:
 *                 type: string
 *                 format: password
 *                 description: Alias cũ cho password, giữ lại để tương thích
 *     responses:
 *       200:
 *         description: Reset mật khẩu thành công
 *       400:
 *         description: Token không hợp lệ/hết hạn
 *       500:
 *         description: Lỗi server
 */

router.post('/reset', async (req, res) => {
  try {
    const { token, password, new_password } = req.body;
    const nextPassword = typeof new_password === 'string' && new_password.length ? new_password : password;
    if (!token || !nextPassword) return res.status(400).json({ error: 'Missing token or password' });

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
      User.update({ password_hash: await hash(nextPassword) }, { where: { user_id: ut.user_id } }),
      ut.update({ consumed_at: new Date() })
    ]);
    res.json({ message: 'Password updated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
