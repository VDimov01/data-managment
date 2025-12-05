// backend/services/invoicePDF.js
const React = require("react");
const { pdf } = require("@react-pdf/renderer");
const crypto = require("crypto");

const { bucketPrivate, storage, BUCKET_PRIVATE } = require("./gcs");

// Safe default-export grabber (works with CJS/ESM)
function requireDefault(m) {
  return m && m.__esModule ? m.default : m;
}

// === IMPORT TEMPLATES ===

const InvoicePDF = requireDefault(require("../pdfTemplates/InvoicePDF"));
const ProformaInvoicePDF = requireDefault(require("../pdfTemplates/ProformaInvoicePDF"));

// ---------- helpers (копие на логиката от contractPDF.js) ----------

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function elementToBuffer(element) {
  const inst = pdf(element);

  if (typeof inst.toBuffer === "function") {
    const out = await inst.toBuffer();

    // pdfkit stream (react-pdf v3 style)
    if (out && typeof out.on === "function") {
      return await streamToBuffer(out);
    }

    if (Buffer.isBuffer(out)) return out;
    if (out instanceof Uint8Array) return Buffer.from(out);
  }

  if (typeof inst.toStream === "function") {
    const s = await inst.toStream();
    return await streamToBuffer(s);
  }

  if (typeof inst.toString === "function") {
    const str = await inst.toString();
    return Buffer.from(str, "binary");
  }

  throw new Error("react-pdf: cannot obtain bytes from renderer");
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

function buildInvoiceTemplateProps({ invoice, buyer, contract, items, user }) {
  return {
    invoice: invoice || {},
    buyer: buyer || {},
    contract: contract || null,
    items: Array.isArray(items) ? items : [],
    user: user || {},
    logo: logoUri,
  };
}


/**
 * Рендер на PDF в Buffer.
 *
 * @param {Object} params
 * @param {'INVOICE'|'PROFORMA'} params.template  - коя бланка да ползва
 * @param {Object} params.invoice                 - ред от invoice
 * @param {Object} params.buyer                   - buyer_snapshot_json (парснат)
 * @param {Object} [params.contract]              - ред от contract (по желание)
 * @param {Array}  [params.items]                 - редове за фактурата
 */
async function renderInvoicePdfBuffer({ template = "INVOICE", invoice, buyer, contract, items, user }) {
  const mode = String(template || "").toUpperCase();
  const Doc = mode === "PROFORMA" ? ProformaInvoicePDF : InvoicePDF;

  if (typeof Doc !== "function") {
    throw new Error("renderInvoicePdfBuffer: PDF template component is not a function");
  }

  const props = buildInvoiceTemplateProps({ invoice, buyer, contract, items, user });
  const element = React.createElement(Doc, props);
  const buf = await elementToBuffer(element);
  if (!Buffer.isBuffer(buf)) {
    throw new Error("renderInvoicePdfBuffer: expected Buffer from renderer");
  }
  return buf;
}

/**
 * Качване на PDF в GCS + SHA256.
 *
 * @param {Object} params
 * @param {number} params.invoice_id
 * @param {string} params.invoice_number
 * @param {number} params.version
 * @param {Buffer|Uint8Array} params.buffer
 */
async function uploadInvoicePdfBuffer({ invoice_id, invoice_number, version, buffer }) {
  const bytes = Buffer.isBuffer(buffer)
    ? buffer
    : buffer instanceof Uint8Array
    ? Buffer.from(buffer)
    : null;

  if (!bytes) throw new Error("uploadInvoicePdfBuffer: expected Buffer / Uint8Array");

  const safeId = String(invoice_id || "").padStart(6, "0");
  const verStr = String(version || 1).padStart(3, "0");

  const gcsKey = `invoices/${safeId}/v${verStr}.pdf`;
  const file = bucketPrivate.file(gcsKey);

  await file.save(bytes, {
    resumable: false,
    metadata: {
      contentType: "application/pdf",
      metadata: {
        invoice_id: String(invoice_id || ""),
        invoice_number: String(invoice_number || ""),
        version: String(version || 1),
      },
    },
  });

  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  return { gcsKey, size: bytes.length, sha256 };
}

async function getSignedInvoiceReadUrl(gcsKey, { minutes = 10 } = {}) {
  const expires = Date.now() + minutes * 60 * 1000;
  const [signedUrl] = await storage
    .bucket(BUCKET_PRIVATE)
    .file(gcsKey)
    .getSignedUrl({
      action: "read",
      expires,
    });

  return { signedUrl, expiresAt: new Date(expires).toISOString() };
}

module.exports = {
  renderInvoicePdfBuffer,
  uploadInvoicePdfBuffer,
  getSignedInvoiceReadUrl,
};
