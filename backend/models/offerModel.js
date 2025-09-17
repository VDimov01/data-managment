// backend/models/offerModel.js
const pool = require("../db");

async function createOffer(data) {
  const { uuid, client_firstname, client_lastname, client_email, carIds, admin_id, pdf_path } = data;

  const query = `
    INSERT INTO offers (uuid, client_firstname, client_lastname, client_email, car_ids, admin_id, pdf_path)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    uuid,
    client_firstname,
    client_lastname,
    client_email,
    JSON.stringify(carIds),
    admin_id,
    pdf_path,
  ];

  const [result] = await pool.query(query, values);
  return result.insertId;
}

module.exports = { createOffer };
