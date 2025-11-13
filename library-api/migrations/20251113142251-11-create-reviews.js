'use strict';

module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('reviews', {
      review_id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },

      user_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'users', key: 'user_id' },
        onDelete: 'CASCADE'
      },

      book_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'books', key: 'book_id' },
        onDelete: 'CASCADE'
      },

      rating:  { type: Sequelize.INTEGER, allowNull: false },
      comment: { type: Sequelize.TEXT, allowNull: true },
      status:  { type: Sequelize.ENUM('visible','hidden','pending'), allowNull: false, defaultValue: 'visible' },

      created_at: { type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });

    await qi.addConstraint('reviews', {
      fields: ['user_id','book_id'],
      type: 'unique',
      name: 'uq_reviews_user_book'
    });

    await qi.addIndex('reviews', ['book_id'], { name: 'idx_reviews_book' });
  },

  async down(qi) {
    await qi.dropTable('reviews');
  }
};
