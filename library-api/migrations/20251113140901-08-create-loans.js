'use strict';

module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('loans', {
      loan_id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },

      user_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'users', key: 'user_id' },
        onDelete: 'CASCADE'
      },

      code:   { type: Sequelize.STRING(64), allowNull: false, unique: true }, 
      status: { 
        type: Sequelize.ENUM('pending','borrowed','returned','canceled','overdue','lost'),
        allowNull: false,
        defaultValue: 'pending'
      },

      borrow_at:  { type: 'DATETIME', allowNull: true },
      due_date:   { type: Sequelize.DATEONLY, allowNull: true }, 
      return_at:  { type: 'DATETIME', allowNull: true },
      renew_count:{ type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },

      created_at: { type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });

    await qi.addIndex('loans', ['user_id','status'], { name: 'idx_loans_user_status' });
  },

  async down(qi) {
    await qi.dropTable('loans');
  }
};
