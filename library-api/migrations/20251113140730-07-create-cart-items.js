'use strict';

module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('cart_items', {
      user_id: { 
        type: Sequelize.BIGINT, allowNull: false,
        references: { model: 'users', key: 'user_id' }, onDelete: 'CASCADE'
      },
      book_id: { 
        type: Sequelize.BIGINT, allowNull: false,
        references: { model: 'books', key: 'book_id' }, onDelete: 'CASCADE'
      },
      quantity:  { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      created_at:{ type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at:{ type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });

    await qi.addConstraint('cart_items', {
      fields: ['user_id','book_id'],
      type: 'primary key',
      name: 'pk_cart_items'
    });
  },

  async down(qi) {
    await qi.dropTable('cart_items');
  }
};
