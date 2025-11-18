// routes/adminBooks.js
const express = require('express');
const { sequelize } = require('../db');

const Book       = require('../models/Book');
const Inventory  = require('../models/Inventory');
const Genre      = require('../models/Genre');
const BookGenre  = require('../models/BookGenre');
const LoanItem   = require('../models/LoanItem');

const router = express.Router();

// Middleware nhỏ bảo vệ admin (authGuard đã chạy trước ở app.js)
router.use((req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
});

/**
 * @openapi
 * /admin/books:
 *   post:
 *     tags: [Admin]
 *     summary: Tạo sách mới
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, author, total]
 *             properties:
 *               title:
 *                 type: string
 *               author:
 *                 type: string
 *               cover_url:
 *                 type: string
 *               total:
 *                 type: integer
 *               genre_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       201:
 *         description: Tạo sách thành công
 */
router.post('/', async (req, res) => {
  try {
    let { title, author, cover_url, total, genre_ids } = req.body;

    total = Number(total);
    if (!title || !author || !Number.isInteger(total) || total < 0) {
      return res.status(400).json({ error: 'Invalid title/author/total' });
    }

    if (!Array.isArray(genre_ids)) {
      // cho phép gửi 1 số, tự convert thành mảng
      if (genre_ids === undefined || genre_ids === null || genre_ids === '') {
        genre_ids = [];
      } else {
        genre_ids = [Number(genre_ids)];
      }
    }

    const t = await sequelize.transaction();

    try {
      // 1. Tạo book
      const book = await Book.create(
        { title, author, cover_url },
        { transaction: t }
      );

      // 2. Tạo inventory
      await Inventory.create(
        { book_id: book.book_id, total, available: total },
        { transaction: t }
      );

      // 3. Gán genre (nếu có)
      if (genre_ids.length > 0) {
        const genres = await Genre.findAll({
          where: { genre_id: genre_ids },
          transaction: t,
        });
        const validIds = genres.map((g) => g.genre_id);

        if (validIds.length > 0) {
          await BookGenre.bulkCreate(
            validIds.map((gid) => ({
              book_id: book.book_id,
              genre_id: gid,
            })),
            { transaction: t }
          );
        }
      }

      await t.commit();

      const full = await Book.findByPk(book.book_id, {
        include: [
          { model: Inventory, as: 'inventory' },
          { model: Genre, as: 'genres', through: { attributes: [] } },
        ],
      });

      return res.status(201).json(full);
    } catch (e) {
      await t.rollback();
      console.error('Create book error:', e);
      return res
        .status(500)
        .json({ error: e.message || 'Failed to create book' });
    }
  } catch (e) {
    console.error('Create book outer error:', e);
    return res
      .status(500)
      .json({ error: e.message || 'Failed to create book' });
  }
});

/**
 * @openapi
 * /admin/books/{book_id}:
 *   put:
 *     tags: [Admin]
 *     summary: Cập nhật thông tin sách
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: book_id
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
 *               title:     { type: string }
 *               author:    { type: string }
 *               cover_url: { type: string }
 *               total:     { type: integer, minimum: 0 }
 *               genre_ids:
 *                 type: array
 *                 items: { type: integer }
 *     responses:
 *       200:
 *         description: Sách sau khi cập nhật
 */
router.put('/:book_id', async (req, res) => {
  const { book_id } = req.params;
  let { title, author, cover_url, total, genre_ids } = req.body;

  const t = await sequelize.transaction();
  try {
    const book = await Book.findByPk(book_id, { transaction: t });
    if (!book) {
      await t.rollback();
      return res.status(404).json({ error: 'Book not found' });
    }

    if (title !== undefined) book.title = title;
    if (author !== undefined) book.author = author;
    if (cover_url !== undefined) book.cover_url = cover_url;
    await book.save({ transaction: t });

    if (total !== undefined) {
      total = Number(total);
      if (!Number.isInteger(total) || total < 0) {
        await t.rollback();
        return res.status(400).json({ error: 'Invalid total' });
      }

      let inv = await Inventory.findByPk(book_id, { transaction: t });
      if (!inv) {
        inv = await Inventory.create(
          { book_id, total, available: total },
          { transaction: t }
        );
      } else {
        const borrowed = inv.total - inv.available;
        if (total < borrowed) {
          await t.rollback();
          return res.status(400).json({
            error: 'Total smaller than number of books currently borrowed',
          });
        }
        inv.total = total;
        inv.available = total - borrowed;
        await inv.save({ transaction: t });
      }
    }

    if (genre_ids !== undefined) {
      if (!Array.isArray(genre_ids)) genre_ids = [Number(genre_ids)];
      await BookGenre.destroy({ where: { book_id }, transaction: t });

      if (genre_ids.length > 0) {
        const genres = await Genre.findAll({
          where: { genre_id: genre_ids },
          transaction: t,
        });
        const validIds = genres.map((g) => g.genre_id);
        if (validIds.length > 0) {
          await BookGenre.bulkCreate(
            validIds.map((gid) => ({ book_id, genre_id: gid })),
            { transaction: t }
          );
        }
      }
    }

    await t.commit();

    const full = await Book.findByPk(book_id, {
      include: [
        { model: Inventory, as: 'inventory' },
        { model: Genre, as: 'genres', through: { attributes: [] } },
      ],
    });

    res.json(full);
  } catch (e) {
    await t.rollback();
    console.error('Update book error:', e);
    res.status(500).json({ error: e.message || 'Failed to update book' });
  }
});

/**
 * @openapi
 * /admin/books/{book_id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Xoá sách (chỉ khi chưa từng được mượn)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: book_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200: { description: Đã xoá }
 *       409: { description: Đã có lịch sử mượn, không cho xoá }
 */
router.delete('/:book_id', async (req, res) => {
  const { book_id } = req.params;

  const t = await sequelize.transaction();
  try {
    const book = await Book.findByPk(book_id, { transaction: t });
    if (!book) {
      await t.rollback();
      return res.status(404).json({ error: 'Book not found' });
    }

    const loanCount = await LoanItem.count({
      where: { book_id },
      transaction: t,
    });

    if (loanCount > 0) {
      await t.rollback();
      return res
        .status(409)
        .json({ error: 'Book has loan history, cannot delete' });
    }

    await BookGenre.destroy({ where: { book_id }, transaction: t });
    await Inventory.destroy({ where: { book_id }, transaction: t });
    await book.destroy({ transaction: t });

    await t.commit();
    res.json({ message: 'Deleted' });
  } catch (e) {
    await t.rollback();
    console.error('Delete book error:', e);
    res.status(500).json({ error: e.message || 'Failed to delete book' });
  }
});

module.exports = router;
