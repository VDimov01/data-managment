import React, { useEffect, useState } from "react";
import { MoneyInput, PercentInput } from "./Inputs";
import { parseNumber, grossFromNet, netFromGross, round2 } from "../../utils/helpers";

const fmt2 = (n) => round2(n).toFixed(2);

function readMeta(it) {
  const m = it?.metadata_json ?? it?.metadata;
  if (!m) return {};
  if (typeof m === "string") {
    try { return JSON.parse(m); } catch { return {}; }
  }
  return m;
}

export default function LinesTable({ offer, items, onUpdateLine, onDeleteLine }) {
  // local discount state per line (free typing)
  const [disc, setDisc] = useState({}); // { [line_no]: { value: "12.34" } }  (gross, per unit)

  // seed discount inputs from metadata_json
  useEffect(() => {
    setDisc((prev) => {
      const next = { ...prev };
      for (const it of items) {
        const ln = it.line_no;
        const meta = readMeta(it);
        if (!next[ln]) {
          next[ln] = {
            value: meta.ui_discount_value != null ? String(meta.ui_discount_value) : "",
          };
        }
      }
      // cleanup removed lines
      for (const k of Object.keys(next)) {
        if (!items.find((it) => String(it.line_no) === String(k))) delete next[k];
      }
      return next;
    });
  }, [items]);

  // apply discount: compute NEW NET unit, send to server with updated metadata_json
  function applyDiscount(lineNo, extraPatch = {}) {
    const it = items.find((r) => r.line_no === lineNo);
    if (!it) return;

    const meta = readMeta(it);
    const rate = Number(it.vat_rate ?? offer?.vat_rate ?? 20);

    // base NET per unit (pre-discount). If not stored yet, current unit is the base.
    const baseNet = Number(meta.ui_original_unit_price ?? it.unit_price ?? 0);
    const baseGross = round2(grossFromNet(baseNet, rate));

    const dVal = parseNumber((disc[lineNo] && disc[lineNo].value) ?? ""); // gross discount per unit
    const effGross = round2(Math.max(0, baseGross - dVal));
    const effNet = netFromGross(effGross, rate);

    const payload = {
      unit_price: Number(effNet.toFixed(2)),      // store NET
      discount_amount: dVal || 0,
      metadata_json: {
        ...meta,
        ui_original_unit_price: baseNet,          // NET, stable base
        ui_discount_type: "amount",               // fixed mode
        ui_discount_value: dVal || 0,             // GROSS discount per unit
        ui_effective_unit_price: Number(effNet.toFixed(2)),
        ui_tax_rate: rate,
      },
      ...extraPatch
    };

    onUpdateLine(lineNo, payload);
  }

  function handleVatChange(lineNo, newVatStr) {
    if (newVatStr === "") return; // typing
    const newRate = Number(newVatStr);
    // re-apply discount with the new VAT and update both vat_rate + unit_price
    applyDiscount(lineNo, { vat_rate: newRate });
  }

  return (
  <div className="table-wrap">
    <table className="table table-tight offer-lines">
      <thead>
        <tr>
          <th>Описание</th>
          <th>К-во</th>
          <th>Отстъпка (с ДДС)</th>
          <th>Ед. цена (с ДДС)</th>
          <th>ДДС %</th>
          <th className="text-right">Общо (с ДДС)</th>
          <th></th>
        </tr>
      </thead>

      <tbody>
        {items.length === 0 && (
          <tr>
            <td colSpan={7} className="text-muted center">Няма артикули.</td>
          </tr>
        )}

        {items.map((it) => {
          const ln   = it.line_no;
          const qty  = Number(it.quantity || 1);
          const rate = Number(it.vat_rate ?? offer?.vat_rate ?? 20);

          const meta      = readMeta(it);
          const baseNet   = Number(meta.ui_original_unit_price ?? it.unit_price ?? 0); // NET base
          const baseGross = round2(grossFromNet(baseNet, rate));

          const dVal          = parseNumber((disc[ln] && disc[ln].value) ?? "");
          const effGrossUnit  = round2(Math.max(0, baseGross - dVal));
          const effNetUnit    = netFromGross(effGrossUnit, rate);
          const grossTotal    = round2(qty * effGrossUnit);
          const currencyLabel = offer?.currency || "BGN";

          return (
            <tr key={ln}>
              {/* Описание */}
              <td>
                <div className="v-title">{it.description || `Линия ${ln}`}</div>
                <div className="text-muted meta">
                  База (нето): {fmt2(baseNet)} {currencyLabel}
                </div>
              </td>

              {/* К-во */}
              <td>
                <MoneyInput
                  className="input"
                  value={String(qty)}
                  onChange={(v) => {
                    if (v === "") return onUpdateLine(ln, { quantity: "" });
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    onUpdateLine(ln, { quantity: n });
                  }}
                  onBlur={(e) => {
                    const v = e.target.value;
                    const n = v === "" ? 1 : Number(v);
                    onUpdateLine(ln, { quantity: n });
                  }}
                />
              </td>

              {/* Отстъпка (сума бруто на единица) */}
              <td>
                <MoneyInput
                  className="input"
                  placeholder="0.00"
                  value={(disc[ln] && disc[ln].value) ?? ""}
                  onChange={(v) => setDisc((m) => ({ ...m, [ln]: { value: v } }))}
                  onBlur={() => applyDiscount(ln)}
                />
                <div className="text-muted hint">
                  Нова нето ед. цена: {fmt2(effNetUnit)} {currencyLabel}
                </div>
              </td>

              {/* Ефективна брутна ед. цена (показваме само) */}
              <td>
                <MoneyInput className="input" value={fmt2(effGrossUnit)} disabled />
              </td>

              {/* ДДС % */}
              <td>
                <PercentInput
                  className="input"
                  value={String(rate)}
                  onChange={(v) => handleVatChange(ln, v)}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v === "") return;
                    handleVatChange(ln, v);
                  }}
                  placeholder="20"
                />
              </td>

              {/* Общо (брутно) */}
              <td className="text-right">
                <strong>{currencyLabel} {fmt2(grossTotal)}</strong>
              </td>

              {/* Изтрий */}
              <td>
                <button className="btn btn-danger" onClick={() => onDeleteLine(ln)}>✕</button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

}
