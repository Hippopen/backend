const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const CartItem = sequelize.define('CartItem', {
  user_id: { type: DataTypes.BIGINT, primaryKey: true },
  book_id: { type: DataTypes.BIGINT, primaryKey: true },
  quantity:{ type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }
}, { tableName: 'cart_items' });

module.exports = CartItem;
