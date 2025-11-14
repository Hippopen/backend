const bcrypt = require('bcryptjs');

const hash = (plain) => bcrypt.hash(plain, 10);
const compare = (plain, h) => bcrypt.compare(plain, h);

module.exports = { hash, compare };
