'use strict';
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

module.exports = {
  async up(qi) {
    const csvPath = path.join(__dirname, '..', 'seed-data', 'books.csv');
    const rows = parse(fs.readFileSync(csvPath), { columns: true, skip_empty_lines: true });
    const now = new Date();
    const data = rows.map(r => ({
      book_id: Number(r.book_id),
      title: r.title,
      author: r.author,
      cover_url: r.cover_url,
      created_at: now,
      updated_at: now
    }));
    const BATCH = 2000;
    for (let i = 0; i < data.length; i += BATCH) {
      await qi.bulkInsert('books', data.slice(i, i + BATCH));
    }
  },
  async down(qi) { await qi.bulkDelete('books', null, {}); }
};
