// backend/services/offerPdfService.js
const React = require('react');
const path = require('path');
const { pdf, Document, Page, View, Text, Font, StyleSheet } = require('@react-pdf/renderer');

let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  // Try DejaVu (you already ship it for handovers)
  try {
    Font.register({
      family: 'DejaVu',
      fonts: [
        { src: path.join(__dirname, '../fonts/DejaVuSans.ttf') },
        { src: path.join(__dirname, '../fonts/DejaVuSans-Bold.ttf'), fontWeight: 'bold' },
      ],
    });
  } catch {}
  // Optional NotoSans if you actually have these files
  try {
    Font.register({
      family: 'NotoSans',
      fonts: [
        { src: path.join(process.cwd(), 'assets/fonts/NotoSans-Regular.ttf') },
        { src: path.join(process.cwd(), 'assets/fonts/NotoSans-Bold.ttf'), fontWeight: 'bold' },
      ],
    });
  } catch {}
  fontsReady = true;
}

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: 'DejaVu', fontSize: 11 },
  h1: { fontSize: 16, marginBottom: 8, fontWeight: 'bold' },
  row: { flexDirection: 'row' },
  th: { fontWeight: 'bold', borderBottom: '1pt solid #000', padding: 6 },
  td: { borderBottom: '1pt solid #e5e7eb', padding: 6 },
  right: { textAlign: 'right' }
});

function OfferDoc({ snap }) {
  const { offer, customer, items = [], totals, dealer } = snap;

  const customerBlock = customer
    ? React.createElement(
        View,
        null,
        React.createElement(Text, null, `Клиент: ${customer.display_name}`),
        customer.representative
          ? React.createElement(Text, null, `Представляван от: ${customer.representative}`)
          : null,
        React.createElement(
          Text,
          null,
          [customer.address_line, customer.postal_code, customer.city, customer.country]
            .filter(Boolean)
            .join(', ')
        ),
        React.createElement(
          Text,
          null,
          `ЕИК/БУЛСТАТ: ${customer.tax_id || '—'} | ДДС №: ${customer.vat_number || '—'}`
        ),
        React.createElement(
          Text,
          null,
          `E: ${customer.email || '—'} | T: ${customer.phone || '—'}`
        )
      )
    : null;

  const tableHeader = React.createElement(
    View,
    { style: [styles.row] },
    React.createElement(Text, { style: [styles.th, { flexBasis: '55%' }] }, 'Описание'),
    React.createElement(Text, { style: [styles.th, styles.right, { flexBasis: '15%' }] }, 'К-во'),
    React.createElement(Text, { style: [styles.th, styles.right, { flexBasis: '15%' }] }, 'Ед. цена'),
    React.createElement(Text, { style: [styles.th, styles.right, { flexBasis: '15%' }] }, 'Сума')
  );

  const tableRows = items.map((it) =>
    React.createElement(
      View,
      { key: String(it.line_no), style: styles.row },
      React.createElement(Text, { style: [styles.td, { flexBasis: '55%' }] }, it.description || ''),
      React.createElement(Text, { style: [styles.td, styles.right, { flexBasis: '15%' }] }, String(it.quantity)),
      React.createElement(
        Text,
        { style: [styles.td, styles.right, { flexBasis: '15%' }] },
        `${Number(it.unit_price).toFixed(2)} ${offer.currency}`
      ),
      React.createElement(
        Text,
        { style: [styles.td, styles.right, { flexBasis: '15%' }] },
        `${Number(it.line_total).toFixed(2)} ${offer.currency}`
      )
    )
  );

  const notesBlock = offer.notes_public
    ? React.createElement(
        View,
        { style: { marginTop: 12 } },
        React.createElement(Text, null, `Бележки: ${offer.notes_public}`)
      )
    : null;

  const dealerBlock = dealer
    ? React.createElement(
        View,
        { style: { marginTop: 16 } },
        React.createElement(Text, null, `Доставчик: ${dealer.name}`)
      )
    : null;

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      React.createElement(
        Text,
        { style: styles.h1 },
        `Оферта ${offer.offer_number ? offer.offer_number : '(чернова)'}`
      ),
      customerBlock,
      React.createElement(Text, null, `Валидна до: ${offer.valid_until || '—'}`),
      React.createElement(
        View,
        { style: { marginTop: 10 } },
        tableHeader,
        ...tableRows
      ),
      React.createElement(
        View,
        { style: { marginTop: 12 } },
        React.createElement(Text, null, `Междинна сума: ${Number(totals.subtotal).toFixed(2)} ${offer.currency}`),
        React.createElement(Text, null, `Отстъпка: ${Number(totals.discount).toFixed(2)} ${offer.currency}`),
        React.createElement(Text, null, `ДДС (${offer.vat_rate}%): ${Number(totals.vat).toFixed(2)} ${offer.currency}`),
        React.createElement(Text, null, `Крайна сума: ${Number(totals.total).toFixed(2)} ${offer.currency}`)
      ),
      notesBlock,
      dealerBlock
    )
  );
}

// --- buffer helpers (same pattern as your handover service) ---
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
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
  const str = await inst.toString(); // last resort
  return Buffer.from(str, 'binary');
}

async function renderOfferPdfBuffer(snapshot) {
  ensureFonts();
  const element = React.createElement(OfferDoc, { snap: snapshot });
  return elementToBuffer(element);
}

module.exports = { renderOfferPdfBuffer };
