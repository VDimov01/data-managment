// services/path.js
const crypto = require('crypto');

function cleanSegKeepSpaces(s) {
  // Keep letters, numbers, spaces, hyphens; collapse spaces; strip slashes
  return String(s || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\/\\]+/g, '-')       // no slashes in segments
    .replace(/\s+/g, ' ')           // collapse spaces
    .trim()
    .replace(/[^\w \-]/g, '')       // remove weird punctuation; keep space & hyphen
    .replace(/_/g, '-');            // underscores → hyphen
}

function fileNameFrom(originalName, buffer) {
  const base = String(originalName || 'image').replace(/\.[^.]+$/,'');
  const ext  = (originalName?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g,'') || 'jpg';
  const safeBase = cleanSegKeepSpaces(base).replace(/ /g, '-').toLowerCase(); // file itself: use hyphens
  const hash = crypto.createHash('sha1').update(buffer).digest('hex').slice(0,8);
  return `${safeBase || 'image'}-${hash}.${ext}`;
}

/**
 * Build object key:
 * maker/<Model> <Year>/<Edition>/<vehicleUuid>/<file>
 */
function vehicleHierKey({ maker, model, model_year, edition, vehicle_uuid, originalName, buffer }) {
  const segMaker   = cleanSegKeepSpaces(maker).toLowerCase(); // folder: keep spaces between words
  const segModelYr = `${cleanSegKeepSpaces(model)} ${String(model_year).replace(/[^\d]/g,'')}`;
  const segEdition = cleanSegKeepSpaces(edition);
  const segUuid    = String(vehicle_uuid);
  const fileName   = fileNameFrom(originalName, buffer);
  return `${segMaker}/${segModelYr}/${segEdition}/${segUuid}/${fileName}`;
}

module.exports = { vehicleHierKey };
