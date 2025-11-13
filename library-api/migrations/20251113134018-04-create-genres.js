'use strict';

module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('genres', {
      genre_id:  { type: Sequelize.BIGINT, primaryKey: true },         
      name:      { type: Sequelize.STRING(191), allowNull: false, unique: true },
      created_at:{ type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at:{ type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });
  },

  async down(qi) {
    await qi.dropTable('genres');
  }
};
