const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { sequelize } = require('./db'); 
const authRouter = require('./routes/auth');
const booksRouter = require('./routes/books');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/auth', rateLimit({ windowMs: 60_000, max: 30 }));

app.get('/healthz', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.use('/auth', authRouter);
app.use('/books', booksRouter);

module.exports = app;
