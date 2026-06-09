const { markDirty } = require('../data/database');
const save = markDirty;
module.exports = { markDirty, save };