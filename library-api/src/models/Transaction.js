const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const Transaction = sequelize.define('Transaction', {
  txn_id:       { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  user_id:      { type: DataTypes.BIGINT, allowNull: false },
  loan_id:      { type: DataTypes.BIGINT, allowNull: false },
  invoice_id:   { type: DataTypes.BIGINT, allowNull: true },
  loan_item_id: { type: DataTypes.BIGINT, allowNull: true },

  type:   { type: DataTypes.ENUM('overdue_fee','damage_fee','lost_fee','payment'), allowNull: false },
  status: { type: DataTypes.ENUM('pending','succeeded','failed'), allowNull: false, defaultValue: 'pending' },

  currency:   { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'VND' },
  amount_vnd: { type: DataTypes.DECIMAL(12, 0), allowNull: false },

  provider: { type: DataTypes.ENUM('cash','momo','zalopay','vnpay','bank_transfer'), allowNull: false, defaultValue: 'cash' },
  tx_ref:   { type: DataTypes.STRING(191) },
  tx_meta:  { type: DataTypes.JSON },
  paid_at:  { type: DataTypes.DATE },

  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'transactions',
  underscored: true,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Transaction;
