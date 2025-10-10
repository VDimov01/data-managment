import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";

export default function EditionSpecsPanel({
  apiBase = "http://localhost:5000",
  editionId,
  lang = "bg",
}) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);

  const HIDDEN_CODES = new Set(['MSRP_AT_LAUNCH']); // extend if needed

  // ----- Group ordering + BG translations -----
  const FALLBACK_GROUP_ORDER = [
    "Basic information","Car body","Electric motor","ICE","Battery & Charging",
    "Transmission","Chassis & Steering","Wheels & Brakes","Active safety",
    "Passive safety","Car control & Driving assist","Exterior","Interior",
    "Intelligent connectivity","Seats","Comfort & Anti-theft systems",
    "Digital intertainment","Air conditioner & Refrigerator","Lights",
    "Glass & Mirrors","Intelligent systems","ADAS","Optional packages",
    "Customized options","Individual features","Full Vehicle Warranty",
  ];

  const GROUP_BG = {
    "Basic information": "Основна информация",
    "Car body": "Купе",
    "Electric motor": "Електродвигател",
    "ICE": "ДВГ",
    "Battery & Charging": "Батерия и зареждане",
    "Transmission": "Трансмисия",
    "Chassis & Steering": "Окачване и управление",
    "Wheels & Brakes": "Колела и спирачки",
    "Active safety": "Активна безопасност",
    "Passive safety": "Пасивна безопасност",
    "Car control & Driving assist": "Контроли и асистенти",
    "Exterior": "Екстериор",
    "Interior": "Интериор",
    "Intelligent connectivity": "Свързаност",
    "Seats": "Седалки",
    "Comfort & Anti-theft systems": "Комфорт и защита",
    "Digital intertainment": "Дигитални развлечения",
    "Air conditioner & Refrigerator": "Климатик и охлаждане",
    "Lights": "Осветление",
    "Glass & Mirrors": "Стъкла и огледала",
    "Intelligent systems": "Интелигентни системи",
    "ADAS": "ADAS",
    "Optional packages": "Опционални пакети",
    "Customized options": "Персонализирани опции",
    "Individual features": "Индивидуални екстри",
    "Full Vehicle Warranty": "Гаранция на автомобила",
  };

  function parseDisplayGroup(displayGroup, category) {
    if (typeof displayGroup === "string") {
      const m = displayGroup.match(/^\s*(\d{1,3})\s+(.*\S)\s*$/);
      if (m) return { seq: Number(m[1]), en: m[2] };
      const trimmed = displayGroup.trim();
      if (trimmed) {
        const idx = FALLBACK_GROUP_ORDER.indexOf(trimmed);
        return { seq: idx >= 0 ? idx + 1 : 999, en: trimmed };
      }
    }
    return { seq: 999, en: (category || "Other") };
  }

  // ---------- Loader ----------
  const loadEditionAttributes = async (edId) => {
  // 1) Effective attributes (typed values already)
  const attrPayload = await api(`/public/editions/${edId}/attributes?lang=${lang}`);
  const defs = Array.isArray(attrPayload?.items)
    ? attrPayload.items
    : Array.isArray(attrPayload)
    ? attrPayload
    : [];

  // 2) Sidecar JSON (adds extra attrs not in defs; i18n text overrides)
  const specs = await api(`/public/editions/${edId}/specs?lang=${lang}`);
  const jsonAttrs = specs?.specs_json?.attributes || {};
  const jsonI18n  = (specs?.specs_i18n?.[lang]?.attributes) || {};

  // Build map from defs by code (these already have the typed value)
  const byCode = new Map();
  for (const a of defs) {
    if (!a?.code) continue;
    const info = parseDisplayGroup(a.display_group, a.category);
    byCode.set(a.code, {
      ...a,
      _gseq: info.seq,
      _group_en: info.en,
      _group_bg: GROUP_BG[info.en] || info.en,
      _item_order: Number.isFinite(a.display_order) ? a.display_order : 9999,
    });
  }

  // Add JSON-only attributes that aren't in defs
  for (const [code, obj] of Object.entries(jsonAttrs)) {
    if (!code || byCode.has(code)) continue;

    const dt  = obj?.dt || 'text';
    let val   = obj?.v ?? null;
    const unit = obj?.u ?? null;

    // i18n override for text
    if (dt === 'text' && jsonI18n && jsonI18n[code] != null) {
      val = jsonI18n[code];
    }

    // coerce types like backend does
    if (dt === 'boolean') {
      val = val === true || val === 1 || val === '1';
    } else if (dt === 'int') {
      const n = Number(val);
      val = Number.isFinite(n) ? Math.trunc(n) : null;
    } else if (dt === 'decimal') {
      const x = Number(val);
      val = Number.isFinite(x) ? x : null;
    } else if (dt === 'enum') {
      val = (val ?? '').toString().trim() || null;
    } else if (dt === 'text') {
      const s = (val ?? '').toString().trim();
      val = s || null;
    }

    byCode.set(code, {
      attribute_id: null,
      code,
      name: code,
      name_bg: code,
      unit,
      data_type: dt,
      category: 'Other',
      display_group: 'Other',
      display_order: 9999,
      value: val,
      _gseq: 999,
      _group_en: 'Other',
      _group_bg: 'Други',
      _item_order: 9999,
    });
  }

  // To array, filter empties (keep 0/false), sort
  const raw = Array.from(byCode.values());
  const filtered = raw.filter((r) => {
    if (HIDDEN_CODES.has(r.code)) return false;
    const v = r.value;
    if (v === null || v === undefined) return false;
    if (typeof v === 'string' && v.trim() === '') return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (a._gseq !== b._gseq) return a._gseq - b._gseq;
    if (a._group_bg !== b._group_bg)
      return String(a._group_bg).localeCompare(String(b._group_bg), 'bg');
    if (a._item_order !== b._item_order) return a._item_order - b._item_order;
    const la = a.name_bg || a.name || a.code;
    const lb = b.name_bg || b.name || b.code;
    return String(la).localeCompare(String(lb), 'bg');
  });

  setRows(filtered);
};


  // ---- Effect ----
  useEffect(() => {
    let alive = true;
    (async () => {
      setErr(null);
      setRows(null);
      try {
        await loadEditionAttributes(editionId);
      } catch (e) {
        if (alive) setErr(e.message || "Failed to load specs");
      }
    })();
    return () => {
      alive = false;
    };
  }, [apiBase, editionId, lang]);

  // ---- Grouping (stable hook order) ----
  const groupsMap = useMemo(() => {
    const m = new Map();
    if (!Array.isArray(rows)) return m;
    for (const r of rows) {
      const g = r._group_bg || "Спецификации";
      if (!m.has(g)) m.set(g, []);
      m.get(g).push(r);
    }
    return m;
  }, [rows]);

  if (err) return <div style={{ padding: 12, color: "#b00020" }}>Error: {err}</div>;
  if (!rows) return <div style={{ padding: 12 }}>Loading specs…</div>;
  if (!rows.length) return <div style={{ padding: 12, opacity: 0.7 }}>Няма данни.</div>;

  return (
    <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #eee" }}>
      {[...groupsMap.entries()].map(([groupTitleBg, items]) => (
        <div key={groupTitleBg} style={{ borderTop: "1px solid #eee" }}>
          <div style={{ padding: "12px 16px", background: "#fafafa", fontWeight: 600 }}>
            {groupTitleBg}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {items.map((a) => (
                <tr key={a.code} style={{ borderTop: "1px solid #f2f2f2" }}>
                  <td style={{ padding: "10px 16px", width: "45%", color: "#333" }}>
                    {a.name_bg || a.label || a.code}
                  </td>
                  <td style={{ padding: "10px 16px", color: "#111", fontWeight: 500 }}>
                    {formatValue(a.value, a.unit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function formatValue(v, unit) {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return "—";
  if (typeof v === "boolean") return v ? "✅" : "❌";
  if (typeof v === "number" && unit) return `${v} ${unit}`;
  if (typeof v === "string" && unit && !v.endsWith(unit)) return `${v} ${unit}`;
  return String(v);
}

