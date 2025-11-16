// src/models/relations.js
const User        = require('./User');
const Book        = require('./Book');
const Genre       = require('./Genre');
const BookGenre   = require('./BookGenre');
const Inventory   = require('./Inventory');
const CartItem    = require('./CartItem');
const Loan        = require('./Loan');
const LoanItem    = require('./LoanItem');
const Review      = require('./Review');
const Invoice     = require('./Invoice');
const Transaction = require('./Transaction');

function has(model, alias) {
  return model.associations && model.associations[alias];
}

function initRelations() {
  // Book <-> Inventory (1-1)
  if (!has(Book, 'inventory')) {
    Book.hasOne(Inventory, { as: 'inventory', foreignKey: 'book_id' });
    Inventory.belongsTo(Book, { as: 'book', foreignKey: 'book_id' });
  }

  // Book <-> Genre (N-N)
  if (!has(Book, 'genres')) {
    Book.belongsToMany(Genre, { through: BookGenre, as: 'genres', foreignKey: 'book_id', otherKey: 'genre_id' });
    Genre.belongsToMany(Book, { through: BookGenre, as: 'books', foreignKey: 'genre_id', otherKey: 'book_id' });
  }

  // Reviews
  if (!has(Book, 'reviews')) {
    Book.hasMany(Review, { as: 'reviews', foreignKey: 'book_id' });
    Review.belongsTo(Book, { as: 'book', foreignKey: 'book_id' });
  }
  if (!has(User, 'reviews')) {
    User.hasMany(Review, { as: 'reviews', foreignKey: 'user_id' });
    Review.belongsTo(User, { as: 'user', foreignKey: 'user_id' });
  }

  // Cart
  if (!has(User, 'cartItems')) {
    User.hasMany(CartItem, { as: 'cartItems', foreignKey: 'user_id' });
    CartItem.belongsTo(User, { as: 'user', foreignKey: 'user_id' });
  }
  if (!has(CartItem, 'book')) {
    CartItem.belongsTo(Book, { as: 'book', foreignKey: 'book_id' });
    Book.hasMany(CartItem, { as: 'cart_items', foreignKey: 'book_id' });
  }

  // Loan & LoanItem
  if (!has(User, 'loans')) {
    User.hasMany(Loan, { as: 'loans', foreignKey: 'user_id' });
    Loan.belongsTo(User, { as: 'user', foreignKey: 'user_id' });
  }
  if (!has(Loan, 'items')) {
    Loan.hasMany(LoanItem, { as: 'items', foreignKey: 'loan_id' });
    LoanItem.belongsTo(Loan, { as: 'loan', foreignKey: 'loan_id' });
  }
  // LoanItem -> Book (để include book trong items)
  if (!has(LoanItem, 'book')) {
    LoanItem.belongsTo(Book, { as: 'book', foreignKey: 'book_id' });
    Book.hasMany(LoanItem, { as: 'loan_items', foreignKey: 'book_id' });
  }

  // Invoices
  if (!has(Loan, 'invoice')) {
    Loan.hasOne(Invoice, { as: 'invoice', foreignKey: 'loan_id' });
    Invoice.belongsTo(Loan, { as: 'loan', foreignKey: 'loan_id' });
  }
  if (!has(User, 'invoices')) {
    User.hasMany(Invoice, { as: 'invoices', foreignKey: 'user_id' });
    Invoice.belongsTo(User, { as: 'user', foreignKey: 'user_id' });
  }

  // Transactions
  if (!has(User, 'transactions')) {
    User.hasMany(Transaction, { as: 'transactions', foreignKey: 'user_id' });
    Transaction.belongsTo(User, { as: 'user', foreignKey: 'user_id' });
  }
  if (!has(Loan, 'transactions')) {
    Loan.hasMany(Transaction, { as: 'transactions', foreignKey: 'loan_id' });
    Transaction.belongsTo(Loan, { as: 'loan', foreignKey: 'loan_id' });
  }
  if (!has(Invoice, 'transactions')) {
    Invoice.hasMany(Transaction, { as: 'transactions', foreignKey: 'invoice_id' });
    Transaction.belongsTo(Invoice, { as: 'invoice', foreignKey: 'invoice_id' });
  }
  if (!has(LoanItem, 'transactions')) {
    LoanItem.hasMany(Transaction, { as: 'transactions', foreignKey: 'loan_item_id' });
    Transaction.belongsTo(LoanItem, { as: 'loan_item', foreignKey: 'loan_item_id' });
  }
}

module.exports = initRelations;
