const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const Loan = sequelize.define('Loan', {
  loan_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.BIGINT, allowNull: false },
  code:    { type: DataTypes.STRING(64), allowNull: false, unique: true },
  status:  { type: DataTypes.ENUM('pending','borrowed','returned','canceled','overdue','lost'),
             allowNull: false, defaultValue: 'pending' },
  borrow_at: DataTypes.DATE,
  due_date:  DataTypes.DATEONLY,
  return_at: DataTypes.DATE,
  renew_count: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { tableName: 'loans' });

module.exports = Loan;
