const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

const { signAccess } = require('../utils/jwt');
const { hash, compare } = require('../utils/password');
const { generateToken, hashToken } = require('../utils/tokens');
const { sendMail } = require('../utils/mailer');
const authGuard = require('../middleware/auth');

const User = require('../models/User');
const UserToken = require('../models/UserToken');

const normalizeEmail = (v) =>
  (typeof v === 'string' && v.trim() !== '' ? v.trim().toLowerCase() : undefined);

const normalizePhone = (v) =>
  (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);

const escapeHtml = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

async function sendActivationLink(user, token) {
  const url = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/auth/activate?token=${token}`;
  if (user?.email) {
    const sent = await sendMail({
      to: user.email,
      subject: 'KÃ­ch hoáº¡t tÃ i khoáº£n thÆ° viá»‡n',
      text:
        `Xin chÃ o ${user.first_name || ''} ${user.last_name || ''}\n\n` +
        `Nháº¥n vÃ o liÃªn káº¿t sau Ä‘á»ƒ kÃ­ch hoáº¡t tÃ i khoáº£n cá»§a báº¡n: ${url}\n\n` +
        `Náº¿u báº¡n khÃ´ng yÃªu cáº§u, hÃ£y bá» qua email nÃ y.`
    });
    if (sent) return;
  }
  console.log('[Activation]', user?.email || 'unknown', url);
}
async function sendResetLink(user, token) {
  const url = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/auth/reset?token=${token}`;
  if (user?.email) {
    const sent = await sendMail({
      to: user.email,
      subject: 'Äáº·t láº¡i máº­t kháº©u thÆ° viá»‡n',
      text:
        `Xin chÃ o ${user.first_name || ''} ${user.last_name || ''}\n\n` +
        `Nháº¥n vÃ o liÃªn káº¿t sau Ä‘á»ƒ Ä‘áº·t láº¡i máº­t kháº©u: ${url}\n\n` +
        `Náº¿u báº¡n khÃ´ng yÃªu cáº§u, hÃ£y bá» qua email nÃ y.`
    });
    if (sent) return;
  }
  console.log('[Reset]', user?.email || 'unknown', url);
}

/* ---------- routes ---------- */

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: ÄÄƒng kÃ½ tÃ i khoáº£n má»›i
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email bat buoc
 *               password:
 *                 type: string
 *                 format: password
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *     responses:
 *       201:
 *         description: ÄÄƒng kÃ½ thÃ nh cÃ´ng, tráº£ vá» user_id
 *       400:
 *         description: Thiáº¿u email hoáº·c password
 *       409:
 *         description: email Ä‘Ã£ tá»“n táº¡i
 *       500:
 *         description: Lá»—i server
 */
router.post('/register', async (req, res) => {
  try {
    let { email, password, first_name, last_name } = req.body;

    email = normalizeEmail(email);

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }

    const existed = await User.findOne({ where: { email } });
    if (existed) return res.status(409).json({ error: 'Email already registered' });

    const user = await User.create({
      email,
      phone: null,
      password_hash: await hash(password),
      first_name,
      last_name,
      is_activated: false,
      role: 'user'
    });

    // Táº¡o token kÃ­ch hoáº¡t
    const raw = generateToken();
    const token_hash = hashToken(raw);
    const expires = new Date(Date.now() + 48 * 3600 * 1000);
    await UserToken.create({
      token_hash,
      user_id: user.user_id,
      type: 'activation',
      channel: 'email',
      expires_at: expires
    });

    await sendActivationLink(user, raw);
    res.status(201).json({ message: 'Registered. Check activation link', user_id: user.user_id });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Email already registered' });
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
 *     summary: KÃ­ch hoáº¡t tÃ i khoáº£n báº±ng token
 *     parameters:
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *         required: true
 *         description: Token kÃ­ch hoáº¡t Ä‘Ã£ gá»­i qua console/email/sms
 *     responses:
 *       200:
 *         description: KÃ­ch hoáº¡t thÃ nh cÃ´ng
 *       400:
 *         description: Token khÃ´ng há»£p lá»‡ hoáº·c háº¿t háº¡n
 *       500:
 *         description: Lá»—i server
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
 *     summary: ÄÄƒng nháº­p, tráº£ vá» JWT access_token
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
 *               password:
 *                 type: string
 *                 format: password
 *             description: >
 *               Nhap email va password.
 *     responses:
 *       200:
 *         description: ÄÄƒng nháº­p thÃ nh cÃ´ng
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
 *         description: Thiáº¿u thÃ´ng tin Ä‘Äƒng nháº­p
 *       401:
 *         description: Sai tÃ i khoáº£n hoáº·c máº­t kháº©u
 *       403:
 *         description: TÃ i khoáº£n chÆ°a kÃ­ch hoáº¡t
 *       500:
 *         description: Lá»—i server
 */

router.post('/login', async (req, res) => {
  try {
    let { email, password } = req.body;

    email = normalizeEmail(email);

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }

    const user = await User.findOne({ where: { email } });
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
 * /auth/profile:
 *   put:
 *     tags: [Auth]
 *     summary: Cáº­p nháº­t há» tÃªn user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               phone:
 *                 type: string
 *                 description: So dien thoai (tuy chon)
 *     responses:
 *       200:
 *         description: Cáº­p nháº­t thÃ nh cÃ´ng
 *       400:
 *         description: Thiáº¿u thÃ´ng tin cáº§n cáº­p nháº­t
 *       401:
 *         description: ChÆ°a Ä‘Äƒng nháº­p
 *       404:
 *         description: User khÃ´ng tá»“n táº¡i
 *       500:
 *         description: Lá»—i server
 */
router.put('/profile', authGuard, async (req, res) => {
  try {
    const { first_name, last_name, phone } = req.body || {};
    const updates = {};
    if (typeof first_name === 'string') updates.first_name = first_name.trim() || null;
    if (typeof last_name === 'string') updates.last_name = last_name.trim() || null;
    if (phone !== undefined) {
      const normalizedPhone = normalizePhone(phone);
      updates.phone = normalizedPhone || null;
    }
    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'phone') && updates.phone) {
      const duplicate = await User.findOne({
        where: { phone: updates.phone, user_id: { [Op.ne]: req.user.user_id } }
      });
      if (duplicate) return res.status(409).json({ error: 'Phone already in use' });
    }

    const [affected] = await User.update(updates, { where: { user_id: req.user.user_id } });
    if (!affected) return res.status(404).json({ error: 'User not found' });

    const fresh = await User.findByPk(req.user.user_id, {
      attributes: ['user_id', 'email', 'phone', 'first_name', 'last_name']
    });
    res.json({ message: 'Profile updated', user: fresh });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * @openapi
 * /auth/password:
 *   put:
 *     tags: [Auth]
 *     summary: Äá»•i máº­t kháº©u báº±ng current password
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [current_password, new_password]
 *             properties:
 *               current_password:
 *                 type: string
 *                 format: password
 *               new_password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Äá»•i máº­t kháº©u thÃ nh cÃ´ng
 *       400:
 *         description: Thiáº¿u thÃ´ng tin hoáº·c current password khÃ´ng Ä‘Ãºng
 *       401:
 *         description: ChÆ°a Ä‘Äƒng nháº­p
 *       404:
 *         description: User khÃ´ng tá»“n táº¡i
 *       500:
 *         description: Lá»—i server
 */
router.put('/password', authGuard, async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Missing current or new password' });
    }
    if (current_password === new_password) {
      return res.status(400).json({ error: 'New password must be different' });
    }

    const user = await User.findByPk(req.user.user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const matches = await compare(current_password, user.password_hash);
    if (!matches) return res.status(400).json({ error: 'Invalid current password' });

    user.password_hash = await hash(new_password);
    await user.save();
    res.json({ message: 'Password updated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * @openapi
 * /auth/reset:
 *   get:
 *     tags: [Auth]
 *     summary: Render trang HTML nháº­p máº­t kháº©u má»›i
 *     parameters:
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Trang HTML form reset password
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *       400:
 *         description: Thiáº¿u token
 */
router.get('/reset', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  res.type('html');
  if (!token) {
    return res.status(400).send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Invalid reset link</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 2rem; background: #f5f5f5; }
      .card { background: #fff; padding: 1.5rem; border-radius: 8px; max-width: 480px; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
      h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Missing token</h1>
      <p>Please open the password reset link again from your email/SMS.</p>
    </div>
  </body>
</html>`);
  }

  const safeToken = escapeHtml(token);
  res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Reset password</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 2rem; background: #f5f5f5; }
      .card { background: #fff; padding: 1.5rem; border-radius: 8px; max-width: 480px; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
      label { display: block; margin-bottom: 0.5rem; font-weight: 600; }
      input[type="password"] { width: 100%; padding: 0.6rem; margin-bottom: 1rem; border: 1px solid #ccc; border-radius: 6px; font-size: 1rem; }
      button { background: #0066ff; color: #fff; border: none; padding: 0.7rem 1.25rem; border-radius: 6px; cursor: pointer; font-size: 1rem; }
      button:hover { background: #0052cc; }
      p { color: #444; }
      footer { margin-top: 1rem; font-size: 0.9rem; color: #666; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Set a new password</h1>
      <p>Enter a new password below and submit the form. Your reset token is already included.</p>
      <form method="post" action="/auth/reset">
        <input type="hidden" name="token" value="${safeToken}" />
        <label for="new_password">New password</label>
        <input type="password" id="new_password" name="new_password" minlength="6" required />
        <button type="submit">Update password</button>
      </form>
      <footer>If you didn't request this, you can safely ignore the email.</footer>
    </div>
  </body>
</html>`);
});

/**
 * @openapi
 * /auth/request-reset:
 *   post:
 *     tags: [Auth]
 *     summary: YÃªu cáº§u reset máº­t kháº©u
 *     description: >
 *       Náº¿u account tá»“n táº¡i, server sáº½ táº¡o reset token (in ra console) vÃ  tráº£ vá» message chung,
 *       khÃ´ng tiáº¿t lá»™ user cÃ³ tá»“n táº¡i hay khÃ´ng.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: LuÃ´n tráº£ message "If account exists..."
 *       400:
 *         description: Thiáº¿u email
 *       500:
 *         description: Lá»—i server
 */

router.post('/request-reset', async (req, res) => {
  try {
    let { email } = req.body;

    email = normalizeEmail(email);

    if (!email) return res.status(400).json({ error: 'Missing email' });

    const user = await User.findOne({ where: { email } });
    // KhÃ´ng tiáº¿t lá»™ user tá»“n táº¡i hay khÃ´ng
    if (!user) return res.json({ message: 'If account exists, we sent a reset link' });

    const raw = generateToken();
    const token_hash = hashToken(raw);
    const expires = new Date(Date.now() + 30 * 60 * 1000);
    await UserToken.create({
      token_hash,
      user_id: user.user_id,
      type: 'reset',
      channel: 'email',
      expires_at: expires
    });

    await sendResetLink(user, raw);
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
 *     summary: Äáº·t láº¡i máº­t kháº©u báº±ng reset token
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
 *                 description: Máº­t kháº©u má»›i (Æ°u tiÃªn sá»­ dá»¥ng trÆ°á»ng nÃ y)
 *               new_password:
 *                 type: string
 *                 format: password
 *                 description: Alias cÅ© cho password, giá»¯ láº¡i Ä‘á»ƒ tÆ°Æ¡ng thÃ­ch
 *     responses:
 *       200:
 *         description: Reset máº­t kháº©u thÃ nh cÃ´ng
 *       400:
 *         description: Token khÃ´ng há»£p lá»‡/háº¿t háº¡n
 *       500:
 *         description: Lá»—i server
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















