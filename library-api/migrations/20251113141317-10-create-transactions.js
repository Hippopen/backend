'use strict';

module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('transactions', {
      txn_id:  { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },

      user_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'users', key: 'user_id' },
        onDelete: 'CASCADE'
      },

      loan_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'loans', key: 'loan_id' },
        onDelete: 'CASCADE'
      },

      loan_item_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'loan_items', key: 'loan_item_id' },
        onDelete: 'SET NULL'
      },

      type: {
        type: Sequelize.ENUM('overdue_fee','damage_fee','lost_fee','payment'),
        allowNull: false
      },

      status: {
        type: Sequelize.ENUM('pending','succeeded','failed'),
        allowNull: false,
        defaultValue: 'pending'
      },

      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'VND' },
      amount_vnd: { type: Sequelize.DECIMAL(12,0), allowNull: false },

      provider: { 
        type: Sequelize.ENUM('cash','momo','zalopay','vnpay','bank_transfer'),
        allowNull: false, defaultValue: 'cash'
      },
      tx_ref:   { type: Sequelize.STRING(191), allowNull: true }, // mã giao dịch/phiếu thu
      tx_meta:  { type: Sequelize.JSON, allowNull: true },        // raw response từ gateway (nếu có)
      paid_at:  { type: 'DATETIME', allowNull: true },            // thời điểm xác nhận thanh toán

      created_at: { type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });

    await qi.addIndex('transactions', ['user_id','created_at'], { name: 'idx_tx_user_created' });
    await qi.addIndex('transactions', ['loan_id'], { name: 'idx_tx_loan' });
    await qi.addIndex('transactions', ['provider','status'], { name: 'idx_tx_provider_status' });
    await qi.addIndex('transactions', ['tx_ref'], { name: 'idx_tx_ref' });
  },

  async down(qi) {
    await qi.dropTable('transactions');
  }
};
