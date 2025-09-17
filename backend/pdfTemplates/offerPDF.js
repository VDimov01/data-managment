const React = require("react");
const { Page, Text, View, Document, StyleSheet, Font } = require("@react-pdf/renderer");
const path = require("path");

// Register a Cyrillic font (e.g., DejaVu Sans)
Font.register({
  family: "DejaVu",
  src: path.join(__dirname, "../fonts/DejaVuSans.ttf"),
});

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "DejaVu" },
  header: { fontSize: 18, textAlign: "center", marginBottom: 10 },
  companyInfo: { marginBottom: 20 },
  clientInfo: { marginBottom: 20 },
  table: {
    display: "table",
    width: "auto",
    borderWidth: 1,
    borderStyle: "solid",
    borderRightWidth: 0,
    borderBottomWidth: 0,
    marginBottom: 20,
  },
  tableRow: { flexDirection: "row" },
  tableColHeader: {
    width: "16.6%",
    borderStyle: "solid",
    borderWidth: 1,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    backgroundColor: "#eee",
    padding: 3,
    fontSize: 9,
  },
  tableCol: {
    width: "16.6%",
    borderStyle: "solid",
    borderWidth: 1,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    padding: 3,
    fontSize: 9,
  },
  priceText: { fontSize: 9 },
  euroText: { fontSize: 8, color: "#555" },
  totals: { marginTop: 20, fontSize: 10 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  footer: { marginTop: 40, fontSize: 9, textAlign: "left" },
});

function OfferPDF({ type, buyer, admin_firstname, admin_lastname, cars }) {
  const EUR_RATE = 1.95583; // BGN to EUR fixed rate

  // Price calculations
  const subtotal = cars.reduce((sum, c) => sum + (c.price || 0), 0);
  const vat = subtotal * 0.2;
  const total = subtotal + vat;
  
  // show only year and month of production date
  const formatProductionDate = (date) => {
    if (!date) return "-";
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const formatPrice = (price) => ({
    bgn: `${price.toFixed(2)} лв`,
    eur: `(${(price / EUR_RATE).toFixed(2)} €)`,
  });

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },

      // Header
      React.createElement(Text, { style: styles.header }, "Оферта за автомобили"),

      // Company Info
      React.createElement(
        View,
        { style: styles.companyInfo },
        React.createElement(Text, null, "ЕКС ПРО СОФТУЕР ЕООД"),
        React.createElement(Text, null, "ЕИК: 206582762, София, Симеоновско шосе №97К"),
        React.createElement(Text, null, "Тел: 0996600600, Email: sales@solaris.expert")
      ),

      // Client Info
      React.createElement(
        View,
        { style: styles.clientInfo },
        React.createElement(Text, null, `До: ${type === "client" ? buyer.first_name + " " + buyer.last_name : buyer.name}`),
        React.createElement(Text, null, `Email: ${buyer.email}`),
      ),

      // Table Header
      React.createElement(
        View,
        { style: styles.table },
        React.createElement(
          View,
          { style: styles.tableRow },
          ["№", "Марка", "Модел", "Характеристики", "Цена (лв/€)", "ДДС 20%"].map((header, i) =>
            React.createElement(Text, { style: styles.tableColHeader, key: i }, header)
          )
        ),

        // Table Rows
        ...cars.map((car, index) => {
          const price = car.car_price_bgn || 0;
          const vatPrice = price * 0.2;

          return React.createElement(
            View,
            { style: styles.tableRow, key: car.id },
            React.createElement(Text, { style: styles.tableCol }, `${index + 1}`),
            React.createElement(Text, { style: styles.tableCol }, car.maker + " " + car.edition),
            React.createElement(Text, { style: styles.tableCol }, car.model),
            React.createElement(
              Text,
              { style: styles.tableCol },
              `${car.color || ""}, ${formatProductionDate(car.production_date) || ""}, ${car.engine || ""}, ${car.power_hp || ""}, ${car.transmission || ""}, ${car.category || ""}`
            ),
            React.createElement(
              View,
              { style: styles.tableCol },
              React.createElement(Text, { style: styles.priceText }, car.car_price_bgn),
              React.createElement(Text, { style: styles.euroText }, car.car_price_eur)
            ),
            React.createElement(
              View,
              { style: styles.tableCol },
              React.createElement(Text, { style: styles.priceText }, formatPrice(vatPrice).bgn),
              React.createElement(Text, { style: styles.euroText }, formatPrice(vatPrice).eur)
            )
          );
        })
      ),

      // Totals
      React.createElement(
        View,
        { style: styles.totals },
        React.createElement(
          View,
          { style: styles.totalRow },
          React.createElement(Text, null, "Данъчна основа 20%:"),
          React.createElement(Text, null, `${formatPrice(subtotal).bgn} ${formatPrice(subtotal).eur}`)
        ),
        React.createElement(
          View,
          { style: styles.totalRow },
          React.createElement(Text, null, "Начислено ДДС:"),
          React.createElement(Text, null, `${formatPrice(vat).bgn} ${formatPrice(vat).eur}`)
        ),
        React.createElement(
          View,
          { style: styles.totalRow },
          React.createElement(Text, null, "Сума за плащане:"),
          React.createElement(Text, null, `${formatPrice(total).bgn} ${formatPrice(total).eur}`)
        )
      ),

      // Footer
      React.createElement(
        View,
        { style: styles.footer },
        React.createElement(Text, null, "Начин на плащане: Банков път"),
        React.createElement(Text, null, "BIC: BPBIBGSF, IBAN: BG41BPBI79421200068798"),
        React.createElement(Text, null, `Изготвил: ${admin_firstname} ${admin_lastname}`),
        React.createElement(View, { style: { height: 30 } }),
        React.createElement(Text, null, "____________________ (Подпис)")
      )
    )
  );
}

module.exports = OfferPDF;
