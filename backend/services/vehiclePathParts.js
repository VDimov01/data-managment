// services/vehiclePathParts.js
const { getPool } = require('../db');

async function getVehiclePathParts(vehicleId) {
  const sql = `
    SELECT 
      mk.name   AS maker,
      mo.name   AS model,
      my.year   AS model_year,
      ed.name   AS edition,
      v.public_uuid AS vehicle_uuid
    FROM vehicle v
    JOIN edition ed    ON ed.edition_id = v.edition_id
    JOIN model_year my ON my.model_year_id = ed.model_year_id
    JOIN model mo      ON mo.model_id = my.model_id
    JOIN make  mk      ON mk.make_id  = mo.make_id
    WHERE v.vehicle_id = ?`;
  const [[row]] = await getPool().query(sql, [vehicleId]);
  if (!row) throw new Error('Vehicle not found');
  return row;
}

module.exports = { getVehiclePathParts };
