const Loan      = require('./Loan');
const LoanItem  = require('./LoanItem');
const Book      = require('./Book');
const Inventory = require('./Inventory');
const CartItem  = require('./CartItem');

function initRelations() {
  // Loan <-> LoanItem
  if (!Loan.associations.items) {
    Loan.hasMany(LoanItem, { as: 'items', foreignKey: 'loan_id' });
    LoanItem.belongsTo(Loan, { as: 'loan', foreignKey: 'loan_id' });
  }

  // Book <-> Inventory
  if (!Book.associations.inventory) {
    Book.hasOne(Inventory, { as: 'inventory', foreignKey: 'book_id' });
    Inventory.belongsTo(Book, { as: 'book', foreignKey: 'book_id' });
  }

  // CartItem -> Book
  if (!CartItem.associations.book) {
    CartItem.belongsTo(Book, { as: 'book', foreignKey: 'book_id' });
  }
}

module.exports = initRelations;
