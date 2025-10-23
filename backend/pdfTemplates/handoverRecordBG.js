// backend/pdfTemplates/HandoverRecordBG.js
const React = require("react");
const { Document, Page, Text, View, Svg, G, Path, StyleSheet } = require("@react-pdf/renderer");

/** tiny helpers */
function safe(s) {
  if (s == null) return "";
  return String(s);
}
function fmtDate(dt) {
  if (!dt) return "—";
  try {
    const d = new Date(dt);
    if (Number.isNaN(d.getTime())) return safe(dt);
    const pad = (n) => String(n).padStart(2, "0");
    const dd = pad(d.getDate());
    const mm = pad(d.getMonth() + 1);
    const yyyy = d.getFullYear();
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${dd}.${mm}.${yyyy}`;
  } catch {
    return safe(dt);
  }
}
function row(label, value, styles) {
  return React.createElement(
    View, { style: styles.kvRow },
    React.createElement(Text, { style: styles.kvLabel }, label),
    React.createElement(Text, { style: styles.kvValue }, value ?? "—")
  );
}

function Logo({ cfg, width = 120, height = 48 }) {
  if (!cfg) return null;
  return React.createElement(
    Svg,
    { width, height, viewBox: cfg.viewBox },
    React.createElement(
      G,
      { transform: cfg.groupTransform },
      ...(cfg.paths || []).map((p, i) =>
        React.createElement(Path, { key: i, d: p.d, fill: p.fill || cfg.fill || "#111" })
      )
    )
  );
}

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, fontFamily: "DejaVu" },

// header row with logo + text
  hdrRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  hdrLeft: { flexDirection: "row", alignItems: "center", gap: 8 }, // gap isn’t supported; spacing is via margins
  logoBox: { marginRight: 12 },
  hdrText: { flex: 1, textAlign: "right" },
  title: { fontSize: 18, fontWeight: "bold" },
  subtitle: { fontSize: 11, marginTop: 2, color: "#444" },

  metaLine: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12, color: "#444" },

  section: { marginTop: 10, marginBottom: 8 },
  h2: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 6,
    borderBottomWidth: 1,          // was: borderBottom: 1
    borderBottomColor: "#e5e7eb",
    borderStyle: "solid"
  },

  // Instead of gap, we stack columns with a spacer
  twoCol: { flexDirection: "row" },
  col: { flex: 1 },
  colSpacer: { width: 12 },        // use <View style={styles.colSpacer} />

  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,          // was: borderBottom: 1
    borderBottomColor: "#eee",
    borderStyle: "solid",
    paddingVertical: 4
  },
  kvLabel: { width: "45%", fontWeight: "bold" },
  kvValue: { width: "55%", textAlign: "right" },

  // No "gap" → stack rows with small top margins
  checklist: {},
  chkRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  chkLeft: {},
  chkRight: { color: "#666" },

  notesBox: {
    borderWidth: 1,                // was: border: 1
    borderColor: "#e5e7eb",
    borderStyle: "solid",
    borderRadius: 4,
    padding: 8,
    minHeight: 60
  },

  // No gap → manual spacing via margins
  signRow: { flexDirection: "row", marginTop: 22 },
  signCol: { flex: 1, marginRight: 24 },  // last col can override to 0
  signColLast: { flex: 1, marginRight: 0 },
  signLine: { marginTop: 24, borderTopWidth: 1, borderTopColor: "#111", borderStyle: "solid", height: 0 },

  foot: { marginTop: 18, color: "#666", fontSize: 9, textAlign: "center" },
});


/**
 * HandoverRecordBG — clean Bulgarian single-vehicle handover template
 *
 * props = {
 *   record: { number?, uuid?, handover_date?, location?, odometer_km?, notes? }
 *   seller: { display_name?, company_name?, vat_number?, city?, address_line?, email?, phone? }
 *   buyer:  { display_name?, first_name?, middle_name?, last_name?, company_name?, vat_number?, email?, phone? }
 *   vehicle:{ make_name?, model_name?, year?, edition_name?, vin?, exterior_color?, interior_color?, mileage_km? }
 * }
 */
function HandoverRecordBG({ record = {}, seller = {}, buyer = {}, vehicle = {}, logoUri }) {
  const protocolNo = "00000000" + safe(record.number || record.handover_record_id || record.uuid || "");

  const fullTitle = "ПРИЕМО - ПРЕДАВАТЕЛЕН ПРОТОКОЛ";

  const vehicleTitle = `${safe(vehicle.make_name || vehicle.make || "")} ${safe(
    vehicle.model_name || vehicle.model || ""
  )}${vehicle.year ? ` (${vehicle.year})` : ""}${vehicle.edition_name ? ` — ${vehicle.edition_name}` : ""}`.trim();

  return React.createElement(
    Document, null,
    React.createElement(
      Page, { size: "A4", style: styles.page },

      // Modern header with logo
      React.createElement(
        View, { style: styles.hdrRow },
        React.createElement(View, { style: styles.logoBox },
          React.createElement(Logo, { cfg: logoUri, width: 120, height: 48 })
        ),
        React.createElement(View, { style: styles.hdrText },
          React.createElement(Text, { style: styles.title }, fullTitle),
          protocolNo ? React.createElement(Text, { style: styles.subtitle }, `Протокол № ${protocolNo}`) : null
        )
      ),
      React.createElement(View, { style: styles.metaLine },
        React.createElement(Text, null, `Дата на предаване: ${fmtDate(record.handover_date)}`),
        React.createElement(Text, null, `Местоположение: ${safe(record.location || "—")}`)
      ),

      // Parties
      React.createElement(View, { style: styles.section },
        React.createElement(Text, { style: styles.h2 }, "Страни по протокола"),
        React.createElement(View, { style: styles.twoCol },
          React.createElement(View, { style: styles.col },
            row("Продавач", seller.name, styles),
            row("ЕИК/ДДС", seller.tax_id || "—", styles),
            row("Град / Адрес", [seller.city, seller.address].filter(Boolean).join(", ") || "—", styles),
            row("Контакт", [seller.email, seller.phone].filter(Boolean).join(" ") || "—", styles),
            row("Представител", seller.representative || "—", styles),
          ),
          React.createElement(View, { style: styles.colSpacer }),
          React.createElement(View, { style: styles.col },
            row("Купувач", buyer.display_name, styles),
            buyer.type === "individual" ?
              row("ЕГН / ЛНЧ", `${buyer.person.egn} ${buyer.person.vat_number ? ` / ${buyer.person.vat_number}` : ""}` || "—", styles) :
              row("ЕИК/ДДС", `${buyer.company.tax_id} ${buyer.company.vat_number ? ` / ${buyer.company.vat_number}` : ""}` || "—", styles),
              row("Град / Адрес", [buyer.contact.city, buyer.contact.address].filter(Boolean).join(", ") || "—", styles),
            row("Контакт", [buyer.contact.email, buyer.contact.phone].filter(Boolean).join(" ") || "—", styles),
            buyer.type === 'company' ? 
              row("Представител", [buyer.company.rep_first_name, buyer.company.rep_middle_name, buyer.company.rep_last_name].filter(Boolean).join(" ") || "—", styles) 
              : null     
            ),
        )
      ),

      // Vehicle
      React.createElement(View, { style: styles.section },
        React.createElement(Text, { style: styles.h2 }, "Автомобил"),
        row("Модел", vehicleTitle || "—", styles),
        row("VIN", vehicle.vin || "—", styles),
        row("Цвят (екст./инт.)", `${safe(vehicle.exterior_color || "—")} / ${safe(vehicle.interior_color || "—")}`, styles),
        row("Пробег към предаване (км)", (record.odometer_km ?? vehicle.mileage_km ?? "—") + "", styles),
      ),

      // Delivery details
      React.createElement(View, { style: styles.section },
        React.createElement(Text, { style: styles.h2 }, "Данни за предаване"),
        // row("Дата и час", fmtDate(record.handover_date), styles),
        row("Местоположение", safe(record.location || "—"), styles),
      ),

      // Checklist (empty boxes to fill on paper)
      React.createElement(View, { style: styles.section },
        React.createElement(Text, { style: styles.h2 }, "Проверка при предаване (попълва се при подпис)"),
        React.createElement(View, { style: styles.checklist },
          React.createElement(View, { style: styles.chkRow },
            React.createElement(Text, { style: styles.chkLeft }, "□ Ключове (бр.) ________"),
            React.createElement(Text, { style: styles.chkLeft }, "□ Сервизна книжка / документи"),
          ),
          React.createElement(View, { style: styles.chkRow },
            React.createElement(Text, { style: styles.chkLeft }, "□ Резервна гума / комплект за гуми"),
            React.createElement(Text, { style: styles.chkLeft }, "□ Зарядно / кабели (ако е приложимо)"),
          ),
          React.createElement(View, { style: styles.chkRow },
            React.createElement(Text, { style: styles.chkLeft }, "□ Външно състояние — проверено"),
            React.createElement(Text, { style: styles.chkLeft }, "□ Вътрешно състояние — проверено"),
          ),
        )
      ),

      // Notes
      record.notes !== null && React.createElement(View, { style: styles.section },
        React.createElement(Text, { style: styles.h2 }, "Бележки"),
        React.createElement(View, { style: styles.notesBox },
          React.createElement(Text, null, safe(record.notes || ""))
        )
      ),

      // Signatures
      React.createElement(View, { style: styles.signRow },
        React.createElement(View, { style: styles.signCol },
          React.createElement(Text, null, "За Продавача"),
          React.createElement(View, { style: styles.signLine }),
          React.createElement(Text, { style: styles.signLabel }, "/   Подпис  /")
        ),
        React.createElement(View, { style: styles.signColLast },
          React.createElement(Text, null, "За Купувача"),
          React.createElement(View, { style: styles.signLine }),
          React.createElement(Text, { style: styles.signLabel }, "/   Подпис  /")
        )
      ),

      // Footer
      React.createElement(View, { style: styles.foot },
        React.createElement(Text, null, "С подписването на протокола Купувачът потвърждава приемането на автомобила в описаното състояние.")
      )
    )
  );
}

module.exports = HandoverRecordBG;
