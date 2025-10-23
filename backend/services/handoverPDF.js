// backend/services/handoverPDF.js
const React = require('react');
const crypto = require('crypto');
const path = require('path');
const { pdf, Document, Page, Text, View, StyleSheet, Font } = require('@react-pdf/renderer');

const { bucketPrivate, storage, BUCKET_PRIVATE } = require('./gcs');
const HandoverRecordBG = require ('../pdfTemplates/handoverRecordBG.js');

const seller = { 
    name: process.env.DEALER_NAME || 'Некст Авто ЕООД',
    tax_id: '208224080',
    address: 'ул. Темида 1, вх. Б, ап.16',
    city: 'Стара Загора',
    country: 'България',
    email: 'sales@solaris.expert',
    phone: '0996600900',
    representative: 'Пламен Иванов Генчев'
   };

let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  try {
    Font.register({
      family: 'DejaVu',
      fonts: [
        { src: path.join(__dirname, '../fonts/DejaVuSans.ttf') },
        { src: path.join(__dirname, '../fonts/DejaVuSans-Bold.ttf'), fontWeight: 'bold' },
      ],
    });
  } catch (_) { /* core fonts fallback */ }
  fontsReady = true;
}

function ensureBuffer(buf, label) {
  if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
    throw new Error(`${label || 'buffer'}: expected non-empty Buffer`);
  }
  return buf;
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function elementToBuffer(element) {
  const inst = pdf(element);

  if (typeof inst.toBuffer === 'function') {
    const out = await inst.toBuffer();
    if (out && typeof out.on === 'function') return streamToBuffer(out); // pdfkit stream
    if (Buffer.isBuffer(out)) return out;
    if (out instanceof Uint8Array) return Buffer.from(out);
  }
  if (typeof inst.toStream === 'function') {
    const s = await inst.toStream();
    return streamToBuffer(s);
  }
  // very last resort (not expected)
  const str = await inst.toString();
  return Buffer.from(str, 'binary');
}

// somewhere near your PDF render call
const logoUri = {
  viewBox: "0 0 300 120",
  groupTransform: "translate(0,120) scale(0.1,-0.1)", // from <g ... transform="...">
  paths: [
    { d: "M123 790 c-55 -33 -63 -61 -63 -230 l0 -150 80 0 80 0 0 163 c0 113 4 167 12 175 8 8 61 12 175 12 150 0 163 -1 173 -19 6 -11 10 -87 10 -175 l0 -156 80 0 80 0 0 146 c0 164 -10 202 -64 235 -28 17 -54 19 -281 19 -230 0 -253 -2 -282 -20z" },
    { d: "M873 790 c-57 -34 -68 -62 -68 -175 0 -115 14 -153 68 -182 28 -16 66 -18 300 -21 l267 -3 0 25 0 26 -213 0 c-274 0 -257 -10 -257 154 0 81 4 126 12 134 9 9 75 12 235 12 l223 0 0 25 0 25 -267 0 c-248 0 -270 -2 -300 -20z" },
    { d: "M1500 779 c0 -28 6 -32 110 -81 61 -28 107 -54 103 -58 -4 -4 -28 -14 -53 -23 -25 -9 -71 -26 -102 -37 l-58 -21 0 -70 c0 -68 1 -70 23 -63 12 3 100 35 196 71 l174 64 145 -71 c79 -38 146 -70 148 -70 2 0 4 13 4 28 0 27 -9 33 -167 109 -93 44 -248 119 -345 166 l-178 86 0 -30z" },
    { d: "M2025 750 l-159 -58 81 -41 82 -41 73 26 c40 14 77 29 81 34 4 4 7 36 5 72 l-3 66 -160 -58z" },
    { d: "M2250 785 l0 -25 119 0 c86 0 122 -4 130 -13 6 -8 12 -76 13 -173 l3 -159 80 0 80 0 3 159 c1 97 7 165 13 173 8 9 44 13 130 13 l119 0 0 25 0 25 -345 0 -345 0 0 -25z" },
    { d: "M1020 615 l0 -25 201 0 200 0 -3 23 c-3 22 -4 22 -200 25 l-198 2 0 -25z" },
  ],
  fill: "#000000", // default fill
};


async function renderHandoverPdfBuffer({ buyer, vehicle, handover }) {
  ensureFonts();

  const element = React.createElement(HandoverRecordBG, { record: handover , seller, buyer, vehicle, logoUri });
  const buffer = await elementToBuffer(element);
  return ensureBuffer(buffer, 'handover pdf');
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(ensureBuffer(buf)).digest('hex');
}

/**
 * Upload; GCS path:
 * contracts/{contract_uuid}/handover/{handover_uuid}/handover-vNNN.pdf
 */
async function uploadHandoverPdfBuffer({ contract_uuid, handover_uuid, version, buffer }) {
  if (!contract_uuid) throw new Error('uploadHandoverPdfBuffer: missing contract_uuid');
  if (!handover_uuid) throw new Error('uploadHandoverPdfBuffer: missing handover_uuid');

  const ver = String(version).padStart(3, '0');
  const filename = `handover-v${ver}.pdf`;
  const gcsKey = `contracts/${contract_uuid}/handover/${handover_uuid}/${filename}`;

  const file = bucketPrivate.file(gcsKey);
  await file.save(ensureBuffer(buffer), {
    resumable: false,
    metadata: {
      contentType: 'application/pdf',
      metadata: { contract_uuid, handover_uuid, version: String(version) },
    },
  });

  const sha256 = sha256Hex(buffer);
  const byte_size = buffer.length;

  return { gcsKey, filename, byte_size, sha256, content_type: 'application/pdf' };
}

async function getSignedReadUrl(gcsKey, { minutes = 10 } = {}) {
  const expires = Date.now() + minutes * 60 * 1000;
  const [signedUrl] = await storage.bucket(BUCKET_PRIVATE).file(gcsKey).getSignedUrl({
    action: 'read',
    expires,
  });
  return { signedUrl, expiresAt: new Date(expires).toISOString() };
}

module.exports = {
  renderHandoverPdfBuffer,
  uploadHandoverPdfBuffer,
  getSignedReadUrl,
  ensureBuffer,
};
