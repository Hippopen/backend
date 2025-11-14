const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const UserToken = sequelize.define('UserToken', {
  token_hash: { type: DataTypes.STRING(191), primaryKey: true },
  user_id: { type: DataTypes.BIGINT, allowNull: false },
  type: { type: DataTypes.ENUM('activation','reset','login'), allowNull: false },
  channel: DataTypes.STRING(16),
  expires_at: DataTypes.DATE,
  consumed_at: DataTypes.DATE
}, { tableName: 'user_tokens' });

module.exports = UserToken;
