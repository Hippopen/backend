const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const Review = sequelize.define('Review', {
  review_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  user_id:   { type: DataTypes.BIGINT, allowNull: false },
  book_id:   { type: DataTypes.BIGINT, allowNull: false },
  rating:    { type: DataTypes.INTEGER, allowNull: false },
  comment:   { type: DataTypes.TEXT },
  status:    { type: DataTypes.ENUM('visible','hidden','pending'), allowNull: false, defaultValue: 'visible' }
}, { tableName: 'reviews' });

module.exports = Review;
