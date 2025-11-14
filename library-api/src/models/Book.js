const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const Book = sequelize.define('Book', {
  book_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  title: DataTypes.STRING(512),
  author: DataTypes.STRING(512),
  cover_url: DataTypes.STRING(1024)
}, { tableName: 'books' });

module.exports = Book;
