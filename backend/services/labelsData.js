// services/labelsData.js
const { getPool } = require('../db');

/**
 * Returns rows needed for labels:
 * { vehicle_id, make, model, model_year, edition_name, qr_object_key, public_uuid }
 */
async function fetchVehiclesForLabels({ ids, shop_id, status, limit = 500 }) {
  const pool = getPool();
  let sql = `
    SELECT
      v.vehicle_id,
      mk.name AS make,
      mo.name AS model,
      my.year AS model_year,
      ed.name AS edition_name,
      v.qr_object_key,
      v.public_uuid
    FROM vehicle v
    JOIN edition ed    ON ed.edition_id = v.edition_id
    JOIN model_year my ON my.model_year_id = ed.model_year_id
    JOIN model mo      ON mo.model_id = my.model_id
    JOIN make  mk      ON mk.make_id  = mo.make_id
    WHERE 1=1`;
  const params = [];

  if (Array.isArray(ids) && ids.length) {
    sql += ` AND v.vehicle_id IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  } else {
    if (shop_id) { sql += ` AND v.shop_id = ?`; params.push(Number(shop_id)); }
    if (status)  { sql += ` AND v.status = ?`;  params.push(String(status)); }
  }

  sql += ` ORDER BY mk.name, mo.name, my.year, ed.name`;
  if (!ids?.length) sql += ` LIMIT ${Number(limit)}`;

  const [rows] = await pool.query(sql, params);
  return rows;
}

module.exports = { fetchVehiclesForLabels };
