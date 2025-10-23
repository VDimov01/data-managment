// backend/services/offerPdfService.js
const React = require('react');
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
  Svg,
  G,
  Path,
} = require('@react-pdf/renderer');

function splitOfferNumber(s) {
  const parts = String(s || '').split('-'); // e.g. OF-2025-00023
  const [prefix, year, number] = parts;
  return { prefix: prefix || '', year: year || '', number: number || '' };
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

//Used for png/jpg logos

// function fileToDataUri(absPath) {
//   try {
//     const buf = fs.readFileSync(absPath);
//     const ext = (absPath.split('.').pop() || '').toLowerCase();
//     const mime =
//       ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
//       ext === 'svg' ? 'image/svg+xml' : 'image/png';
//     return `data:${mime};base64,${buf.toString('base64')}`;
//   } catch {
//     return null;
//   }
// }

// function hasFile(p) {
//   try { return !!(p && fs.existsSync(p)); } catch { return false; }
// }

//--------------------------------------------

function Logo({ cfg, width = 160, height = 48 }) {
  if (!cfg) return null;
  return (
    React.createElement(Svg, { width, height, viewBox: cfg.viewBox },
      React.createElement(G, { transform: cfg.groupTransform },
        ...(cfg.paths || []).map((p, i) =>
          React.createElement(Path, { key: i, d: p.d, fill: p.fill || cfg.fill || '#111' })
        )
      )
    )
  );
}


/* ───────────── Styles ───────────── */
const styles = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 36, paddingHorizontal: 28, fontFamily: 'DejaVu', fontSize: 11, color: '#111827' },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'stretch', marginBottom: 12 },
  logoBox: {
    width: 160, height: 48,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12
  },
  logoText: { fontSize: 10, color: '#6b7280' },

  hdrRight: { flexGrow: 1, padding: 10, borderWidth: 1, borderColor: '#e5e7eb', borderStyle: 'solid', borderRadius: 6 },

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

      // ── Header: SVG logo + meta
      React.createElement(View, { style: styles.header },
        React.createElement(View, { style: styles.logoBox },
          logoUri
            ? React.createElement(Logo, { cfg: logoUri, width: 160})
            : React.createElement(Text, { style: styles.logoText }, 'LOGO')
        ),
        React.createElement(View, { style: styles.hdrRight },
          React.createElement(View, { style: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' } },
            React.createElement(Text, { style: { fontSize: 16, fontWeight: 'bold' } }, `Оферта №${titleNumber}`),
            React.createElement(Text, { style: { color: '#6b7280', fontSize: 10 } }, ccy)
          ),
          React.createElement(Text, { style: { color: '#6b7280', fontSize: 10, marginTop:4 } }, [dateText, validText].filter(Boolean).join(' • '))
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

async function renderOfferPdfBuffer(snapshot) {
  ensureFonts();

  //Used for png/jpg logos
  // const absLogoPath =
  //   path.join(__dirname, '../static/next-auto-logo.png');

  // const logoUri = process.env.DEALER_LOGO_PATH || fileToDataUri(absLogoPath);

  const element = React.createElement(OfferDoc, { snap: snapshot, logoUri });
  return elementToBuffer(element);
}


module.exports = { renderOfferPdfBuffer };
