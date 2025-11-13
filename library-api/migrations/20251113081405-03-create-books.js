'use strict';
module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('books', {
      book_id:    { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      title:      { type: Sequelize.STRING(512), allowNull: false },   // VARCHAR, không còn TEXT
      author:     { type: Sequelize.STRING(512), allowNull: false },   // VARCHAR
      cover_url:  { type: Sequelize.STRING(1024), allowNull: false },
      created_at: { type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });

    // BTREE index bình thường (không cần prefix length vì VARCHAR)
    await qi.addIndex('books', ['title'],  { name: 'idx_books_title'  });
    await qi.addIndex('books', ['author'], { name: 'idx_books_author' });
  },
  async down(qi) {
    await qi.dropTable('books');
  }
};
