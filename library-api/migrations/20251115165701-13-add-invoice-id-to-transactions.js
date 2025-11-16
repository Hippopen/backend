'use strict';
module.exports = {
  async up(qi, Sequelize) {
    await qi.addColumn('transactions', 'invoice_id', {
      type: Sequelize.BIGINT, allowNull: true,
      references: { model: 'invoices', key: 'invoice_id' }, onDelete: 'SET NULL',
      after: 'loan_id'
    });
    await qi.addIndex('transactions', ['invoice_id'], { name: 'idx_tx_invoice' });
  },
  async down(qi) {
    await qi.removeIndex('transactions', 'idx_tx_invoice');
    await qi.removeColumn('transactions', 'invoice_id');
  }
};
