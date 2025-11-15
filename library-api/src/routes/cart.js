const express = require('express');
const router = express.Router();

const CartItem = require('../models/CartItem');
const Book = require('../models/Book');
const Inventory = require('../models/Inventory');

CartItem.belongsTo(Book,    { foreignKey: 'book_id' });
Book.hasOne(Inventory,      { foreignKey: 'book_id' });
Inventory.belongsTo(Book,   { foreignKey: 'book_id' });

router.get('/', async (req, res) => {
  const user_id = req.user.user_id;
  const items = await CartItem.findAll({
    where: { user_id },
    include: [{ model: Book, include: [Inventory] }]
  });

  res.json(items.map(ci => ({
    book_id: ci.book_id,
    quantity: ci.quantity,
    book: {
      title: ci.Book?.title,
      author: ci.Book?.author,
      cover_url: ci.Book?.cover_url,
      total: ci.Book?.Inventory?.total ?? null,
      available: ci.Book?.Inventory?.available ?? null
    }
  })));
});

router.post('/', async (req, res) => {
  const user_id = req.user.user_id;
  const { book_id, quantity = 1 } = req.body;
  if (!book_id || quantity <= 0) return res.status(400).json({ error: 'book_id and quantity > 0 required' });

  const inv = await Inventory.findOne({ where: { book_id } });
  if (!inv) return res.status(404).json({ error: 'Book not found' });

  const existed = await CartItem.findOne({ where: { user_id, book_id } });
  const newQty = (existed?.quantity || 0) + Number(quantity);

  if (newQty > inv.available) return res.status(409).json({ error: `Only ${inv.available} in stock` });

  if (existed) {
    existed.quantity = newQty;
    await existed.save();
  } else {
    await CartItem.create({ user_id, book_id, quantity: Number(quantity) });
  }
  res.status(201).json({ message: 'Cart updated' });
});

router.put('/', async (req, res) => {
  const user_id = req.user.user_id;
  const { book_id, quantity } = req.body;
  if (!book_id || quantity == null) return res.status(400).json({ error: 'book_id and quantity required' });

  const item = await CartItem.findOne({ where: { user_id, book_id } });
  if (!item) return res.status(404).json({ error: 'Item not in cart' });

  if (Number(quantity) === 0) {
    await item.destroy();
    return res.json({ message: 'Removed from cart' });
  }

  const inv = await Inventory.findOne({ where: { book_id } });
  if (!inv || Number(quantity) > inv.available) {
    return res.status(409).json({ error: `Only ${inv?.available ?? 0} in stock` });
  }

  item.quantity = Number(quantity);
  await item.save();
  res.json({ message: 'Cart updated' });
});

router.delete('/:book_id', async (req, res) => {
  const user_id = req.user.user_id;
  const book_id = Number(req.params.book_id);
  await CartItem.destroy({ where: { user_id, book_id } });
  res.json({ message: 'Removed from cart' });
});

module.exports = router;
