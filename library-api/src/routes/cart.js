const express = require('express');
const router = express.Router();

const CartItem  = require('../models/CartItem');
const Book      = require('../models/Book');
const Inventory = require('../models/Inventory');

/**
 * @openapi
 * /cart:
 *   get:
 *     tags: [Cart]
 *     summary: Lấy giỏ sách của user hiện tại
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách item trong giỏ
 *       401:
 *         description: Chưa đăng nhập / token lỗi
 */

router.get('/', async (req, res) => {
  const user_id = req.user.user_id;
  const items = await CartItem.findAll({
    where: { user_id },
    include: [{ model: Book, as: 'book', include: [{ model: Inventory, as: 'inventory' }] }]
  });

  res.json(items.map(ci => ({
    book_id: ci.book_id,
    quantity: ci.quantity,
    book: {
      title: ci.book?.title,
      author: ci.book?.author,
      cover_url: ci.book?.cover_url,
      total: ci.book?.inventory?.total ?? null,
      available: ci.book?.inventory?.available ?? null
    }
  })));
});

/**
 * @openapi
 * /cart:
 *   post:
 *     tags: [Cart]
 *     summary: Thêm sách vào giỏ (hoặc tăng số lượng)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [book_id]
 *             properties:
 *               book_id:
 *                 type: integer
 *               quantity:
 *                 type: integer
 *                 default: 1
 *     responses:
 *       201:
 *         description: Cập nhật giỏ hàng thành công
 *       400:
 *         description: Thiếu book_id hoặc quantity <= 0
 *       404:
 *         description: Không tìm thấy sách
 *       409:
 *         description: Vượt quá số lượng còn lại trong kho
 */

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

/**
 * @openapi
 * /cart:
 *   put:
 *     tags: [Cart]
 *     summary: Cập nhật số lượng 1 item trong giỏ
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [book_id, quantity]
 *             properties:
 *               book_id:
 *                 type: integer
 *               quantity:
 *                 type: integer
 *                 description: 0 để xoá khỏi giỏ
 *     responses:
 *       200:
 *         description: Cập nhật/xoá item thành công
 *       400:
 *         description: Thiếu book_id hoặc quantity
 *       404:
 *         description: Item không tồn tại trong giỏ
 *       409:
 *         description: Vượt quá số lượng còn lại trong kho
 */

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

/**
 * @openapi
 * /cart/{book_id}:
 *   delete:
 *     tags: [Cart]
 *     summary: Xoá 1 sách khỏi giỏ
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: book_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Xoá thành công (idempotent)
 */

router.delete('/:book_id', async (req, res) => {
  const user_id = req.user.user_id;
  const book_id = Number(req.params.book_id);
  await CartItem.destroy({ where: { user_id, book_id } });
  res.json({ message: 'Removed from cart' });
});

module.exports = router;
