require('dotenv').config();

module.exports = {
  development: {
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    dialect: 'mysql',
    timezone: '+07:00',
    define: { underscored: true, timestamps: true },
    logging: false,
    dialectOptions: { charset: 'utf8mb4' }
  }
};
