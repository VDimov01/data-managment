// services/path.js
function slug(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-._]/g, ''); }
module.exports = { slug };
