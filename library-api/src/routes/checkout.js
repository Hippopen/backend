const express = require('express');
const { sequelize } = require('../db');
const { Op, Transaction } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

const CartItem  = require('../models/CartItem');
const Inventory = require('../models/Inventory');
const Loan      = require('../models/Loan');
const LoanItem  = require('../models/LoanItem');
const Invoice = require('../models/Invoice');

/**
 * @openapi
 * /checkout:
 *   post:
 *     tags: [Checkout]
 *     summary: Checkout giỏ sách → tạo loan (status=pending)
 *     description: >
 *       Lấy tất cả item trong giỏ của user, kiểm tra tồn kho, trừ available
 *       và tạo 1 loan pending. Cart được xoá sau khi tạo loan.
 *       Chặn nếu user đang có invoice overdue chưa thanh toán.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Đặt chỗ thành công, trả về loan_id + code
 *       400:
 *         description: Giỏ hàng rỗng
 *       409:
 *         description: Thiếu tồn kho hoặc có overdue invoice chưa thanh toán
 *       500:
 *         description: Lỗi server / transaction
 */

router.post('/', async (req, res) => {
  const user_id = req.user.user_id;

  const cart = await CartItem.findAll({ where: { user_id } });
  if (cart.length === 0) return res.status(400).json({ error: 'Cart is empty' });

  const t = await sequelize.transaction();
  try {
    const unpaid = await Invoice.count({
      where: { user_id: req.user.user_id, status: 'unpaid', type: 'overdue' }
    });
    if (unpaid > 0) {
      return res.status(409).json({ error: 'You have an unpaid overdue fee. Please pay for it before continue borrowing!' });
    }
    
    const bookIds = cart.map(c => c.book_id);
    const invs = await Inventory.findAll({
      where: { book_id: { [Op.in]: bookIds } },
      transaction: t,
      lock: Transaction.LOCK.UPDATE
    });

    for (const c of cart) {
      const inv = invs.find(i => i.book_id === c.book_id);
      if (!inv || c.quantity > inv.available) {
        await t.rollback();
        return res.status(409).json({ error: `Insufficient stock for book_id=${c.book_id}` });
      }
    }

    const code = 'LN-' + uuidv4().replace(/-/g, '').slice(0, 12);
    const loan = await Loan.create({ user_id, code, status: 'pending' }, { transaction: t });

    for (const c of cart) {
      await LoanItem.create(
        { loan_id: loan.loan_id, book_id: c.book_id, quantity: c.quantity },
        { transaction: t }
      );
      const inv = invs.find(i => i.book_id === c.book_id);
      inv.available -= c.quantity;
      await inv.save({ transaction: t });
    }

    await CartItem.destroy({ where: { user_id }, transaction: t });

    await t.commit();

    res.status(201).json({
      message: 'Reserved',
      loan: { loan_id: loan.loan_id, code: loan.code, status: loan.status }
    });
  } catch (e) {
    await t.rollback();
    console.error(e);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

module.exports = router;
