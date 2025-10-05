const React = require('react');
const crypto = require('crypto');
const { pdf, Document, Page, Text, View, StyleSheet, Font } = require('@react-pdf/renderer');
const { bucketPrivate, storage, BUCKET_PRIVATE } = require('./gcs');
const path = require('path');

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
  } catch (_) { /* fall back to core fonts */ }
  fontsReady = true;
}

const GROUP_ORDER = [
  '01 Basic information','02 Car body','03 Electric motor','04 ICE','05 Battery & Charging',
  '06 Transmission','07 Chassis & Steering','08 Wheels & Brakes','09 Active safety',
  '10 Passive safety','11 Car control & Driving assist','12 Exterior','13 Interior',
  '14 Intelligent connectivity','15 Seats','16 Comfort & Anti-theft systems',
  '17 Digital intertainment','18 Air conditioner & Refrigerator','19 Lights',
  '20 Glass & Mirrors','21 Intelligent systems','ADAS','Optional packages',
  'Customized options','Individual features','25 Full Vehicle Warranty',
];
const GROUP_BG_MAP = {
  '01 Basic information':'Основна информация','02 Car body':'Купе','03 Electric motor':'Електромотор','04 ICE':'ДВГ',
  '05 Battery & Charging':'Батерия и зареждане','06 Transmission':'Трансмисия','07 Chassis & Steering':'Ходова част и управление',
  '08 Wheels & Brakes':'Гуми и спирачки','09 Active safety':'Активна безопасност','10 Passive safety':'Пасивна безопасност',
  '11 Car control & Driving assist':'Управление и асистенти','12 Exterior':'Екстериор','13 Interior':'Интериор',
  '14 Intelligent connectivity':'Интелигентна свързаност','15 Seats':'Седалки','16 Comfort & Anti-theft systems':'Комфорт и противокражбени системи',
  '17 Digital intertainment':'Дигитално развлечение','18 Air conditioner & Refrigerator':'Климатик и хладилник',
  '19 Lights':'Осветление','20 Glass & Mirrors':'Стъкла и огледала','21 Intelligent systems':'Интелигентни системи',
  'ADAS':'ADAS','Optional packages':'Опционални пакети','Customized options':'Персонализация',
  'Individual features':'Индивидуални особености','25 Full Vehicle Warranty':'Пълна гаранция на автомобила',
};

function slug(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'n-a';
}

function stableStringify(obj) {
  const seen = new WeakSet();
  const order = (x) => {
    if (x && typeof x === 'object') {
      if (seen.has(x)) return null;
      seen.add(x);
      if (Array.isArray(x)) return x.map(order);
      return Object.keys(x).sort().reduce((acc, k) => { acc[k] = order(x[k]); return acc; }, {});
    }
    return x;
  };
  return JSON.stringify(order(obj));
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Load edition header (make/model/year/edition) for pathing & title */
async function loadEditionHeader(conn, edition_id) {
  const [[row]] = await conn.query(`
    SELECT e.edition_id, e.name AS edition_name,
           my.year,
           mo.name AS model_name,
           m.name  AS make_name
    FROM edition e
    JOIN model_year my ON my.model_year_id = e.model_year_id
    JOIN model mo ON mo.model_id = my.model_id
    JOIN make  m  ON m.make_id  = mo.make_id
    WHERE e.edition_id = ?`, [edition_id]);
  if (!row) throw new Error('edition not found');
  return row;
}

/** Merge effective EAV + JSON (BG) -> rows grouped + ordered */
async function buildEditionSnapshot(conn, edition_id, lang='bg') {
  // defs
  const [defs] = await conn.query(`
    SELECT attribute_id, code, name, name_bg, unit, data_type, category, display_group, display_order
    FROM attribute
  `);
  const defByCode = new Map(defs.map(d => [d.code, d]));

  // effective EAV (like your compare route)
  const [eff] = await conn.query(`
    SELECT
      v.edition_id,
      a.attribute_id, a.code, a.name, a.name_bg, a.unit, a.data_type, a.category, a.display_group,
      v.value_numeric, v.value_text, v.value_boolean, v.value_enum_id,
      aev.code AS enum_code,
      CASE WHEN v.value_enum_id IS NULL THEN NULL
           WHEN ?='en' THEN aev.label_en ELSE aev.label_bg END AS enum_label
    FROM v_effective_edition_attributes v
    JOIN attribute a ON a.attribute_id = v.attribute_id
    LEFT JOIN attribute_enum_value aev ON aev.enum_id = v.value_enum_id
    WHERE v.edition_id = ?`, [lang, edition_id]);

  // sidecar
  const [[specsRow]] = await conn.query(
    `SELECT specs_json, specs_i18n FROM edition_specs WHERE edition_id = ?`,
    [edition_id]
  );
  const parseMaybe = x => {
    if (!x) return null;
    if (typeof x === 'object') return x;
    try { return JSON.parse(x); } catch { return null; }
  };
  const sj  = parseMaybe(specsRow?.specs_json)  || { attributes: {} };
  const sji = parseMaybe(specsRow?.specs_i18n)  || {};
  const i18 = (sji && sji[lang] && sji[lang].attributes) ? sji[lang].attributes : {};

  // Build code->value with correct typing (keep zeros)
  const rowsByCode = new Map();

  function upsert(code, meta, dt, rawVal, unitFromVal) {
    if (!code) return;
    let val = null;
    if (dt === 'text') {
      const s = (rawVal ?? '').toString();
      val = s.trim() === '' ? null : s;
    } else if (dt === 'boolean') {
      if (rawVal !== null && rawVal !== undefined) val = !!rawVal;
    } else if (dt === 'int') {
      const n = rawVal != null ? Number(rawVal) : null;
      if (Number.isFinite(n)) val = Math.trunc(n);
    } else if (dt === 'decimal') {
      const x = rawVal != null ? Number(rawVal) : null;
      if (Number.isFinite(x)) val = x;
    } else if (dt === 'enum') {
      const s = (rawVal ?? '').toString().trim();
      val = s || null;
    }
    if (val === null) return;
    if (!rowsByCode.has(code)) {
      rowsByCode.set(code, {
        code,
        name: meta?.name || code,
        name_bg: meta?.name_bg || meta?.name || code,
        unit: meta?.unit ?? unitFromVal ?? null,
        data_type: meta?.data_type || dt || 'text',
        category: meta?.category || 'Other',
        display_group: meta?.display_group || meta?.category || '01 Basic information',
        display_order: meta?.display_order || 9999,
        value: val
      });
    } else {
      // prefer EAV; don't override existing value
      const r = rowsByCode.get(code);
      if (r.unit == null && (meta?.unit || unitFromVal)) r.unit = meta?.unit ?? unitFromVal ?? null;
    }
  }

  for (const r of eff) {
    const meta = defByCode.get(r.code) || r;
    if (r.data_type === 'int' || r.data_type === 'decimal') {
      upsert(r.code, meta, r.data_type, r.value_numeric, r.unit);
    } else if (r.data_type === 'boolean') {
      upsert(r.code, meta, 'boolean', r.value_boolean, r.unit);
    } else if (r.data_type === 'enum') {
      const display = r.enum_label ?? r.enum_code ?? null;
      upsert(r.code, meta, 'enum', display, r.unit);
    } else {
      upsert(r.code, meta, 'text', r.value_text, r.unit);
    }
  }

  for (const [code, obj] of Object.entries(sj.attributes || {})) {
    const meta = defByCode.get(code);
    const dt   = (obj && obj.dt) || meta?.data_type || 'text';
    const unit = (obj && obj.u)  || meta?.unit || null;
    if (dt === 'text') {
      const t = i18[code] ?? (obj ? obj.v : null);
      upsert(code, meta, 'text', t, unit);
    } else if (dt === 'boolean') {
      const b = obj ? (obj.v === true || obj.v === 1 || obj.v === '1') : null;
      upsert(code, meta, 'boolean', b, unit);
    } else if (dt === 'int') {
      upsert(code, meta, 'int', obj ? obj.v : null, unit);
    } else if (dt === 'decimal') {
      upsert(code, meta, 'decimal', obj ? obj.v : null, unit);
    } else if (dt === 'enum') {
      upsert(code, meta, 'enum', obj ? obj.v : null, unit);
    } else {
      upsert(code, meta, 'text', obj ? obj.v : null, unit);
    }
  }

  // group + order
  const all = Array.from(rowsByCode.values());
  const groupMap = new Map();
  for (const r of all) {
    const g = r.display_group || r.category || '01 Basic information';
    if (!groupMap.has(g)) groupMap.set(g, []);
    groupMap.get(g).push(r);
  }

  const orderedGroups = [];
  const rem = new Map(groupMap);
  for (const k of GROUP_ORDER) {
    if (rem.has(k)) {
      orderedGroups.push([k, rem.get(k)]);
      rem.delete(k);
    }
  }
  // append leftovers
  for (const [k, v] of rem.entries()) orderedGroups.push([k, v]);

    return orderedGroups.map(([g, items]) => ({
    key: g,
    title_bg: GROUP_BG_MAP[g] || g,
    items: items
      .sort((a, b) => {
        const ao = Number.isFinite(Number(a.display_order)) ? Number(a.display_order) : 1e9;
        const bo = Number.isFinite(Number(b.display_order)) ? Number(b.display_order) : 1e9;
        if (ao !== bo) return ao - bo;
        return (a.name_bg || a.name || '').localeCompare(b.name_bg || b.name || '', 'bg');
      })
      .map(x => ({
         code: x.code,
         name_bg: x.name_bg || x.name,
         unit: x.unit,
         data_type: x.data_type,
         value: x.value
       }))
  }));

}

function normalizeGroups(attrs) {
  if (!Array.isArray(attrs)) return [];
  // Already grouped?
  if (attrs.length && Array.isArray(attrs[0]?.items)) {
    // If it already has a section, keep it.
    if ('section' in attrs[0]) return attrs;
    // If it uses {title_bg} / {key}, map to {section}
    return attrs.map(g => ({
      section: g.section || g.title_bg || g.key || 'Общи',
      items: g.items || []
    }));
  }
  // Flat -> group by display_group/category
  const map = new Map();
  for (const r of attrs) {
    const g = r.display_group || r.category || 'Общи';
    if (!map.has(g)) map.set(g, []);
    map.get(g).push(r);
  }
  return Array.from(map.entries()).map(([section, items]) => ({ section, items }));
}


function formatVal(v, dt, unit) {
  const val = v ?? (typeof v === 'number' ? v : null);
  if (val == null || val === '') return '—';
  if (dt === 'boolean') return (val === true || val === 1 || val === '1') ? 'Да' : 'Не';
  if (dt === 'int' || dt === 'decimal') return unit ? `${val} ${unit}` : String(val);
  return String(val);
}


/** Simple PDF: Title + section tables */
function SpecsDoc({ title, groups }) {
  const styles = StyleSheet.create({
    page: { padding: 40, fontSize: 10, fontFamily: 'DejaVu' },
    h1: { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
    h2: { fontSize: 12, fontWeight: 'bold', marginTop: 10, marginBottom: 6 },
    row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ccc', paddingVertical: 4 },
    cellL: { width: '55%' },
    cellR: { width: '45%', textAlign: 'right' },
    meta: { fontSize: 9, color: '#555' },
  });

  console.log('SpecsDoc render', title, groups && groups.length);

  return React.createElement(
    Document, null,
    React.createElement(
      Page, { size: 'A4', style: styles.page },
      React.createElement(Text, { style: styles.h1 }, title || 'Технически характеристики'),
      (groups && groups.length ? groups : [{ section: 'Няма данни', items: [] }]).map((g, i) =>
        React.createElement(React.Fragment, { key: `${g.section}-${i}` },
          React.createElement(Text, { style: styles.h2 }, g.section || g.title_bg || g.key || 'Общи'),
          ...(g.items && g.items.length
            ? g.items.map((r, idx) =>
                React.createElement(View, { key: `${r.code || r.name || 'row'}-${idx}`, style: styles.row },
                  React.createElement(Text, { style: styles.cellL }, r.name_bg || r.name || r.code || ''),
                  React.createElement(Text, { style: styles.cellR }, formatVal(r.value ?? r.v ?? r.val, r.data_type, r.unit))
                )
              )
            : [React.createElement(Text, { key: 'empty', style: styles.meta }, '—')])
        )
      )
    )
  );
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

async function renderEditionSpecsPdfBuffer({ header, attributes, lang = 'bg' }) {
  ensureFonts();

  const groups = normalizeGroups(attributes || []);
  const title =
    header
      ? `${header.make_name || header.make || ''} ${header.model_name || header.model || ''} ${header.year ? '(' + header.year + ')' : ''} — ${header.edition_name || header.edition || ''}`.trim()
      : 'Технически характеристики';

  const element = React.createElement(SpecsDoc, { title, groups });

  let buffer;
  try {
    buffer = await elementToBuffer(element);
  } catch (e) {
    throw new Error(`renderEditionSpecsPdfBuffer: toBuffer failed: ${e.message}`);
  }

  if (!buffer || typeof buffer.length !== 'number' || buffer.length === 0) {
    // Fallback single-page doc to avoid hard failure
    const fallback = React.createElement(
      Document, null,
      React.createElement(Page, { size: 'A4', style: { padding: 40 } },
        React.createElement(Text, null, 'Specification document is empty.'))
    );
    buffer = await pdf(fallback).toBuffer();
  }

  if (!buffer || buffer.length === 0) {
    throw new Error('renderEditionSpecsPdfBuffer: empty buffer');
  }
  return buffer;
}

async function uploadBufferToGcs({ gcsKey, buffer, metadata = {} }) {
  const file = bucketPrivate.file(gcsKey);
  await file.save(buffer, {
    resumable: false,
    metadata: {
      contentType: 'application/pdf',
      metadata
    }
  });
  const sha = sha256Hex(buffer);
  return { sha256: sha, size: buffer.length };
}

function cleanSegKeepSpaces(s) {
  // Keep letters, numbers, spaces, hyphens; collapse spaces; strip slashes
  return String(s || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\/\\]+/g, '-')       // no slashes in segments
    .replace(/\s+/g, ' ')           // collapse spaces
    .trim()
    .replace(/[^\w \-]/g, '')       // remove weird punctuation; keep space & hyphen
    .replace(/_/g, '-');            // underscores → hyphen
}

/** Main ensure function: returns row for this snapshot (reuses or creates new) */
async function ensureEditionSpecsPdf(conn, { edition_id, lang='bg', created_by_user_id=1 }) {
  const header = await loadEditionHeader(conn, edition_id);
  const groups = await buildEditionSnapshot(conn, edition_id, lang);

  const snapshotObj = { header: {
      edition_id: header.edition_id, make_name: header.make_name, model_name: header.model_name, year: header.year, edition_name: header.edition_name
    }, groups };
  const snapJson = stableStringify(snapshotObj);
  const snapshot_sha256 = sha256Hex(Buffer.from(snapJson));

  // reuse?
  const [[existing]] = await conn.query(`
    SELECT * FROM edition_specs_pdf
     WHERE edition_id = ? AND lang = ? AND snapshot_sha256 = ?
     LIMIT 1`, [edition_id, lang, snapshot_sha256]);

  if (existing) {
    return { reused: true, row: existing, header, groups };
  }

  // new version
  const [[ver]] = await conn.query(
    `SELECT COALESCE(MAX(version),0)+1 AS next_ver
       FROM edition_specs_pdf WHERE edition_id = ? AND lang = ?`,
    [edition_id, lang]
  );
  const version = ver.next_ver;

  // render + upload
  const buffer = await renderEditionSpecsPdfBuffer({ header, attributes: groups });

  const segMake   = cleanSegKeepSpaces(header.make_name).toLowerCase();
  const segModelYr = `${cleanSegKeepSpaces(header.model_name)} ${String(header.year).replace(/[^\d]/g,'')}`;
  const segEdition = cleanSegKeepSpaces(header.edition_name);
  const shortHash  = snapshot_sha256.slice(0, 8);
  const filename   = `specs-v${String(version).padStart(3,'0')}-${shortHash}.pdf`;
  const gcsKey     = `vehicles/${segMake}/${segModelYr}/${segEdition}/pdfs/${filename}`;

  const { sha256, size } = await uploadBufferToGcs({
    gcsKey,
    buffer,
    metadata: { edition_id: String(edition_id), lang, version: String(version) }
  });

  const [ins] = await conn.query(`
    INSERT INTO edition_specs_pdf
      (edition_id, lang, version, snapshot_sha256,
       gcs_key, filename, content_type, byte_size, sha256,
       created_at, created_by_user_id)
    VALUES
      (?, ?, ?, ?, ?, ?, 'application/pdf', ?, ?, NOW(), ?)`,
    [edition_id, lang, version, snapshot_sha256, gcsKey, filename, size, sha256, created_by_user_id]
  );

  const [[row]] = await conn.query(`SELECT * FROM edition_specs_pdf WHERE edition_specs_pdf_id = ?`, [ins.insertId]);
  return { reused: false, row, header, groups };
}

async function getSignedUrl(gcsKey, minutes=10) {
  const expires = Date.now() + minutes*60*1000;
  const [signedUrl] = await storage.bucket(BUCKET_PRIVATE).file(gcsKey).getSignedUrl({
    action: 'read',
    expires
  });
  return { signedUrl, expiresAt: new Date(expires).toISOString() };
}

module.exports = {
  ensureEditionSpecsPdf,
  getSignedUrl,
  renderEditionSpecsPdfBuffer,
};
