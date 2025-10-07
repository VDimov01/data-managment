// backend/services/handoverPDF.js
const React = require('react');
const crypto = require('crypto');
const path = require('path');
const { pdf, Document, Page, Text, View, StyleSheet, Font } = require('@react-pdf/renderer');

const { bucketPrivate, storage, BUCKET_PRIVATE } = require('./gcs');

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

/** Extremely simple single-vehicle handover PDF (Bulgarian labels kept generic) */
function HandoverDoc({ buyer, vehicle, handover }) {
  const styles = StyleSheet.create({
    page: { padding: 40, fontSize: 11, fontFamily: 'DejaVu' },
    h1: { fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },
    block: { marginTop: 10, marginBottom: 6 },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 3 },
    label: { fontWeight: 'bold' },
    small: { fontSize: 10, color: '#555' },
  });

  const buyerName =
    buyer?.display_name ||
    [buyer?.first_name, buyer?.middle_name, buyer?.last_name].filter(Boolean).join(' ') ||
    buyer?.company_name || '';

  return React.createElement(
    Document, null,
    React.createElement(
      Page, { size: 'A4', style: styles.page },
      React.createElement(Text, { style: styles.h1 }, 'ПРИЕМО-ПРЕДАВАТЕЛЕН ПРОТОКОЛ'),

      React.createElement(View, { style: styles.block },
        React.createElement(Text, { style: styles.label }, 'Купувач'),
        React.createElement(Text, null, buyerName),
        React.createElement(Text, { style: styles.small }, (buyer?.email || buyer?.phone) ? `${buyer?.email || ''} ${buyer?.phone || ''}` : '')
      ),

      React.createElement(View, { style: styles.block },
        React.createElement(Text, { style: styles.label }, 'Автомобил'),
        React.createElement(Text, null,
          `${vehicle?.make_name || vehicle?.make || ''} ${vehicle?.model_name || vehicle?.model || ''}`
          + (vehicle?.year ? ` (${vehicle.year})` : '')
          + (vehicle?.edition_name ? ` — ${vehicle.edition_name}` : '')
        ),
        React.createElement(Text, { style: styles.small },
          `VIN: ${vehicle?.vin || '—'} • Пробег: ${vehicle?.mileage_km ?? vehicle?.mileage ?? '—'} km`
        )
      ),

      React.createElement(View, { style: styles.block },
        React.createElement(Text, { style: styles.label }, 'Данни за предаване'),
        React.createElement(View, { style: styles.row },
          React.createElement(Text, null, 'Дата:'), React.createElement(Text, null, handover?.handover_date || '—')
        ),
        React.createElement(View, { style: styles.row },
          React.createElement(Text, null, 'Местоположение:'), React.createElement(Text, null, handover?.location || '—')
        ),
        React.createElement(View, { style: styles.row },
          React.createElement(Text, null, 'Одометър (км):'), React.createElement(Text, null, (handover?.odometer_km ?? '—') + '')
        ),
      ),

      React.createElement(View, { style: { marginTop: 30 } },
        React.createElement(Text, { style: styles.small }, 'Подписи:'),
        React.createElement(Text, { style: styles.small }, 'Продавач: ____________________________'),
        React.createElement(Text, { style: { ...styles.small, marginTop: 8 } }, 'Купувач: ____________________________')
      )
    )
  );
}

async function renderHandoverPdfBuffer({ buyer, vehicle, handover }) {
  ensureFonts();
  const element = React.createElement(HandoverDoc, { buyer, vehicle, handover });
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
