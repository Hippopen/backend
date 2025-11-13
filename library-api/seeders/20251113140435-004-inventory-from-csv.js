'use strict';
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

module.exports = {
  async up(qi) {
    const csvPath = path.join(__dirname, '..', 'seed-data', 'inventory.csv');
    const rows = parse(fs.readFileSync(csvPath), { columns: true, skip_empty_lines: true });
    const data = rows.map(r => ({
      book_id: Number(r.book_id),
      total: Number(r.total),
      available: Number(r.available),
      created_at: r.updated_at ? new Date(r.updated_at) : new Date(),
      updated_at: r.updated_at ? new Date(r.updated_at) : new Date()
    }));
    const BATCH = 2000;
    for (let i = 0; i < data.length; i += BATCH) {
      await qi.bulkInsert('inventory', data.slice(i, i + BATCH));
    }
  },
  async down(qi) { await qi.bulkDelete('inventory', null, {}); }
};
