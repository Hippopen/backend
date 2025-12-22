# Library API - Database Setup

This repository contains the Node.js/Sequelize source code used to create and populate the library database for the Information Systems Analysis and Design course project.

## 1) Tech stack & requirements
- Node.js 18+ and npm
- MySQL 8+ (compatible with 5.7)
- Sequelize + sequelize-cli
- Charset: utf8mb4, timezone +07:00

## 2) Relevant structure
- `config/config.js` - Sequelize config reading environment variables.
- `.env` - sample runtime config; update DB credentials before running.
- `migrations/` - ordered migration files creating all tables (users, user_tokens, books, genres, book_genre, inventory, cart_items, loans, loan_items, transactions, reviews, invoices, add invoice_id to transactions).
- `seeders/` - scripts to load sample data from CSV.
- `seed-data/` - CSV sources (genres, books, book_genre, inventory).
- `library.sql` - optional full SQL dump if you prefer direct import.

## 3) Setup
1. Install dependencies:
```bash
npm install
```
2. Copy and edit `.env` with your database info:
```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=library
DB_USER=library_admin
DB_PASS=your_password
```

## 4) Create and seed the database
Run from the `library-api/` folder:
```bash
npx sequelize-cli db:migrate
npx sequelize-cli db:seed:all
```
These commands create the schema and load sample data from the CSV files. Logging is disabled in config; adjust as needed.

## 5) Alternative: import the dump
To restore everything quickly:
```bash
mysql -u <user> -p <db_name> < library.sql
```

## 6) Quick validation
- Verify key tables: users, user_tokens, books, genres, book_genre, inventory, cart_items, loans, loan_items, transactions, invoices, reviews.
- Check seed counts, e.g. `SELECT COUNT(*) FROM genres;` and `books;`.

## 7) Packaging for submission
- Place all project files (source, migrations, seeders, seed-data, config, `.env` sample, `library.sql`, `package.json`, `src/`, etc.) into one folder.
- Compress to zip/rar with the exact name: `GroupX_StudentID1_StudentID2_StudentID3_StudentID4.zip`.
- Remove real secrets from `.env` before submitting; keep placeholders only.

## 8) Notes
- All commands assume the working directory is `library-api/`.
- If using MySQL 5.7, review ENUM/timestamp behavior for compatibility.
