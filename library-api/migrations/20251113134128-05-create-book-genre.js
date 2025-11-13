'use strict';

module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('book_genre', {
      book_id:  { type: Sequelize.BIGINT, allowNull: false,
                  references: { model: 'books', key: 'book_id' }, onDelete: 'CASCADE' },
      genre_id: { type: Sequelize.BIGINT, allowNull: false,
                  references: { model: 'genres', key: 'genre_id' }, onDelete: 'CASCADE' },
      created_at:{ type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at:{ type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });
    await qi.addConstraint('book_genre', {
      fields: ['book_id', 'genre_id'],
      type: 'primary key',
      name: 'pk_book_genre'
    });
    await qi.addIndex('book_genre', ['genre_id'], { name: 'idx_book_genre_genre' });
  },

  async down(qi) {
    await qi.dropTable('book_genre');
  }
};
