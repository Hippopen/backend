const Loan      = require('./Loan');
const LoanItem  = require('./LoanItem');
const Book      = require('./Book');
const Inventory = require('./Inventory');
const CartItem  = require('./CartItem');
const Genre     = require('./Genre');
const BookGenre = require('./BookGenre');
const Review    = require('./Review');
const User      = require('./User');
const Invoice = require('./Invoice');
const Transaction = require('./Transaction');

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

  // Book <-> Genre (n-n)
  if (!Book.associations.genres) {
    Book.belongsToMany(Genre, { through: BookGenre, as: 'genres', foreignKey: 'book_id', otherKey: 'genre_id' });
    Genre.belongsToMany(Book, { through: BookGenre, as: 'books', foreignKey: 'genre_id', otherKey: 'book_id' });
  }

  // Review
  if (!Book.associations.reviews) {
    Book.hasMany(Review, { as: 'reviews', foreignKey: 'book_id' });
    Review.belongsTo(Book, { as: 'book', foreignKey: 'book_id' });
  }
  if (!User.associations.reviews) {
    User.hasMany(Review, { as: 'reviews', foreignKey: 'user_id' });
    Review.belongsTo(User, { as: 'user', foreignKey: 'user_id' });
  }

  // Invoice
  if (!Loan.associations.invoice) {
    Loan.hasOne(Invoice, { as: 'invoice', foreignKey: 'loan_id' });
    Invoice.belongsTo(Loan, { as: 'loan', foreignKey: 'loan_id' });
  }
  if (!User.associations.invoices) {
    User.hasMany(Invoice, { as: 'invoices', foreignKey: 'user_id' });
    Invoice.belongsTo(User, { as: 'user', foreignKey: 'user_id' });
  }

  //Transaction
  if (!User.associations.transactions) {
    User.hasMany(Transaction, { as: 'transactions', foreignKey: 'user_id' });
    Transaction.belongsTo(User, { as: 'user', foreignKey: 'user_id' });
  }

  if (!Loan.associations.transactions) {
    Loan.hasMany(Transaction, { as: 'transactions', foreignKey: 'loan_id' });
    Transaction.belongsTo(Loan, { as: 'loan', foreignKey: 'loan_id' });
  }

  if (Invoice && !Invoice.associations.transactions) {
    Invoice.hasMany(Transaction, { as: 'transactions', foreignKey: 'invoice_id' });
    Transaction.belongsTo(Invoice, { as: 'invoice', foreignKey: 'invoice_id' });
  }

  if (LoanItem && !LoanItem.associations.transactions) {
    LoanItem.hasMany(Transaction, { as: 'transactions', foreignKey: 'loan_item_id' });
    Transaction.belongsTo(LoanItem, { as: 'loan_item', foreignKey: 'loan_item_id' });
  }
}

module.exports = initRelations;
