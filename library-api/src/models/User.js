const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const User = sequelize.define('User', {
  user_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  first_name: DataTypes.STRING(191),
  last_name: DataTypes.STRING(191),
  email: { type: DataTypes.STRING(191), unique: true },
  phone: { type: DataTypes.STRING(32), unique: true },
  password_hash: { type: DataTypes.STRING(191), allowNull: false },
  role: { type: DataTypes.ENUM('admin','user'), defaultValue: 'user' },
  is_activated: { type: DataTypes.BOOLEAN, defaultValue: false }
}, {
  tableName: 'users',
});

module.exports = User;
