// backend/routes/handover.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

const { getPool } = require('../db');
const pool = getPool();

const {
  renderHandoverPdfBuffer,
  uploadHandoverPdfBuffer,
  getSignedReadUrl,
} = require('../services/handoverPDF');

const { decryptNationalId } = require('../services/cryptoCust.js');


// ---- txn helper
async function withTxn(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ---- load helpers (NO fantasy fields)
async function loadContract(conn, contract_id) {
  const [[c]] = await conn.query(`SELECT * FROM contract WHERE contract_id = ?`, [contract_id]);
  return c || null;
}

async function loadContractItemWithVehicle(conn, contract_item_id) {
  const [[row]] = await conn.query(
    `
    SELECT
      ci.contract_item_id, ci.contract_id, ci.vehicle_id,
      v.vin, v.mileage AS mileage_km,
      e.name AS edition_name,
      my.year,
      mo.name AS model_name,
      m.name  AS make_name
    FROM contract_item ci
    JOIN vehicle v     ON v.vehicle_id = ci.vehicle_id
    JOIN edition e     ON e.edition_id = v.edition_id
    JOIN model_year my ON my.model_year_id = e.model_year_id
    JOIN model mo      ON mo.model_id = my.model_id
    JOIN make m        ON m.make_id = mo.make_id
    WHERE ci.contract_item_id = ?
    `,
    [contract_item_id]
  );
  return row || null;
}

async function loadBuyerSnapshotFromContractOrCustomer(conn, contract_id, customer_id) {
  // Prefer contract snapshot if present
  const [[ctr]] = await conn.query(
    `SELECT buyer_snapshot_json FROM contract WHERE contract_id = ?`,
    [contract_id]
  );
  if (ctr && ctr.buyer_snapshot_json) return ctr.buyer_snapshot_json;

  // Fallback to a constructed minimal snapshot from customer table (no new fields)
  const [[cust]] = await conn.query(
    `
    SELECT customer_id, display_name, first_name, middle_name, last_name, email, phone
    FROM customer
    WHERE customer_id = ?`,
    [customer_id]
  );
  if (!cust) throw new Error('customer not found');

  return {
    captured_at_utc: new Date().toISOString(),
    customer_id: cust.customer_id,
    display_name: cust.display_name ||
      [cust.first_name, cust.middle_name, cust.last_name].filter(Boolean).join(' '),
    person: {
      first_name: cust.first_name || null,
      middle_name: cust.middle_name || null,
      last_name: cust.last_name || null,
    },
    contact: { email: cust.email || null, phone: cust.phone || null },
  };
}

// ---------- ROUTES ----------

/**
 * Create draft handover for a single contract item.
 * Body: {
 *   contract_id: number,
 *   contract_item_id: number,
 *   handover_date?: ISO | 'YYYY-MM-DD',
 *   location?: string,
 *   odometer_km?: number,
 *   notes?: string,
 *   buyer_snapshot?: object,
 *   seller_snapshot?: object
 * }
 */
router.post('/', async (req, res) => {
  try {
    const {
      contract_id,
      contract_item_id,
      handover_date = null,
      location = null,
      odometer_km = null,
      notes = null,
      buyer_snapshot = null,
      seller_snapshot = null,
    } = req.body || {};

    if (!contract_id || !contract_item_id) {
      return res.status(400).json({ error: 'contract_id and contract_item_id are required' });
    }

    const out = await withTxn(async (conn) => {
      const ctr = await loadContract(conn, contract_id);
      if (!ctr) throw new Error('contract not found');

      const item = await loadContractItemWithVehicle(conn, contract_item_id);
      if (!item) throw new Error('contract item not found');
      if (item.contract_id !== contract_id) throw new Error('item does not belong to contract');

      const customer_id = ctr.customer_id;
      const buyerSnapObj = buyer_snapshot || await loadBuyerSnapshotFromContractOrCustomer(conn, contract_id, customer_id);

      const handover_uuid = uuidv4();
      const created_by_user_id = req.user?.user_id || 1; // plug your auth later

      // store snapshots as JSON (object -> CAST)
      const [ins] = await conn.query(
        `
        INSERT INTO handover_record
          (uuid, contract_id, contract_item_id, vehicle_id, customer_id,
           buyer_snapshot_json, seller_snapshot_json, status,
           handover_date, location, odometer_km, notes,
           created_by_user_id, created_at)
        VALUES
          (?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), 'draft',
           ?, ?, ?, ?,
           ?, NOW())
        `,
        [
          handover_uuid,
          contract_id,
          item.contract_item_id,
          item.vehicle_id,
          customer_id,
          JSON.stringify(buyerSnapObj),
          seller_snapshot ? JSON.stringify(seller_snapshot) : JSON.stringify(null),
          handover_date || null,
          location || null,
          odometer_km ?? null,
          notes || null,
          created_by_user_id,
        ]
      );

      const [[row]] = await conn.query(`SELECT * FROM handover_record WHERE handover_record_id = ?`, [ins.insertId]);
      return row;
    });

    res.status(201).json(out);
  } catch (e) {
    console.error('POST /handover', e);
    res.status(400).json({ error: e.message || 'Create failed' });
  }
});

/**
 * Update a draft handover (date/location/odometer/notes only)
 * Body: { handover_date?, location?, odometer_km?, notes? }
 */
router.patch('/:handover_record_id', async (req, res) => {
  try {
    const handover_record_id = Number(req.params.handover_record_id);
    if (!handover_record_id) return res.status(400).json({ error: 'handover_record_id required' });

    const { handover_date = null, location = null, odometer_km = null, notes = null } = req.body || {};

    const out = await withTxn(async (conn) => {
      const [[hr]] = await conn.query(`SELECT * FROM handover_record WHERE handover_record_id = ?`, [handover_record_id]);
      if (!hr) throw new Error('handover not found');
      if (hr.status !== 'draft') throw new Error('only draft handovers can be edited');

      await conn.query(
        `UPDATE handover_record
           SET handover_date = ?, location = ?, odometer_km = ?, notes = ?, updated_at = NOW()
         WHERE handover_record_id = ?`,
        [handover_date || null, location || null, (odometer_km ?? null), notes || null, handover_record_id]
      );

      const [[row]] = await conn.query(`SELECT * FROM handover_record WHERE handover_record_id = ?`, [handover_record_id]);
      return row;
    });

    res.json(out);
  } catch (e) {
    console.error('PATCH /handover/:id', e);
    res.status(400).json({ error: e.message || 'Update failed' });
  }
});

/**
 * Issue (generate PDF v+1) and attach.
 * Body: { override?: boolean }  // not used now; kept for symmetry
 */
router.post('/:handover_record_id/issue', async (req, res) => {
  try {
    const handover_record_id = Number(req.params.handover_record_id);
    if (!handover_record_id) return res.status(400).json({ error: 'handover_record_id required' });

    const out = await withTxn(async (conn) => {
      const [[hr]] = await conn.query(
        `SELECT * FROM handover_record WHERE handover_record_id = ? FOR UPDATE`,
        [handover_record_id]
      );
      if (!hr) throw new Error('handover not found');

      // Load contract + item+vehicle to populate PDF and path
      const ctr = await loadContract(conn, hr.contract_id);
      if (!ctr) throw new Error('contract not found');

      const item = await loadContractItemWithVehicle(conn, hr.contract_item_id);
      if (!item) throw new Error('contract item not found');

      const buyer = hr.buyer_snapshot_json || await loadBuyerSnapshotFromContractOrCustomer(conn, hr.contract_id, hr.customer_id);
      const vehicle = {
        vehicle_id: item.vehicle_id,
        vin: item.vin,
        mileage_km: item.mileage_km,
        make_name: item.make_name,
        model_name: item.model_name,
        edition_name: item.edition_name,
        year: item.year,
      };

      // next version
      const [[ver]] = await conn.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_ver
           FROM handover_record_pdf WHERE handover_record_id = ?`,
        [handover_record_id]
      );
      const version = ver.next_ver;

      // render
      const buffer = await renderHandoverPdfBuffer({
        buyer,
        vehicle,
        handover: {
          handover_date: hr.handover_date ? new Date(hr.handover_date).toISOString().slice(0, 10) : null,
          location: hr.location,
          odometer_km: hr.odometer_km,
        },
      });

      // upload
      const { gcsKey, filename, byte_size, sha256, content_type } = await uploadHandoverPdfBuffer({
        contract_uuid: ctr.uuid,
        handover_uuid: hr.uuid,
        version,
        buffer,
      });

      const created_by_user_id = req.user?.user_id || 1;

      // persist PDF row
      const [insPdf] = await conn.query(
        `
        INSERT INTO handover_record_pdf
          (handover_record_id, version, filename, content_type, byte_size, sha256, public_url, gcs_key, created_at, created_by_user_id)
        VALUES
          (?, ?, ?, ?, ?, ?, NULL, ?, NOW(), ?)
        `,
        [handover_record_id, version, filename, content_type, byte_size, sha256, gcsKey, created_by_user_id]
      );

      // update latest + status
      await conn.query(
        `UPDATE handover_record
            SET latest_pdf_id = ?, status = 'issued', updated_at = NOW()
          WHERE handover_record_id = ?`,
        [insPdf.insertId, handover_record_id]
      );

      // insert into contract_attachment (one row per handover PDF)
      await conn.query(
        `
        INSERT IGNORE INTO contract_attachment
          (contract_id, contract_item_id, attachment_type, handover_record_pdf_id, visibility, created_at, created_by_user_id)
        VALUES
          (?, ?, 'handover_record_pdf', ?, 'internal', NOW(), ?)
        `,
        [hr.contract_id, hr.contract_item_id, insPdf.insertId, created_by_user_id]
      );

      const signed = await getSignedReadUrl(gcsKey, { minutes: 10 });
      return {
        handover_record_id,
        version,
        pdf: {
          filename,
          byte_size,
          sha256,
          content_type,
          gcs_key: gcsKey,
          ...signed,
        },
      };
    });

    res.json(out);
  } catch (e) {
    console.error('POST /handover/:id/issue', e);
    res.status(400).json({ error: e.message || 'Issue failed' });
  }
});

/**
 * Regenerate PDF (v+1) without changing status.
 */
router.post('/:handover_record_id/pdf', async (req, res) => {
  try {
    const handover_record_id = Number(req.params.handover_record_id);
    if (!handover_record_id) return res.status(400).json({ error: 'handover_record_id required' });

    const out = await withTxn(async (conn) => {
      const [[hr]] = await conn.query(`SELECT * FROM handover_record WHERE handover_record_id = ?`, [handover_record_id]);
      if (!hr) throw new Error('handover not found');

      const ctr = await loadContract(conn, hr.contract_id);
      if (!ctr) throw new Error('contract not found');

      const item = await loadContractItemWithVehicle(conn, hr.contract_item_id);
      if (!item) throw new Error('contract item not found');

      const buyer = hr.buyer_snapshot_json || await loadBuyerSnapshotFromContractOrCustomer(conn, hr.contract_id, hr.customer_id);
      const vehicle = {
        vehicle_id: item.vehicle_id,
        vin: item.vin,
        mileage_km: item.mileage_km,
        make_name: item.make_name,
        model_name: item.model_name,
        edition_name: item.edition_name,
        year: item.year,
      };

      const [[ver]] = await conn.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_ver FROM handover_record_pdf WHERE handover_record_id = ?`,
        [handover_record_id]
      );
      const version = ver.next_ver;

      const buffer = await renderHandoverPdfBuffer({
        buyer,
        vehicle,
        handover: {
          handover_date: hr.handover_date ? new Date(hr.handover_date).toISOString().slice(0, 10) : null,
          location: hr.location,
          odometer_km: hr.odometer_km,
        },
      });

      const { gcsKey, filename, byte_size, sha256, content_type } = await uploadHandoverPdfBuffer({
        contract_uuid: ctr.uuid,
        handover_uuid: hr.uuid,
        version,
        buffer,
      });

      const created_by_user_id = req.user?.user_id || 1;
      const [insPdf] = await conn.query(
        `
        INSERT INTO handover_record_pdf
          (handover_record_id, version, filename, content_type, byte_size, sha256, public_url, gcs_key, created_at, created_by_user_id)
        VALUES
          (?, ?, ?, ?, ?, ?, NULL, ?, NOW(), ?)
        `,
        [handover_record_id, version, filename, content_type, byte_size, sha256, gcsKey, created_by_user_id]
      );

      // DO NOT change status here (regenerate only). Update latest pointer though.
      await conn.query(
        `UPDATE handover_record SET latest_pdf_id = ?, updated_at = NOW() WHERE handover_record_id = ?`,
        [insPdf.insertId, handover_record_id]
      );

      // Attachment row (ignore if already present for this pdf id)
      await conn.query(
        `
        INSERT IGNORE INTO contract_attachment
          (contract_id, contract_item_id, attachment_type, handover_record_pdf_id, visibility, created_at, created_by_user_id)
        VALUES
          (?, ?, 'handover_record_pdf', ?, 'internal', NOW(), ?)
        `,
        [hr.contract_id, hr.contract_item_id, insPdf.insertId, created_by_user_id]
      );

      const signed = await getSignedReadUrl(gcsKey, { minutes: 10 });
      return {
        handover_record_id,
        version,
        pdf: { filename, byte_size, sha256, content_type, gcs_key: gcsKey, ...signed },
      };
    });

    res.json(out);
  } catch (e) {
    console.error('POST /handover/:id/pdf', e);
    res.status(400).json({ error: e.message || 'Regenerate failed' });
  }
});

/**
 * List all handover records for a contract (basic info + latest pdf meta).
 */
router.get('/by-contract/:contract_id', async (req, res) => {
  try {
    const contract_id = Number(req.params.contract_id);
    if (!contract_id) return res.status(400).json({ error: 'contract_id required' });

    const [rows] = await pool.query(
      `
      SELECT
        hr.handover_record_id, hr.uuid, hr.contract_id, hr.contract_item_id, hr.vehicle_id, hr.customer_id,
        hr.status, hr.handover_date, hr.location, hr.odometer_km, hr.created_at, hr.updated_at,
        v.vin, v.mileage AS mileage_km,
        e.name AS edition_name, my.year, mo.name AS model_name, m.name AS make_name,
        pdf.handover_record_pdf_id AS latest_pdf_id, pdf.version AS latest_pdf_version, pdf.gcs_key AS latest_pdf_gcs_key,
        pdf.filename AS latest_pdf_filename, pdf.byte_size AS latest_pdf_byte_size, pdf.sha256 AS latest_pdf_sha256
      FROM handover_record hr
      JOIN vehicle v     ON v.vehicle_id = hr.vehicle_id
      JOIN edition e     ON e.edition_id = v.edition_id
      JOIN model_year my ON my.model_year_id = e.model_year_id
      JOIN model mo      ON mo.model_id = my.model_id
      JOIN make m        ON m.make_id = mo.make_id
      LEFT JOIN handover_record_pdf pdf ON pdf.handover_record_pdf_id = hr.latest_pdf_id
      WHERE hr.contract_id = ?
      ORDER BY hr.created_at DESC
      `,
      [contract_id]
    );

    res.json({ items: rows });
  } catch (e) {
    console.error('GET /handover/by-contract/:contract_id', e);
    res.status(500).json({ error: 'DB error' });
  }
});

/**
 * Get signed URL for latest pdf by handover_record_id.
 */
router.get('/:handover_record_id/pdf/latest', async (req, res) => {
  try {
    const handover_record_id = Number(req.params.handover_record_id);
    if (!handover_record_id) return res.status(400).json({ error: 'handover_record_id required' });

    const [[row]] = await pool.query(
      `
      SELECT pdf.gcs_key, pdf.version
      FROM handover_record hr
      JOIN handover_record_pdf pdf ON pdf.handover_record_pdf_id = hr.latest_pdf_id
      WHERE hr.handover_record_id = ?
      `,
      [handover_record_id]
    );
    if (!row) return res.status(404).json({ error: 'No PDF found' });

    const signed = await getSignedReadUrl(row.gcs_key, { minutes: 10 });
    res.json({ version: row.version, ...signed });
  } catch (e) {
    console.error('GET /handover/:id/pdf/latest', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create drafts for all items in a contract (skip existing)
router.post('/bulk-from-contract/:contract_id', async (req, res) => {
  try {
    const contract_id = Number(req.params.contract_id);
    if (!contract_id) return res.status(400).json({ error: 'contract_id required' });

    const out = await withTxn(async (conn) => {
      const [[ctr]] = await conn.query(`SELECT * FROM contract WHERE contract_id = ?`, [contract_id]);
      if (!ctr) throw new Error('contract not found');

      const [items] = await conn.query(
        `SELECT ci.contract_item_id FROM contract_item ci WHERE ci.contract_id = ?`,
        [contract_id]
      );

      const [existing] = await conn.query(
        `SELECT contract_item_id FROM handover_record WHERE contract_id = ?`,
        [contract_id]
      );
      const have = new Set(existing.map(r => r.contract_item_id));

      const created_by_user_id = req.user?.user_id || 1;
      const buyerSnap = ctr.buyer_snapshot_json || null;

      let created = 0;
      for (const it of items) {
        if (have.has(it.contract_item_id)) continue;

        const [[row]] = await conn.query(
          `
          SELECT ci.contract_item_id, ci.contract_id, ci.vehicle_id,
                 c.customer_id, v.vin, v.mileage AS mileage_km, s.city
          FROM contract_item ci
          JOIN vehicle v ON v.vehicle_id = ci.vehicle_id
          JOIN shop s ON s.shop_id = v.shop_id
          JOIN contract c ON c.contract_id = ci.contract_id
          WHERE ci.contract_item_id = ? AND ci.contract_id = ?
          `,
          [it.contract_item_id, contract_id]
        );
        if (!row) continue;

        const buyer_snapshot = buyerSnap || await (async () => {
          const [[cust]] = await conn.query(`SELECT customer_id, display_name, national_id_enc FROM customer WHERE customer_id = ?`, [ctr.customer_id]);
          let national_id = null;
          try{ national_id = decryptNationalId(cust.national_id_enc) } catch{}
          return { captured_at_utc: new Date().toISOString(), customer_id: cust.customer_id, display_name: cust.display_name || '', national_id };
        })();

        await conn.query(
          `
          INSERT INTO handover_record
            (uuid, contract_id, contract_item_id, vehicle_id, customer_id,
             buyer_snapshot_json, seller_snapshot_json, status,
             handover_date, location, odometer_km, notes,
             created_by_user_id, created_at)
          SELECT UUID(), ?, ?, ci.vehicle_id, ?, CAST(? AS JSON), CAST(? AS JSON), 'draft',
                 NULL, ?, ?, NULL,
                 ?, NOW()
          FROM contract_item ci
          WHERE ci.contract_item_id = ? AND ci.contract_id = ?
          `,
          [
            contract_id,
            it.contract_item_id,
            ctr.customer_id,
            JSON.stringify(buyer_snapshot),
            JSON.stringify(null),
            row.city ? row.city : null,
            row.mileage_km ? row.mileage_km : null,
            created_by_user_id,
            it.contract_item_id,
            contract_id
          ]
        );
        created++;
      }

      return { created };
    });

    res.json(out);
  } catch (e) {
    console.error('POST /handover/bulk-from-contract/:contract_id', e);
    res.status(400).json({ error: e.message || 'Bulk create failed' });
  }
});

// Mark signed
router.post('/:handover_record_id/mark-signed', async (req, res) => {
  try {
    const id = Number(req.params.handover_record_id);
    await withTxn(async (conn) => {
      await conn.query(`UPDATE handover_record SET status='signed', updated_at = NOW() WHERE handover_record_id = ?`, [id]);
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /handover/:id/mark-signed', e);
    res.status(400).json({ error: e.message || 'Failed' });
  }
});

// Void (annul)
router.post('/:handover_record_id/void', async (req, res) => {
  try {
    const id = Number(req.params.handover_record_id);
    await withTxn(async (conn) => {
      await conn.query(`UPDATE handover_record SET status='void', updated_at = NOW() WHERE handover_record_id = ?`, [id]);
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /handover/:id/void', e);
    res.status(400).json({ error: e.message || 'Failed' });
  }
});


module.exports = router;
