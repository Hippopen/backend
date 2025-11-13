'use strict';

module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('loan_items', {
      loan_item_id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },

      loan_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'loans', key: 'loan_id' },
        onDelete: 'CASCADE'
      },

      book_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'books', key: 'book_id' },
        onDelete: 'RESTRICT'
      },

      quantity:   { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      created_at: { type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });

    await qi.addConstraint('loan_items', {
      fields: ['loan_id', 'book_id'],
      type: 'unique',
      name: 'uq_loan_items_loan_book'
    });

    await qi.addIndex('loan_items', ['book_id'], { name: 'idx_loan_items_book' });
  },

  async down(qi) {
    await qi.dropTable('loan_items');
  }
};
