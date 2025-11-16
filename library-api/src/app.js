require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./openapi.json');
const swaggerSpec = require('./swagger');

const rateLimit = require('express-rate-limit');
const { sequelize } = require('./db');

const initRelations = require('./models/relations');
initRelations();

const authRouter = require('./routes/auth');
const booksRouter = require('./routes/books');
const cartRouter = require('./routes/cart');
const checkoutRouter = require('./routes/checkout');
const loansRouter = require('./routes/loans');
const reviewsRouter = require('./routes/reviews');

const invoicesRouter = require('./routes/invoices');       
const transactionsRouter = require('./routes/transactions'); 

const authGuard = require('./middleware/auth');
const adminRouter = require('./routes/admin');
const admin = require('./middleware/admin');

const { startOverdueJob } = require('./jobs/overdue'); 

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  res.redirect('/docs');
});
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/admin', authGuard, adminRouter);
app.use('/auth', authRouter);
app.use('/books', booksRouter);
app.use('/cart', authGuard, cartRouter);
app.use('/checkout', authGuard, checkoutRouter);
app.use('/loans', authGuard, loansRouter);
app.use('/reviews', authGuard, reviewsRouter);

// NEW mounts
app.use('/invoices', authGuard, invoicesRouter);
app.use('/transactions', authGuard, transactionsRouter);

// Jobs
if (process.env.ENABLE_JOBS === '1') startOverdueJob();

module.exports = app;
