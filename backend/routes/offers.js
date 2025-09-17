// backend/routes/offers.js
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

const { createOffer } = require("../models/offerModel");
const pool = require("../db");
const mysql = require("mysql2/promise");
const React = require("react");
const ReactPDF = require("@react-pdf/renderer");
const OfferPDF = require("../pdfTemplates/offerPDF.js");
const nodemailer = require("nodemailer");

const router = express.Router();

// Create offer and generate PDF
router.post("/", async (req, res) => {
  const { type, buyer, carIds, admin_id, admin_firstname, admin_lastname } = req.body;

  if (!type || !buyer || !carIds?.length) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const offerUuid = uuidv4();
    const pdfPath = path.join(__dirname, `../offers/${offerUuid}.pdf`);

    // Fetch selected cars
    const [cars] = await connection.query(`SELECT * FROM cars WHERE id IN (?)`, [carIds]);

    // Generate PDF with react-pdf
    const pdfStream = await ReactPDF.renderToStream(
      React.createElement(OfferPDF, {
        type,
        buyer,
        admin_firstname,
        admin_lastname,
        cars
      })
    );

    const fileStream = fs.createWriteStream(pdfPath);
    pdfStream.pipe(fileStream);

    await new Promise((resolve) => fileStream.on("finish", resolve));

    // Save to DB
    if(type === "client"){

      await connection.query(
        `INSERT INTO offers (uuid, client_uuid, client_firstname, client_lastname, client_email, car_ids, admin_id, pdf_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          offerUuid,
          buyer.uuid,
          buyer.first_name,
          buyer.last_name,
          buyer.email,
          JSON.stringify(carIds),
          admin_id,
          `offers/${offerUuid}.pdf`,
        ]
      );
    }else if(type === "company"){
      await connection.query(
        `INSERT INTO offers (uuid, company_uuid, company_name, client_email, car_ids, admin_id, pdf_path)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          offerUuid,
          buyer.uuid,
          buyer.name,
          buyer.email,
          JSON.stringify(carIds),
          admin_id,
          `offers/${offerUuid}.pdf`,
        ]
      );
    }
      
    res.json({
      success: true,
      offerId: offerUuid,
      previewUrl: `/offers/${offerUuid}.pdf`,
    });
  } catch (err) {
    console.error("Error creating offer:", err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    await connection.end();
  }
});

router.post("/send", async (req, res) => {
  const { offerId, client_email } = req.body;

  if (!offerId || !client_email) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Fetch offer from DB to get PDF URL
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    const [offers] = await connection.query("SELECT * FROM offers WHERE uuid = ?", [offerId]);

    if (!offers.length) {
      return res.status(404).json({ error: "Offer not found" });
    }

    const offer = offers[0];
    const pdfUrl = `http://localhost:5000/${offer.pdf_path.replace(/\\/g, "/")}`;

    // Send email with link
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: 'vdimov54@gmail.com',  // Use environment variable in production
        pass: 'idfg rvto pkwj tvfr', // Use environment variable in production
      },
    });

    await transporter.sendMail({
      from: `"Car Offers" <test@gmail.com>`,
      to: client_email,
      subject: "Your Car Offer",
      html: `
        <p>Dear ${offer.client_firstname},</p>
        <p>Thank you for considering our cars! You can view your offer at the link below:</p>
        <a href="${pdfUrl}" target="_blank">View Your Offer</a>
        <p>Best regards,<br>Car Deals Team</p>
      `,
    });

    res.json({ success: true, message: "Offer email sent successfully" });
  } catch (err) {
    console.error("Error sending offer:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", async (req, res) => {
  const { client, limit } = req.query;
  const maxLimit = parseInt(limit) || 5;
  const test = "dsadsa";

  try {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);

    let query = `SELECT * FROM offers`;
    let params = [];

    if (client && client.trim() !== "" && !client.includes("@")) {
      const [firstname, lastname] = client.split(" ");
      query += ` WHERE LOWER(client_firstname) LIKE LOWER(?) OR LOWER(client_lastname) LIKE LOWER(?) OR LOWER(company_name) LIKE LOWER(?) ORDER BY created_at DESC`;
      params.push(`%${firstname}%`, `%${lastname}%`, `%${client}%`);
    } else if (client && client.includes("@")) {
      query += ` WHERE client_email LIKE ? ORDER BY created_at DESC`;
      params.push(`%${client}%`);
    } else {
      query += ` ORDER BY created_at DESC LIMIT ?`;
      params.push(maxLimit);
    }

    const [offers] = await connection.query(query, params);
    await connection.end();

    res.json({ offers });
  } catch (err) {
    console.error("Error fetching offers:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:uuid", async (req, res) => {
  const { uuid } = req.params;

  try {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    await connection.query("DELETE FROM offers WHERE uuid = ?", [uuid]);
    await connection.end();

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting offer:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
