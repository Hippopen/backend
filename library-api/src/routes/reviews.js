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
