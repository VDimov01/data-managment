const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs");
const mysql = require("mysql2/promise");
const React = require("react");
const ReactPDF = require("@react-pdf/renderer");
const ContractPDF = require("../pdfTemplates/contractPDF");

router.post("/", async (req, res) => {
  const { client_uuid, company_uuid, cars, contract_type, advance_amount } = req.body;

  if ((!client_uuid && !company_uuid) || !Array.isArray(cars) || cars.length === 0) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const uuid = uuidv4();
    const pdfPath = path.join(__dirname, `../contracts/${uuid}.pdf`);

    // Fetch car and buyer info
    const carDetails = [];
    for (const car of cars) {
      const [[carData]] = await connection.query(
        `SELECT s.quantity, s.color, s.id AS storage_id, c.* FROM storage s
         JOIN cars c ON s.car_id = c.id WHERE s.id = ?`,
        [car.storage_id]
      );
      carDetails.push({ ...carData, quantity: car.quantity });
    }

    let type = "";
    if (client_uuid) {
      [[buyer]] = await connection.query(`SELECT * FROM clients WHERE uuid = ?`, [client_uuid]);
      type = "client";
    } else {
      [[buyer]] = await connection.query(`SELECT * FROM companies WHERE uuid = ?`, [company_uuid]);
      type = "company";
    }

    // Create PDF
    const pdfStream = await ReactPDF.renderToStream(
      React.createElement(ContractPDF, { cars: carDetails, buyer, contract_type, advance_amount, type })
    );
    const fileStream = fs.createWriteStream(pdfPath);
    pdfStream.pipe(fileStream);
    await new Promise((resolve) => fileStream.on("finish", resolve));

    // Insert into contracts
    const [contractResult] = await connection.query(
      `INSERT INTO contracts (uuid, client_uuid, company_uuid, pdf_path, contract_type, advance_amount)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuid, client_uuid || null, company_uuid || null, `contracts/${uuid}.pdf`, contract_type, advance_amount]
    );

    const contractId = contractResult.insertId;

    // Insert into contract_items and update storage
    for (const car of cars) {
      await connection.query(
        `INSERT INTO contract_items (contract_id, storage_id, quantity) VALUES (?, ?, ?)`,
        [contractId, car.storage_id, car.quantity]
      );

      await connection.query(
        `UPDATE storage SET quantity = quantity - ? WHERE id = ?`,
        [car.quantity, car.storage_id]
      );
    }

    res.json({
      success: true,
      contractId: uuid,
      previewUrl: `/contracts/${uuid}.pdf`
    });
  } catch (err) {
    console.error("❌ Error creating contract:", err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    await connection.end();
  }
});

/**
 * GET /api/contracts/search?query=...&page=1&limit=20
 * Searches contracts by client/company fields and returns paginated results.
 */
router.get("/search", async (req, res) => {
  const qRaw = (req.query.query || "").trim();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const offset = (page - 1) * limit;

  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const baseSelect = `
      FROM contracts c
      LEFT JOIN clients   cl ON c.client_uuid   = cl.uuid
      LEFT JOIN companies co ON c.company_uuid  = co.uuid
    `;

    let where = "";
    const params = [];
    if (qRaw) {
      where = `
        WHERE (cl.first_name LIKE ? OR cl.last_name LIKE ? OR cl.email LIKE ? OR co.name LIKE ?)
      `;
      const like = `%${qRaw}%`;
      params.push(like, like, like, like);
    }

    // Count for pagination
    const countSql = `SELECT COUNT(*) AS total ${baseSelect} ${where}`;
    const [countRows] = await connection.execute(countSql, params);
    const total = countRows[0]?.total || 0;

    // Main query – note LIMIT/OFFSET are inlined as sanitized integers (no placeholders)
    const listSql = `
      SELECT
        c.id, c.uuid, c.client_uuid, c.company_uuid, c.pdf_path, c.created_at,
        c.contract_type, c.advance_amount,
        cl.first_name, cl.last_name, cl.email AS client_email,
        co.name AS company_name
      ${baseSelect}
      ${where}
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const [rows] = await connection.execute(listSql, params);

    res.json({
      success: true,
      contracts: rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit
    });
  } catch (err) {
    console.error("❌ Error searching contracts:", err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    await connection.end();
  }
});



module.exports = router;
