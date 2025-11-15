const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const LoanItem = sequelize.define('LoanItem', {
  loan_item_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  loan_id:  { type: DataTypes.BIGINT, allowNull: false },
  book_id:  { type: DataTypes.BIGINT, allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false }
}, { tableName: 'loan_items' });

module.exports = LoanItem;
