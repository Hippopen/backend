'use strict';

module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('inventory', {
      book_id: { 
        type: Sequelize.BIGINT, 
        primaryKey: true,
        references: { model: 'books', key: 'book_id' },
        onDelete: 'CASCADE'
      },
      total:     { type: Sequelize.INTEGER, allowNull: false },      
      available: { type: Sequelize.INTEGER, allowNull: false },     
      created_at:{ type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at:{ type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });
  },

  async down(qi) {
    await qi.dropTable('inventory');
  }
};
