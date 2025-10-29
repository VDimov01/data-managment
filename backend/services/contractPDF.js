// services/contractPDF.js
const React = require('react');
const { pdf } = require('@react-pdf/renderer');
const crypto = require('crypto');
const path = require('path');

const { bucketPrivate, storage, BUCKET_PRIVATE } = require('./gcs');

// Safe default-export grabber (works with CJS/ESM)
function requireDefault(m) { return m && m.__esModule ? m.default : m; }

const AdvanceContractPDF = requireDefault(require('../pdfTemplates/advanceContractPDF'));
let RegularContractPDF;
try {
  RegularContractPDF = requireDefault(require('../pdfTemplates/regularContractPDF'));
} catch {
  // Minimal fallback so dev doesn’t block
  const { Document, Page, Text, StyleSheet, Font } = require('@react-pdf/renderer');
  try {
    Font.register({
      family: 'DejaVu',
      fonts: [
        { src: path.join(__dirname, '../fonts/DejaVuSans.ttf') },
        { src: path.join(__dirname, '../fonts/DejaVuSans-Bold.ttf'), fontWeight: 'bold' },
      ],
    });
  } catch {}
  const styles = StyleSheet.create({
    page: { padding: 80, fontSize: 10, fontFamily: 'DejaVu' },
    title: { fontSize: 14, textAlign: 'center', marginBottom: 15 },
  });
  RegularContractPDF = function RegularFallback({ buyer, cars = [] }) {
    return React.createElement(
      Document, null,
      React.createElement(
        Page, { size: 'A4', style: styles.page },
        React.createElement(Text, { style: styles.title }, 'ДОГОВОР (стандартен)'),
        React.createElement(Text, null, `Купувач: ${buyer?.name || [buyer?.first_name, buyer?.last_name].filter(Boolean).join(' ')}`),
        React.createElement(Text, null, `Брой автомобили: ${cars.length}`)
      )
    );
  };
}

function toNum(x) {
  if (x == null) return 0;
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}

function buildTemplateProps({ type, buyer, items, advance_amount }) {
  const cars = items.map(it => ({
    maker: it.maker,
    model: it.model,
    edition: it.edition,
    vin: it.vin || '',
    exterior_color: it.exterior_color || '',
    interior_color: it.interior_color || '',
    mileage_km: it.mileage ?? 0,
    quantity: it.quantity,
    unit_price: toNum(it.line_total),
  }));

  return {
    buyer,
    cars,
    contractType: type, // 'ADVANCE' | 'REGULAR'
    buyerType: buyer?.type === 'company' ? 'company' : 'individual',
    advance_amount: type === 'ADVANCE' ? toNum(advance_amount) : undefined,
  };
}

// ---- core hardening: ALWAYS return Buffer ----
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function elementToBuffer(element) {
  const inst = pdf(element);

  // Newer API: Promise<Buffer | Uint8Array> (ideal)
  if (typeof inst.toBuffer === 'function') {
    const out = await inst.toBuffer();

    // Your case: out is actually a PDFDocument (stream-like).
    if (out && typeof out.on === 'function') {
      // It’s a pdfkit stream/doc; collect bytes.
      return await streamToBuffer(out);
    }

    if (Buffer.isBuffer(out)) return out;
    if (out instanceof Uint8Array) return Buffer.from(out);
  }

  // Stream path: Promise<Stream> or Stream
  if (typeof inst.toStream === 'function') {
    const s = await inst.toStream();
    return await streamToBuffer(s);
  }

  // Fallback: string (binary) — last resort
  if (typeof inst.toString === 'function') {
    const str = await inst.toString();
    return Buffer.from(str, 'binary');
  }

  throw new Error('react-pdf: cannot obtain bytes from renderer');
}

async function renderContractPdfBuffer({ type, buyer, items, advance_amount }) {
  const Doc = type === 'ADVANCE' ? AdvanceContractPDF : RegularContractPDF;
  // DO NOT CALL Doc(...) directly — create a React element
  const element = React.createElement(Doc, buildTemplateProps({type, buyer, items, advance_amount }));
  const buf = await elementToBuffer(element);

  // Optional debug:
  // console.log('PDF bytes:', { isBuffer: Buffer.isBuffer(buf), length: buf.length });

  return buf;
}

async function uploadContractPdfBuffer({ contract_uuid, version, buffer }) {
  // Coerce any typed-array to Buffer
  const bytes = Buffer.isBuffer(buffer)
    ? buffer
    : (buffer instanceof Uint8Array ? Buffer.from(buffer) : null);

  if (!bytes) throw new Error('uploadContractPdfBuffer: expected Buffer bytes');

  const gcsKey = `contracts/${contract_uuid}/v${String(version).padStart(3, '0')}.pdf`;
  const file = bucketPrivate.file(gcsKey);

  await file.save(bytes, {
    resumable: false,
    metadata: {
      contentType: 'application/pdf',
      metadata: { contract_uuid, version: String(version) },
    },
  });

  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  return { gcsKey, size: bytes.length, sha256 };
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
  renderContractPdfBuffer,
  uploadContractPdfBuffer,
  getSignedReadUrl,
};
