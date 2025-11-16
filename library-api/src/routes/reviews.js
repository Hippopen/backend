const express = require('express');
const { Op, literal } = require('sequelize');
const router = express.Router();

const Review = require('../models/Review');
const Loan = require('../models/Loan');
const LoanItem = require('../models/LoanItem');

const ALLOWED_STATUSES = ['borrowed', 'returned'];

function clampRating(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.max(1, Math.min(5, Math.floor(x)));
}

/**
 * @openapi
 * /reviews/book/{book_id}:
 *   get:
 *     tags: [Reviews]
 *     summary: Lấy danh sách review của 1 sách (chỉ review visible)
 *     parameters:
 *       - in: path
 *         name: book_id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Danh sách review
 */

router.get('/book/:book_id', async (req, res) => {
  const book_id = Number(req.params.book_id);
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const offset = Number(req.query.offset || 0);

  const { rows, count } = await Review.findAndCountAll({
    where: { book_id, status: 'visible' },
    order: [['review_id','DESC']],
    limit, offset
  });

  const [avgRow] = await Review.sequelize.query(
    `SELECT AVG(rating) AS avg_rating, COUNT(*) AS review_count
     FROM reviews WHERE status='visible' AND book_id = ?`,
    { replacements: [book_id], type: Review.sequelize.QueryTypes.SELECT }
  );

  res.json({
    total: count,
    avg_rating: avgRow?.avg_rating ? Number(avgRow.avg_rating).toFixed(2) : null,
    review_count: Number(avgRow?.review_count || 0),
    items: rows
  });
});

/**
 * @openapi
 * /reviews:
 *   post:
 *     tags: [Reviews]
 *     summary: User tạo review cho 1 sách
 *     description: >
 *       Mỗi user chỉ có 1 review / book. Nếu tồn tại có thể update tuỳ implement.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [book_id, rating]
 *             properties:
 *               book_id:
 *                 type: integer
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               comment:
 *                 type: string
 *     responses:
 *       201:
 *         description: Tạo review thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 */

router.post('/', async (req, res) => {
  const user_id = req.user.user_id;
  const { book_id, rating, comment } = req.body || {};
  if (!book_id) return res.status(400).json({ error: 'book_id required' });

  const r = clampRating(rating);
  if (!r) return res.status(400).json({ error: 'rating must be 1..5' });

  const had = await Loan.findOne({
    where: { user_id, status: { [Op.in]: ALLOWED_STATUSES } },
    include: [{ model: LoanItem, as: 'items', where: { book_id }, required: true }],
  });
  if (!had) return res.status(403).json({ error: 'You must borrow this book before reviewing' });

  try {
    const review = await Review.create({ user_id, book_id, rating: r, comment, status: 'visible' });
    res.status(201).json(review);
  } catch (e) {
    // unique (user_id, book_id)
    if (e.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Already reviewed' });
    }
    console.error(e);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * @openapi
 * /reviews/{review_id}:
 *   put:
 *     tags: [Reviews]
 *     summary: User chỉnh sửa review của mình
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: review_id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rating:
 *                 type: integer
 *               comment:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       404:
 *         description: Review không tồn tại hoặc không thuộc về user
 */

router.put('/:id', async (req, res) => {
  const user_id = req.user.user_id;
  const id = Number(req.params.id);
  const review = await Review.findByPk(id);
  if (!review) return res.status(404).json({ error: 'Not found' });
  if (review.user_id !== user_id) return res.status(403).json({ error: 'Forbidden' });

  const updates = {};
  if (req.body.rating != null) {
    const r = clampRating(req.body.rating);
    if (!r) return res.status(400).json({ error: 'rating must be 1..5' });
    updates.rating = r;
  }
  if (typeof req.body.comment === 'string') updates.comment = req.body.comment;

  await review.update(updates);
  res.json({ message: 'Updated' });
});

/**
 * @openapi
 * /reviews/{review_id}:
 *   delete:
 *     tags: [Reviews]
 *     summary: User xoá review của mình
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: review_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Xoá thành công
 *       404:
 *         description: Review không tồn tại hoặc không thuộc về user
 */

router.delete('/:id', async (req, res) => {
  const user_id = req.user.user_id;
  const id = Number(req.params.id);
  const review = await Review.findByPk(id);
  if (!review) return res.status(404).json({ error: 'Not found' });
  if (review.user_id !== user_id) return res.status(403).json({ error: 'Forbidden' });

  await review.destroy();
  res.json({ message: 'Deleted' });
});

module.exports = router;
