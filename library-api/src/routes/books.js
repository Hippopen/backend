const express = require('express');
const router = express.Router();
const { Op, literal } = require('sequelize');

const { sequelize } = require('../db');
const Book = require('../models/Book');
const Inventory = require('../models/Inventory');
const Genre = require('../models/Genre');

/**
 * @openapi
 * /books:
 *   get:
 *     tags: [Books]
 *     summary: Tìm kiếm & phân trang danh sách sách
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm theo tiêu đề hoặc tác giả (LIKE)
 *       - in: query
 *         name: genre_id
 *         schema:
 *           type: integer
 *         description: Lọc theo thể loại
 *       - in: query
 *         name: in_stock
 *         schema:
 *           type: boolean
 *         description: Chỉ lấy sách còn hàng
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
 *         description: Danh sách sách phân trang
 *       500:
 *         description: Lỗi server
 */

router.get('/', async (req, res) => {
  try {
    const { search, genre_id, page = 1, limit = 20, in_stock } = req.query;

    const where = {};
    if (search) {
      const s = `%${search}%`;
      where[Op.or] = [{ title: { [Op.like]: s } }, { author: { [Op.like]: s } }];
    }

    const include = [
      { model: Inventory, as: 'inventory', required: !!in_stock, attributes: ['total','available'] },
    ];

    if (genre_id) {
      include.push({
        model: Genre,
        as: 'genres',
        where: { genre_id: Number(genre_id) },
        through: { attributes: [] },
        attributes: ['genre_id','name']
      });
    } else {
      include.push({
        model: Genre,
        as: 'genres',
        through: { attributes: [] },
        attributes: ['genre_id','name']
      });
    }

    const offset = (Number(page) - 1) * Number(limit);

    const { rows, count } = await Book.findAndCountAll({
      where,
      include,
      offset,
      limit: Number(limit),
      order: [['title','ASC']],
      distinct: true,
      attributes: {
        include: [
          [literal(
            `(SELECT ROUND(AVG(rating),2)
              FROM reviews r
              WHERE r.book_id = Book.book_id AND r.status='visible')`
          ), 'avg_rating'],
          [literal(
            `(SELECT COUNT(*)
              FROM reviews r
              WHERE r.book_id = Book.book_id AND r.status='visible')`
          ), 'review_count'],
        ]
      }
    });

    res.json({
      page: Number(page),
      limit: Number(limit),
      total: count,
      items: rows
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
