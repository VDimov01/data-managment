// backend/pdfs/InvoicePDF.js
const { amountToBGWords } = require("../utils/bulgarianAmount");

const React = require("react");
const {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
  Font,
  Svg,
  Path,
  G,
} = require("@react-pdf/renderer");

const path = require("path");

// Шрифт DejaVu – същия както при договорите
Font.register({
  family: "DejaVu",
  fonts: [
    {
      src: path.join(__dirname, "../fonts/DejaVuSans.ttf"),
      fontWeight: "normal",
    },
    {
      src: path.join(__dirname, "../fonts/DejaVuSans-Bold.ttf"),
      fontWeight: "bold",
    },
  ],
});

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 40,
    fontFamily: "DejaVu",
    fontSize: 10,
    lineHeight: 1.5,
  },
  // Лого
  logoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  logoBox: {
    width: 120,
    height: 40,
  },
  logoSvg: {
    width: "100%",
    height: "100%",
  },

  title: {
    fontSize: 16,
    textAlign: "center",
    fontWeight: "bold",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 12,
    textAlign: "center",
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  box: {
    borderWidth: 1,
    borderColor: "#000",
    padding: 6,
    width: "48%",
  },
  boxTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 4,
  },
  textBold: {
    fontWeight: "bold",
  },
  small: {
    fontSize: 9,
  },
  row: {
    flexDirection: "row",
    marginBottom: 2,
  },
  label: {
    width: 70,
    fontWeight: "bold",
  },
  value: {
    flex: 1,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 8,
  },
  metaItem: {
    fontSize: 10,
  },

  table: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#000",
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#f0f0f0",
    borderBottomWidth: 1,
    borderColor: "#000",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#ddd",
  },
  cell: {
    paddingVertical: 4,
    paddingHorizontal: 3,
    fontSize: 9,
  },
  cellRight: {
    paddingVertical: 4,
    paddingHorizontal: 3,
    fontSize: 9,
    textAlign: "right",
  },
  colNo: { width: "7%" },
  colDesc: { width: "43%" },
  colQty: { width: "10%" },
  colUnit: { width: "15%" },
  colTax: { width: "10%" },
  colTotal: { width: "15%" },

  summaryBox: {
    marginTop: 10,
    alignSelf: "flex-end",
    width: "55%",
    borderWidth: 1,
    borderColor: "#000",
    padding: 6,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  summaryLabel: {
    fontSize: 9,
  },
  summaryValue: {
    fontSize: 9,
    fontWeight: "bold",
  },
  totalWords: {
    marginTop: 8,
    fontSize: 10,
  },
  footer: {
    marginTop: 30,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signBlock: {
    width: "45%",
  },
  signLabel: {
    fontSize: 10,
    marginBottom: 25,
  },
});

// helper-и
function formatBGDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("bg-BG");
}

function formatMoney(num) {
  const n = Number(num || 0);
  return n.toLocaleString("bg-BG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Очаквани props:
 *   - invoice: {
 *       invoice_number, issued_at|created_at, due_at?,
 *       currency_code, subtotal, tax_total, total, type, note?
 *     }
 *   - buyer: buyer_snapshot_json парснат (customer_type, display_name, ... )
 *   - contract?: { contract_number, created_at? }
 *   - items: [{ description, quantity, unit_price, total, tax_rate?, tax_amount? }]
 */
function InvoicePDF({ invoice, buyer, contract = null, items = [], user, logo }) {
  const svgLogo = logo || logoUri;

  const currency = (invoice && invoice.currency_code) || "BGN";
  const currencyLabel = currency === "EUR" ? "EUR" : "лв.";
  const issueDate =
    formatBGDate(invoice && (invoice.issued_at || invoice.created_at)) ||
    formatBGDate(new Date());

  const dueDate = formatBGDate(invoice && invoice.due_at);
  const totalNum = Number(invoice && invoice.total ? invoice.total : 0);
  const totalWords = amountToBGWords(totalNum);

  const subtotal =
    invoice && invoice.subtotal != null
      ? Number(invoice.subtotal)
      : items.reduce((s, it) => s + Number(it.total || 0), 0);

  const taxTotal =
    invoice && invoice.tax_total != null
      ? Number(invoice.tax_total)
      : items.reduce((s, it) => s + Number(it.tax_amount || 0), 0);

  const grandTotal = totalNum || subtotal + taxTotal;

  const isCompany = buyer && buyer.customer_type === "Company";

  const [seq, contractNumber] = contract
    ? String(contract.contract_number).split("-")
    : ["—", "—"];

  const [invSeq, invNumber] = invoice
    ? String(invoice.invoice_number).split("-")
    : ["—", "—"];

  // ако искаш да вадиш името от user:
//   const authorName =
//     (user &&
//       (user.name ||
//         `${user.first_name || ""} ${user.last_name || ""}`.trim())) ||
//     "Пламен Генчев";

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },

      // ЛОГО ГОРЕ ВЛЯВО
      svgLogo &&
        React.createElement(
          View,
          { style: styles.logoRow },
          React.createElement(
            View,
            { style: styles.logoBox },
            React.createElement(
              Svg,
              { viewBox: svgLogo.viewBox, style: styles.logoSvg },
              React.createElement(
                G,
                { transform: svgLogo.groupTransform },
                svgLogo.paths.map((p, idx) =>
                  React.createElement(Path, {
                    key: idx,
                    d: p.d,
                    fill: svgLogo.fill || "#000000",
                  })
                )
              )
            )
          )
        ),

      // Заглавие
      React.createElement(Text, { style: styles.title }, "ФАКТУРА"),
      React.createElement(
        Text,
        { style: styles.subtitle },
        `№ ${invNumber}`
      ),

      // Метаданни – дата, основание
      React.createElement(
        View,
        { style: styles.metaRow },
        React.createElement(
          Text,
          { style: styles.metaItem },
          "Дата на издаване: ",
          React.createElement(
            Text,
            { style: styles.textBold },
            issueDate || "—"
          )
        ),
        dueDate &&
          React.createElement(
            Text,
            { style: styles.metaItem },
            "Срок на плащане: ",
            React.createElement(Text, { style: styles.textBold }, dueDate)
          )
      ),

      contract &&
        React.createElement(
          View,
          { style: { marginBottom: 4 } },
          React.createElement(
            Text,
            null,
            "Основание: Договор за покупко-продажба на МПС № ",
            React.createElement(
              Text,
              { style: styles.textBold },
              contractNumber || "—"
            )
          )
        ),

      invoice && invoice.note
        ? React.createElement(
            View,
            { style: { marginBottom: 4 } },
            React.createElement(
              Text,
              null,
              "Забележка: ",
              React.createElement(Text, { style: styles.textBold }, invoice.note)
            )
          )
        : null,

      // Доставчик / Клиент
      React.createElement(
        View,
        { style: styles.headerRow },
        // Доставчик
        React.createElement(
          View,
          { style: styles.box },
          React.createElement(Text, { style: styles.boxTitle }, "Доставчик"),
          React.createElement(
            Text,
            { style: styles.small },
            "„Некст Авто“ ЕООД"
          ),
          React.createElement(
            Text,
            { style: styles.small },
            "ЕИК: 208224080"
          ),
          React.createElement(
            Text,
            { style: styles.small },
            "Рег. адрес: гр. Стара Загора, бул. „Темида“ 1"
          ),
          React.createElement(
            Text,
            { style: styles.small },
            "ДДС №: BG208224080"
          ),
          React.createElement(
            Text,
            { style: styles.small },
            "Тел.: 0996600600, e-mail: sales@solaris.expert"
          ),
          React.createElement(
            Text,
            { style: [styles.small, { marginTop: 4 }] },
            "Банка: Първа инвестиционна банка АД"
          ),
          React.createElement(
            Text,
            { style: styles.small },
            "IBAN: BG66FINV91501017882794"
          ),
          React.createElement(Text, { style: styles.small }, "BIC: FINVBGSF")
        ),

        // Клиент
        React.createElement(
          View,
          { style: styles.box },
          React.createElement(Text, { style: styles.boxTitle }, "Клиент"),
          isCompany
            ? React.createElement(
                React.Fragment,
                null,
                React.createElement(
                  Text,
                  { style: styles.small },
                  (buyer && buyer.display_name) || "—"
                ),
                React.createElement(
                  Text,
                  { style: styles.small },
                  "ЕИК: ",
                  buyer && buyer.vat_number ? buyer.vat_number : "—"
                )
              )
            : React.createElement(
                Text,
                { style: styles.small },
                buyer && buyer.display_name ? buyer.display_name : "—"
              ),
          React.createElement(
            Text,
            { style: styles.small },
            "Адрес: ",
            buyer && buyer.city ? buyer.city : "",
            buyer && buyer.address_line ? `, ${buyer.address_line}` : ""
          ),
          React.createElement(
            Text,
            { style: styles.small },
            "Тел.: ",
            buyer && buyer.phone ? buyer.phone : "—"
          ),
          React.createElement(
            Text,
            { style: styles.small },
            "E-mail: ",
            buyer && buyer.email ? buyer.email : "—"
          ),
          !isCompany &&
            buyer &&
            buyer.national_id &&
            React.createElement(
              Text,
              { style: styles.small },
              "ЕГН: ",
              buyer.national_id
            )
        )
      ),

      // Таблица с редове
      React.createElement(
        View,
        { style: styles.table },

        // Header
        React.createElement(
          View,
          { style: styles.tableHeaderRow },
          React.createElement(
            Text,
            { style: [styles.cell, styles.colNo] },
            "№"
          ),
          React.createElement(
            Text,
            { style: [styles.cell, styles.colDesc] },
            "Описание"
          ),
          React.createElement(
            Text,
            { style: [styles.cellRight, styles.colQty] },
            "К-во"
          ),
          React.createElement(
            Text,
            { style: [styles.cellRight, styles.colUnit] },
            `Ед. цена без ДДС (${currencyLabel})`
          ),
          React.createElement(
            Text,
            { style: [styles.cellRight, styles.colTax] },
            "ДДС %"
          ),
          React.createElement(
            Text,
            { style: [styles.cellRight, styles.colTax] },
            `ДДС (${currencyLabel})`
          ),
          React.createElement(
            Text,
            { style: [styles.cellRight, styles.colTotal] },
            `Сума с ДДС (${currencyLabel})`
          )
        ),

        // Rows
        items.map((it, idx) =>
          React.createElement(
            View,
            { key: idx, style: styles.tableRow },
            React.createElement(
              Text,
              { style: [styles.cell, styles.colNo] },
              String(idx + 1)
            ),
            React.createElement(
              Text,
              { style: [styles.cell, styles.colDesc] },
              it.description || it.title || ""
            ),
            React.createElement(
              Text,
              { style: [styles.cellRight, styles.colQty] },
              it.quantity != null ? String(it.quantity) : "1"
            ),
            React.createElement(
              Text,
              { style: [styles.cellRight, styles.colUnit] },
              formatMoney(it.unit_price - (it.unit_price / 100 * (it.tax_rate || 0)))
            ),
            React.createElement(
              Text,
              { style: [styles.cellRight, styles.colTax] },
              it.tax_rate != null ? String(it.tax_rate) : ""
            ),
            React.createElement(
              Text,
              { style: [styles.cellRight, styles.colUnit] },
              formatMoney((it.unit_price || 0) / 100 * (it.tax_rate || 0))
            ),
            React.createElement(
              Text,
              { style: [styles.cellRight, styles.colTotal] },
              formatMoney(it.line_total)
            )
          )
        )
      ),

      // Обобщение
      React.createElement(
        View,
        { style: styles.summaryBox },
        React.createElement(
          View,
          { style: styles.summaryRow },
          React.createElement(
            Text,
            { style: styles.summaryLabel },
            "Общо (без ДДС):"
          ),
          React.createElement(
            Text,
            { style: styles.summaryValue },
            `${formatMoney(subtotal)} ${currencyLabel}`
          )
        ),
        React.createElement(
          View,
          { style: styles.summaryRow },
          React.createElement(Text, { style: styles.summaryLabel }, "ДДС:"),
          React.createElement(
            Text,
            { style: styles.summaryValue },
            `${formatMoney(taxTotal)} ${currencyLabel}`
          )
        ),
        React.createElement(
          View,
          { style: styles.summaryRow },
          React.createElement(
            Text,
            { style: [styles.summaryLabel, styles.textBold] },
            "Общо за плащане:"
          ),
          React.createElement(
            Text,
            { style: [styles.summaryValue, styles.textBold] },
            `${formatMoney(grandTotal)} ${currencyLabel}`
          )
        )
      ),

      React.createElement(
        Text,
        { style: styles.totalWords },
        "С думи: ",
        React.createElement(Text, { style: styles.textBold }, totalWords)
      ),

      // Подписи
      React.createElement(
        View,
        { style: styles.footer },
        React.createElement(
          View,
          { style: styles.signBlock },
          React.createElement(
            Text,
            { style: styles.signLabel },
            "Издал фактурата:"
          ),
          React.createElement(
            View,
            null,
            React.createElement(
              Text,
              null,
              "................................................."
            ),
            React.createElement(
              Text,
              { style: { textAlign: "center", marginTop: 2 } },
              `/ Пламен Генчев / `
            //   ${user.first_name} ${user.last_name}
            )
          )
        ),
        React.createElement(
          View,
          { style: styles.signBlock },
          React.createElement(Text, { style: styles.signLabel }, "Получател:"),
          React.createElement(
            Text,
            null,
            "................................................."
          )
        )
      )
    )
  );
}

module.exports = InvoicePDF;
