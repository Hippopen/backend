const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const BookGenre = sequelize.define('BookGenre', {
  book_id: { type: DataTypes.BIGINT, primaryKey: true },
  genre_id: { type: DataTypes.BIGINT, primaryKey: true }
}, { tableName: 'book_genre' });

module.exports = BookGenre;