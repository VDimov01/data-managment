// services/offerNumber.js
async function allocateOfferNumber(conn, yearArg) {
  const year = yearArg || new Date().getUTCFullYear();

  // ensure row exists
  await conn.query(
    'INSERT IGNORE INTO offer_sequence (offer_year, last_seq) VALUES (?, 0)',
    [year]
  );

  // lock + increment
  const [[row]] = await conn.query(
    'SELECT last_seq FROM offer_sequence WHERE offer_year = ? FOR UPDATE',
    [year]
  );
  const nextSeq = Number(row.last_seq || 0) + 1;

  await conn.query(
    'UPDATE offer_sequence SET last_seq = ? WHERE offer_year = ?',
    [nextSeq, year]
  );

  const offer_number = `OF-${year}-${String(nextSeq).padStart(5, '0')}`;
  return { year, seq: nextSeq, offer_number };
}

module.exports = {
    allocateOfferNumber
}
