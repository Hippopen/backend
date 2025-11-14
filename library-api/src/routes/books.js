const express = require('express');
const router = express.Router();
const { Op, fn, col, literal } = require('sequelize');

const Book = require('../models/Book');
const Inventory = require('../models/Inventory');
const Genre = require('../models/Genre');
const BookGenre = require('../models/BookGenre');

Book.hasOne(Inventory, { foreignKey: 'book_id' });
Inventory.belongsTo(Book, { foreignKey: 'book_id' });
Book.belongsToMany(Genre, { through: BookGenre, foreignKey: 'book_id', otherKey: 'genre_id' });
Genre.belongsToMany(Book, { through: BookGenre, foreignKey: 'genre_id', otherKey: 'book_id' });

router.get('/', async (req, res) => {
  try {
    const { search, genre_id, page = 1, limit = 20, in_stock } = req.query;
    const where = {};
    if (search) {
      const s = `%${search}%`;
      where[Op.or] = [{ title: { [Op.like]: s } }, { author: { [Op.like]: s } }];
    }

    const include = [
      { model: Inventory, required: !!in_stock, attributes: ['total','available'] },
    ];
    if (genre_id) {
      include.push({
        model: Genre,
        where: { genre_id: Number(genre_id) },
        through: { attributes: [] },
        attributes: ['genre_id','name']
      });
    } else {
      include.push({
        model: Genre,
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
      distinct: true
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
