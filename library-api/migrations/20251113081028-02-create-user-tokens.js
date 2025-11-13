'use strict';

module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('user_tokens', {
      token_hash: { type: Sequelize.STRING(191), primaryKey: true }, // lưu hash của token
      user_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'users', key: 'user_id' },
        onDelete: 'CASCADE'
      },
      type: { type: Sequelize.ENUM('activation','reset','login'), allowNull: false },
      channel: { type: Sequelize.STRING(16), allowNull: true }, // email|sms
      expires_at: { type: 'DATETIME', allowNull: false },
      consumed_at:{ type: 'DATETIME', allowNull: true },
      created_at: { type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });

    await qi.addIndex('user_tokens', ['user_id','type','expires_at'], { name: 'idx_user_tokens_user_type_exp' });
  },

  async down(qi) {
    await qi.dropTable('user_tokens');
  }
};
