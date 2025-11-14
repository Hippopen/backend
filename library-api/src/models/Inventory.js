const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const Inventory = sequelize.define('Inventory', {
  book_id: { type: DataTypes.BIGINT, primaryKey: true },
  total: DataTypes.INTEGER,
  available: DataTypes.INTEGER
}, { tableName: 'inventory' });

module.exports = Inventory;
