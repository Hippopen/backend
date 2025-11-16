'use strict';
module.exports = {
  async up(qi, Sequelize) {
    await qi.createTable('invoices', {
      invoice_id:   { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      user_id:      { type: Sequelize.BIGINT, allowNull: false,
                      references: { model: 'users', key: 'user_id' }, onDelete: 'CASCADE' },
      loan_id:      { type: Sequelize.BIGINT, allowNull: false,
                      references: { model: 'loans', key: 'loan_id' }, onDelete: 'CASCADE' },
      type:         { type: Sequelize.ENUM('overdue'), allowNull: false, defaultValue: 'overdue' },
      status:       { type: Sequelize.ENUM('unpaid','paid','void'), allowNull: false, defaultValue: 'unpaid' },
      days_overdue: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      amount_vnd:   { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      issued_at:    { type: 'DATETIME', allowNull: true },
      paid_at:      { type: 'DATETIME', allowNull: true },
      note:         { type: Sequelize.TEXT, allowNull: true },
      created_at:   { type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at:   { type: 'DATETIME', defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });
    await qi.addIndex('invoices', ['user_id']);
    await qi.addIndex('invoices', ['loan_id']);
    await qi.addConstraint('invoices', {
      fields: ['loan_id','type'], type: 'unique', name: 'uniq_invoice_loan_type'
    });
  },
  async down(qi) { await qi.dropTable('invoices'); }
};
