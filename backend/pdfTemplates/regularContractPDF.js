const React = require("react");
const { Page, Text, View, Document, StyleSheet, Font } = require("@react-pdf/renderer");
const path = require("path");

const secret = process.env.UCN_SECRET_KEY;

// Register font
Font.register({
  family: "DejaVu",
  fonts: [
    {
      src: path.join(__dirname, "../fonts/DejaVuSans.ttf"), // normal weight
      fontWeight: "normal"
    },
    {
      src: path.join(__dirname, "../fonts/DejaVuSans-Bold.ttf"), // bold weight
      fontWeight: "bold"
    }
  ]
});

const styles = StyleSheet.create({
  page: { padding: 80, fontSize: 10, fontFamily: "DejaVu", lineHeight: 1.5 },
  title: { fontSize: 14, textAlign: "center", marginBottom: 15 },
  section: { marginBottom: 12 },
  sellersSection: { marginBottom: 20, fontWeight: "bold" },
  bold: {fontFamily: "DejaVu", fontWeight: "bold" },
  table: { display: "table", width: "auto", marginTop: 10 },
  tableRow: { flexDirection: "row", borderBottom: "1px solid #000", paddingVertical: 4 },
  tableHeader: { fontWeight: "bold", backgroundColor: "#f0f0f0" },
  cell: { flex: 1, paddingHorizontal: 4 },
  carDescription: {
    marginBottom: 6,
    fontFamily: "DejaVu",
    fontSize: 10
  },

});

function boldedCompanyName(buyer){
  return React.createElement(Text, { style: { fontWeight: "bold" } }, `${buyer.name} с ЕИК: `);
}

function boldedClientName(buyer){
  return React.createElement(Text, { style: { fontWeight: "bold" } }, `${buyer.first_name} ${buyer.middle_name} ${buyer.last_name}, с ЕГН:`);
}

function boldText(text){
  return React.createElement(Text, { style: { fontWeight: "bold" } }, text);
}

function RegularContractPDF({ buyer, cars = []}) {
  const totalAmount = cars.reduce((sum, car) => sum + car.unit_price * car.quantity, 0);
  const deliveryDays = 60;
  const today = new Date().toLocaleDateString("bg-BG");

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },

      React.createElement(Text, { style: styles.title }, "ДОГОВОР"),
      React.createElement(Text, { style: styles.title }, "за покупко - продажба на моторно превозно средство (МПС)"),

      // Parties
      React.createElement(View, { style: styles.section }, [
        React.createElement(Text, null, `Днес, на `, boldText(`${today}`), ` в гр. София между:`),
        React.createElement(View, {style: {marginTop: 10, marginBottom: 10} }),
        React.createElement(Text, null,``, boldText(`"Некст Авто“ ЕООД, с ЕИК:`), ` 208224080, гр. Стара Загора, ул. "Темида" 1, вх. Б, ап. 16, тел.: 0996600900, e-mail: sales@solaris.expert, представлявано от Пламен Иванов Генчев – `, boldText(`ПРОДАВАЧ`)),
        React.createElement(Text, null, `и`),
        buyer.customer_type === "Individual" && React.createElement(Text, null, ``, boldText(`${buyer.display_name} с ЕГН: `), 
        `${buyer.national_id} и адрес ${buyer.city || ""}, ${buyer.address_line || ""} и тел: ${buyer.phone}`, `, наричан по-долу – `, 
        boldText(`КУПУВАЧ`)),
        
        buyer.customer_type === "Company" && React.createElement(Text, null, ``, boldText(`${buyer.display_name} с ЕИК: `), 
        `${buyer.vat_number} и адрес на управление ${buyer.city || ""}, ${buyer.address_line || ""}`, 
        `, представлявано от ${buyer.rep_first_name} ${buyer.rep_middle_name || ""} ${buyer.rep_last_name || ""}, наричан по-долу – `, 
        boldText(`КУПУВАЧ`)),
      ]),

      // Vehicle info
      React.createElement(Text, { style: { marginBottom: 10 } }, "се сключи настоящият договор за покупко-продажба на следните", boldText(` МПС:`)),

      React.createElement(View, { style: styles.section },
  cars.map((car, idx) =>
  React.createElement(Text, { key: idx, style: styles.carDescription },
    ``,boldText(`Лек автомобил`), `, марка/модел "`,
    React.createElement(Text, { style: { fontWeight: "bold" } }, `${car.maker} ${car.model} ${car.edition || ""}`),
    ` ", Идентификационен номер на превозното средство с VIN № ${car.vin}, цвят ${car.exterior_color || "неуточнен"} / ${car.interior_color || ""}, пробег на автомобила - ${car.mileage_km} км, количество ${car.quantity}, единична цена ${(car.unit_price).toLocaleString()} лв, обща цена ${(car.unit_price * car.quantity).toLocaleString()} лв.`
  )
)
      
  
),

      // Terms
      React.createElement(View, { style: styles.section }, [
        React.createElement(Text, null, `1. `, boldText(`ПРОДАВАЧЪТ`), ` продава на `, boldText(`КУПУВАЧА`), ` изброените по-горе МПС-та в отлично техническо състояние и външен вид, и заедно с всички принадлежности, числящи се към автомобилите за сумата ${totalAmount.toLocaleString()} лв. (с включено ДДС), която сума продавача ще получи по банков път от купувача:`),
        React.createElement(Text, {style: {marginLeft: 20}}, `1.1. `),
        React.createElement(Text, {style: {marginLeft: 20}}, `1.2. `),
        React.createElement(Text, {style: {marginLeft: 20}}, `1.3. `),
      ]),

      // Static clauses
      React.createElement(View, { style: styles.section }, [
        React.createElement(Text, null, `2. `, boldText(`КУПУВАЧЪТ`), ` заяви, че купува описаното по - горе МПС при посочените условия и за посочената цена, изплатими напълно на продавачa. Разноските по регистрацията са за сметка на купувача.`),
        React.createElement(Text, null, `3. `, boldText(`ПРОДАВАЧЪТ`), ` декларира, че автомобилът не е предмет на особен залог или обезпечение, върху него няма наложен запор, не е давано пълномощно за продажбата му на други лица и че не съществуват никакви пречки да бъде извършена продажбата. `),
        React.createElement(Text, null, `4. Настоящият договор може да бъде изменян само в писмена форма.`),
        React.createElement(Text, null, `5. Всички спорове се решават по взаимно съгласие, а при невъзможност – чрез съда.`),
        React.createElement(Text, null, `6. Договорът се изготвя в два екземпляра – по един за всяка от страните.`),
      ]),

      // Additional clauses
      React.createElement(View, { style: styles.section }, [
        React.createElement(Text, null, `Лице за контакт от името на продавача: Пламен Генчев, `),
        React.createElement(Text, null, `телефон: 0996112233, 0996600900`),
        React.createElement(Text, null, `e-mail: plamen.genchev@solaris.expert`),
        React.createElement(Text, null, `Банкова сметка на продавача:`),
      ]),

      React.createElement(View, {style: styles.sellersSection}, [
        React.createElement(Text, null, `IBAN сметка: BG52FINV91501017841918`),
        React.createElement(Text, null, `BIC: FINVBGSF`),
        React.createElement(Text, null, `Банка: Първа инвестиционна банка АД`),
      ]),

      // Signatures
      React.createElement(View, { style: styles.section }, [
        React.createElement(View, { style: { marginTop: 10, marginBottom: 10 } }),
        React.createElement(Text, null, "ПРОДАВАЧ: ...................................          / Пламен Генчев /"),
        React.createElement(View, { style: { marginTop: 10, marginBottom: 10 } }),
        buyer.customer_type === "Company" && React.createElement(Text, null, "КУПУВАЧ: ...................................           / " + (`${buyer.rep_first_name} ${buyer.rep_last_name}`) + " /"),
        buyer.customer_type === "Individual" && React.createElement(Text, null, "КУПУВАЧ: ...................................           / " + (`${buyer.first_name} ${buyer.last_name}`) + " /"),
      ])
    )
  );
}

module.exports = RegularContractPDF;
