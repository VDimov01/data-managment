// backend/services/offerPdfService.js
const React = require('react');
const fs = require('fs');
const path = require('path');
const {
  pdf,
  Document,
  Page,
  View,
  Text,
  Font,
  StyleSheet,
  Image,
} = require('@react-pdf/renderer');

function splitOfferNumber(s) {
  const parts = String(s || '').split('-'); // e.g. OF-2025-00023
  const [prefix, year, number] = parts;
  return { prefix: prefix || '', year: year || '', number: number || '' };
}

function fileToDataUri(absPath) {
  try {
    const buf = fs.readFileSync(absPath);
    const ext = (absPath.split('.').pop() || '').toLowerCase();
    const mime =
      ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
      ext === 'svg' ? 'image/svg+xml' : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}


let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  // Primary: DejaVu (supports Cyrillic)
  try {
    Font.register({
      family: 'DejaVu',
      fonts: [
        { src: path.join(__dirname, '../fonts/DejaVuSans.ttf') },
        { src: path.join(__dirname, '../fonts/DejaVuSans-Bold.ttf'), fontWeight: 'bold' },
      ],
    });
  } catch {}
  // Optional secondary (if you ship these)
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

/* ───────────── Helpers ───────────── */
function fmtMoney(n, ccy) {
  const v = Number(n || 0).toFixed(2);
  return `${v} ${ccy || ''}`.trim();
}

function fmtDate(value, { fallback = '—' } = {}) {
  if (!value) return fallback;
  // Accept 'YYYY-MM-DD', Date, or ISO string; always reduce to the date part.
  let ymd;
  if (typeof value === 'string') {
    // grab first 10 chars if ISO, or whole string if it's already YYYY-MM-DD
    const s = value.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
    ymd = s;
  } else if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // convert to YYYY-MM-DD in UTC (so we don’t shift days by TZ)
    ymd = value.toISOString().slice(0, 10);
  } else {
    return fallback;
  }
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`; // dd/mm/yyyy
}

function hasFile(p) {
  try { return !!(p && fs.existsSync(p)); } catch { return false; }
}

/* ───────────── Styles ───────────── */
const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 36,
    paddingHorizontal: 28,
    fontFamily: 'DejaVu',
    fontSize: 11,
    color: '#111827',
  },

  /* Header */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'stretch',
    marginBottom: 12,
  },
  logoBox: {
    width: 160,
    height: 48,
    border: '1pt solid #e5e7eb',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fafafa',
  },
  logo: { width: 160 },
  logoText: { fontSize: 10, color: '#6b7280' },

  hdrRight: {
    flexGrow: 1,
    padding: 10,
    border: '1pt solid #e5e7eb',
    borderRadius: 6,
  },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  h1: { fontSize: 16, fontWeight: 'bold' },
  meta: { color: '#6b7280', fontSize: 10, marginTop: 2 },

  /* Blocks */
  infoGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  card: {
    flex: 1,
    border: '1pt solid #e5e7eb',
    borderRadius: 6,
    padding: 10,
  },
  cardH: { fontSize: 12, fontWeight: 'bold', marginBottom: 6 },
  line: { marginBottom: 2 },

  /* Table */
  table: { marginTop: 12, borderRadius: 6, overflow: 'hidden', border: '1pt solid #e5e7eb' },
  tRow: { flexDirection: 'row' },
  th: {
    backgroundColor: '#f3f4f6',
    fontWeight: 'bold',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRight: '1pt solid #e5e7eb',
  },
  td: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRight: '1pt solid #e5e7eb',
    borderTop: '1pt solid #f1f5f9',
  },
  right: { textAlign: 'right' },
  center: { textAlign: 'center' },
  colNo: { width: '6%' },
  colDesc: { width: '38%' },
  colQty: { width: '9%' },
  colNet: { width: '14%' },
  colVatPct: { width: '9%' },
  colVatSum: { width: '12%' },
  colGross: { width: '12%' },

  zebra: { backgroundColor: '#fafafa' },

  /* Totals panel */
  totalsWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  totalsCard: {
    width: 280,
    border: '1pt solid #e5e7eb',
    borderRadius: 6,
    padding: 10,
    backgroundColor: '#fafafa',
  },
  totLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  totLbl: { color: '#374151' },
  totVal: { fontWeight: 'bold' },
  totStrong: { fontSize: 13, fontWeight: 'bold' },

  /* Notes + footer */
  notes: {
    marginTop: 12,
    borderTop: '1pt solid #e5e7eb',
    paddingTop: 8,
    fontSize: 10,
    color: '#374151',
  },
  dealer: { marginTop: 8, fontSize: 10, color: '#374151' },

  footer: {
    position: 'absolute',
    left: 28,
    right: 28,
    bottom: 20,
    fontSize: 9,
    color: '#6b7280',
    textAlign: 'center',
  },
});

function OfferDoc({ snap, logoUri }) {
  const { offer, customer, items = [], totals, dealer } = snap || {};
  const ccy = offer?.currency || 'BGN';
  const logoPath = process.env.DEALER_LOGO_PATH;

  // number-only for the title (last segment after "-")
  const { number: numOnly } = splitOfferNumber(offer?.offer_number);
  const titleNumber = numOnly || (offer?.offer_number ? offer.offer_number : '(чернова)');

  const validText = offer?.valid_until ? `Валидна до: ${offer.valid_until}` : '';
  const dateText = snap?.ts_iso ? `Дата: ${fmtDate(snap.ts_iso)}` : '';

  const cust = customer || null;

  /* Table header */
  const header = React.createElement(
    View,
    { style: [styles.tRow] },
    React.createElement(Text, { style: [styles.th, styles.center, styles.colNo] }, '№'),
    React.createElement(Text, { style: [styles.th, styles.colDesc] }, 'Описание'),
    React.createElement(Text, { style: [styles.th, styles.center, styles.colQty] }, 'К-во'),
    React.createElement(Text, { style: [styles.th, styles.right, styles.colNet] }, 'Цена (без ДДС)'),
    React.createElement(Text, { style: [styles.th, styles.center, styles.colVatPct] }, 'ДДС %'),
    React.createElement(Text, { style: [styles.th, styles.right, styles.colVatSum] }, 'ДДС (сума)'),
    React.createElement(Text, { style: [styles.th, styles.right, styles.colGross] }, 'Цена (с ДДС)')
  );

  const rows = items.map((it, idx) => {
    const qty = Number(it.quantity || 1);
    const rate = Number(it.vat_rate || offer?.vat_rate || 0);

    const unitNet = it.unit_price_net != null ? Number(it.unit_price_net) : Number(it.unit_price || 0);
    const unitGross = it.unit_price_gross != null ? Number(it.unit_price_gross) : (unitNet * (1 + rate / 100));
    const unitVat = unitGross - unitNet;

    const zebra = idx % 2 === 1 ? styles.zebra : null;

    return React.createElement(
      View,
      { key: String(it.line_no ?? idx), style: [styles.tRow, zebra] },
      React.createElement(Text, { style: [styles.td, styles.center, styles.colNo] }, String(it.line_no ?? idx + 1)),
      React.createElement(Text, { style: [styles.td, styles.colDesc] }, it.description || ''),
      React.createElement(Text, { style: [styles.td, styles.center, styles.colQty] }, String(qty)),
      React.createElement(Text, { style: [styles.td, styles.right, styles.colNet] }, fmtMoney(unitNet, ccy)),
      React.createElement(Text, { style: [styles.td, styles.center, styles.colVatPct] }, String(rate)),
      React.createElement(Text, { style: [styles.td, styles.right, styles.colVatSum] }, fmtMoney(unitVat, ccy)),
      React.createElement(Text, { style: [styles.td, styles.right, styles.colGross] }, fmtMoney(unitGross, ccy))
    );
  });

  const notesBlock = offer?.notes_public
    ? React.createElement(View, { style: styles.notes }, React.createElement(Text, null, `Бележки: ${offer.notes_public}`))
    : null;

  const dealerBlock = dealer?.name
    ? React.createElement(View, { style: styles.dealer }, React.createElement(Text, null, `Доставчик: ${dealer.name}`))
    : null;

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },

      /* Header: logo + meta */
      React.createElement(
        View,
        { style: styles.header },
        React.createElement(
          View,
          { style: styles.logoBox },
          logoUri
            ? React.createElement(Image, { src: logoUri, style: styles.logo })
            : React.createElement(Text, { style: styles.logoText }, 'LOGO')
        ),
        React.createElement(
          View,
          { style: styles.hdrRight },
          React.createElement(
            View,
            { style: styles.titleRow },
            React.createElement(Text, { style: styles.h1 }, `Оферта №${titleNumber}`),
            React.createElement(Text, { style: styles.meta }, ccy)
          ),
          React.createElement(Text, { style: styles.meta }, [dateText, validText].filter(Boolean).join(' • '))
        )
      ),

      /* Info grid: Customer + Dealer (replaces "Данни за офертата") */
      React.createElement(
        View,
        { style: styles.infoGrid },
        // Dealer card (NEW)

        React.createElement(
          View,
          { style: styles.card },
          React.createElement(Text, { style: styles.cardH }, 'Доставчик'),
          dealer?.name ? React.createElement(Text, { style: styles.line }, dealer.name) : null,
          (dealer?.address || dealer?.city || dealer?.country || dealer?.postal_code)
            ? React.createElement(Text, { style: styles.line },
                'Адрес: ', [dealer.address, dealer.postal_code, dealer.city, dealer.country].filter(Boolean).join(', ')
              )
            : null,
          (dealer?.email || dealer?.phone || dealer?.website)
            ? React.createElement(Text, { style: styles.line },
                [
                  dealer.email ? `Email: ${dealer.email}` : null,
                  dealer.phone ? `Тел.: ${dealer.phone}` : null,
                  dealer.website ? dealer.website : null,
                ].filter(Boolean).join(' | ')
              )
            : null,
          (dealer?.tax_id || dealer?.vat_number)
            ? React.createElement(Text, { style: styles.line },
                [
                  dealer.tax_id ? `ЕИК/Булстат: ${dealer.tax_id}` : null,
                  dealer.vat_number ? `ДДС №: ${dealer.vat_number}` : null,
                ].filter(Boolean).join(' | ')
              )
            : (!dealer?.name ? React.createElement(Text, { style: styles.line }, '—') : null),
            React.createElement(Text, {style: styles.line}, 
              `Представител: ${dealer.representative}`
            )
        ),
        // Customer card

        React.createElement(
          View,
          { style: styles.card },
          React.createElement(Text, { style: styles.cardH }, 'Клиент'),
          cust
            ? React.createElement(
                React.Fragment,
                null,
                React.createElement(Text, { style: styles.line }, `${cust.display_name || ''}`),
                cust.representative ? React.createElement(Text, { style: styles.line }, `Представляван от: ${cust.representative}`) : null,
                (cust.address_line || cust.city || cust.country || cust.postal_code)
                  ? React.createElement(Text, { style: styles.line },
                     'Адрес: ', [cust.address_line, cust.city, cust.country].filter(Boolean).join(', ')
                    )
                  : null,
                (cust.email || cust.phone)
                  ? React.createElement(Text, { style: styles.line },
                      [cust.email ? `Email: ${cust.email}` : null, cust.phone ? `Тел.: ${cust.phone}` : null].filter(Boolean).join(' | ')
                    )
                  : null,
                (cust.tax_id || cust.vat_number || cust.national_id_last4)
                  ? React.createElement(Text, { style: styles.line },
                      [
                        cust.tax_id ? `ЕИК/Булстат: ${cust.tax_id}` : null,
                        cust.vat_number ? `ДДС №: ${cust.vat_number}` : null,
                        cust.national_id_last4 ? `ЕГН: ******${cust.national_id_last4}` : null,
                      ].filter(Boolean).join(' | ')
                    )
                  : null
              )
            : React.createElement(Text, { style: styles.line }, '—')
        ),
      ),

      // Items table
      React.createElement(
        View,
        { style: styles.table },
        header,
        ...rows
      ),

      // Totals panel
      React.createElement(
        View,
        { style: styles.totalsWrap },
        React.createElement(
          View,
          { style: styles.totalsCard },
          React.createElement(
            View,
            { style: styles.totLine },
            React.createElement(Text, { style: styles.totLbl }, 'Междинна сума (без ДДС)'),
            React.createElement(Text, { style: styles.totVal }, fmtMoney(totals?.subtotal, ccy))
          ),
          React.createElement(
            View,
            { style: styles.totLine },
            React.createElement(Text, { style: styles.totLbl }, `ДДС (${offer?.vat_rate ?? 0}%)`),
            React.createElement(Text, { style: styles.totVal }, fmtMoney(totals?.vat, ccy))
          ),
          React.createElement(
            View,
            { style: [styles.totLine, { marginTop: 6 }] },
            React.createElement(Text, { style: styles.totStrong }, 'Общо (с ДДС)'),
            React.createElement(Text, { style: styles.totStrong }, fmtMoney(totals?.total, ccy))
          )
        )
      ),

      // Notes & dealer signature line
      notesBlock,

      React.createElement(Text, { style: styles.footer }, 'Документът е генериран автоматично.')
    )
  );
}


/* ───────────── Buffer helpers ───────────── */
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

  // Prefer env var (so you can override per environment), fallback to your static file
  const absLogoPath =
    path.join(__dirname, '../static/next-auto-logo.png');

  const logoUri = process.env.DEALER_LOGO_PATH || fileToDataUri(absLogoPath);

  const element = React.createElement(OfferDoc, { snap: snapshot, logoUri });
  return elementToBuffer(element);
}


module.exports = { renderOfferPdfBuffer };
