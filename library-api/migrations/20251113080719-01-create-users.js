'use strict';

module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('users', {
      user_id:       { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      first_name:    { type: Sequelize.STRING(191), allowNull: true },
      last_name:     { type: Sequelize.STRING(191), allowNull: true },
      email:         { type: Sequelize.STRING(191), allowNull: true, unique: true },
      phone:         { type: Sequelize.STRING(32),  allowNull: true, unique: true },
      password_hash: { type: Sequelize.STRING(191), allowNull: false },
      role:          { type: Sequelize.ENUM('admin','user'), allowNull: false, defaultValue: 'user' },
      is_activated:  { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at:    { type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at:    { type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });

    await qi.addIndex('users', ['email']);
    await qi.addIndex('users', ['phone']);
  },

  async down(qi) {
    await qi.dropTable('users');
  }
};
