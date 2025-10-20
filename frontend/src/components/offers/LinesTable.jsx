// frontend/src/components/offers/LinesTable.jsx
import React, { useEffect, useState } from "react";
import { grossFromNet, netFromGross, parseNumber } from "../../utils/helpers";
import { MoneyInput, PercentInput } from "./Inputs";

export default function LinesTable({ offer, items, onUpdateLine, onDeleteLine }) {
  const currency = offer?.currency || "BGN";
  const [grossInput, setGrossInput] = useState({}); // line_no -> string (gross)

  useEffect(() => {
    setGrossInput((prev) => {
      const next = { ...prev };
      items.forEach((it) => {
        if (prev[it.line_no] == null) {
          const rate = Number(it.vat_rate ?? offer?.vat_rate ?? 20);
          next[it.line_no] = String(grossFromNet(it.unit_price || 0, rate).toFixed(2));
        }
      });
      Object.keys(next).forEach((k) => {
        if (!items.find((it) => String(it.line_no) === String(k))) delete next[k];
      });
      return next;
    });
  }, [items, offer?.vat_rate]);

  return (
    <div className="table-wrap mt-2">
      <table className="table table-tight">
        <thead>
          <tr>
            <th style={{ minWidth: 260 }}>Описание</th>
            <th style={{ width: 90 }}>К-во</th>
            <th style={{ width: 160 }}>Ед. цена (с ДДС)</th>
            <th style={{ width: 100 }}>% ДДС</th>
            <th style={{ width: 160, textAlign: "right" }}>Сума (без ДДС)</th>
            <th style={{ width: 60 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={6} className="text-muted center">Няма добавени редове.</td></tr>
          )}
          {items.map((it) => {
            const rate = Number(it.vat_rate ?? offer?.vat_rate ?? 20);
            const net = Number(it.unit_price || 0);
            const gross = grossInput[it.line_no] ?? String(grossFromNet(net, rate).toFixed(2));
            return (
              <tr key={it.line_no}>
                <td>
                  <input
                    className="input"
                    value={it.description || ""}
                    onChange={(e) => onUpdateLine(it.line_no, { description: e.target.value })}
                  />
                </td>
                <td>
                  <MoneyInput
                    value={it.quantity}
                    onChange={(v) => onUpdateLine(it.line_no, { quantity: v === "" ? "" : Number(v) })}
                    placeholder="1"
                  />
                </td>
                <td>
                  <MoneyInput
                    value={gross}
                    onChange={(v) => {
                      setGrossInput(m => ({ ...m, [it.line_no]: v }));
                      if (v === "") {
                        onUpdateLine(it.line_no, { unit_price: "" });
                      } else {
                        const netVal = netFromGross(Number(v), rate);
                        onUpdateLine(it.line_no, { unit_price: Number(netVal.toFixed(2)) });
                      }
                    }}
                    placeholder="0.00"
                  />
                </td>
                <td>
                  <PercentInput
                    value={it.vat_rate}
                    onChange={(v) => {
                      const newRate = v === "" ? "" : Number(v);
                      const grossStr = grossInput[it.line_no] ?? String(grossFromNet(net, rate).toFixed(2));
                      const grossNum = parseNumber(grossStr, 0);
                      const newNet = v === "" ? netFromGross(grossNum, offer?.vat_rate ?? 20) : netFromGross(grossNum, newRate);
                      setGrossInput(m => ({ ...m, [it.line_no]: grossStr }));
                      onUpdateLine(it.line_no, {
                        vat_rate: v === "" ? "" : newRate,
                        unit_price: Number(newNet.toFixed(2))
                      });
                    }}
                    placeholder={String(offer?.vat_rate ?? 20)}
                  />
                </td>
                <td style={{ textAlign: "right" }}>
                  <strong>{currency} {Number(it.line_total || 0).toFixed(2)}</strong>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    Брутo: {currency} {(Number(it.quantity || 1) * grossFromNet(net, rate)).toFixed(2)}
                  </div>
                </td>
                <td>
                  <button className="btn btn-danger" onClick={() => onDeleteLine(it.line_no)}>✕</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
