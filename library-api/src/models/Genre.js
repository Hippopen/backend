const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const Genre = sequelize.define('Genre', {
  genre_id: { type: DataTypes.BIGINT, primaryKey: true },
  name: { type: DataTypes.STRING(191), unique: true }
}, { tableName: 'genres' });

module.exports = Genre;