const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const Invoice = sequelize.define('Invoice', {
  invoice_id:   { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  user_id:      { type: DataTypes.BIGINT, allowNull: false },
  loan_id:      { type: DataTypes.BIGINT, allowNull: false },
  type:         { type: DataTypes.ENUM('overdue'), allowNull: false, defaultValue: 'overdue' },
  status:       { type: DataTypes.ENUM('unpaid','paid','void'), allowNull: false, defaultValue: 'unpaid' },
  days_overdue: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  amount_vnd:   { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  issued_at:    { type: DataTypes.DATE },
  paid_at:      { type: DataTypes.DATE },
  note:         { type: DataTypes.TEXT }
}, {
  tableName: 'invoices',
  underscored: true,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Invoice;
