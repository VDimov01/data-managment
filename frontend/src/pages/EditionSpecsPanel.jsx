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
    // 1) attribute defs + effective values (edition/year/model)
    const defs = await api(
      `/public/editions/${edId}/attributes?effective=1&lang=${lang}`);

    // 2) JSON/EAV sidecar
    const specs = await api(
      `/public/editions/${edId}/specs?lang=${lang}`);

    const eavNum  = new Map((specs?.eav?.numeric  || []).map((row) => [row.code, row.val]));
    const eavBool = new Map((specs?.eav?.boolean || []).map((row) => [row.code, row.val ? 1 : 0]));
    const jsonAttrs = specs?.json?.attributes || {};
    const jsonI18n  = specs?.json_i18n?.[lang]?.attributes || {};
    const enums     = specs?.enums || {};

    const jsonHas = (code, dt) => {
      const o = jsonAttrs[code];
      return o && (o.dt === dt || (!o.dt && dt === "text")); // tolerate missing dt for text
    };
    const jsonVal = (code) => jsonAttrs[code]?.v;

    const localizedBool = (b) =>
      lang === "en" ? (b ? '✅' : '❌') : (b ? '✅' : '❌');

    // Build raw rows with value
    const raw = defs.map((a) => {
      let value = null;

      if (a.data_type === "boolean") {
        const ev =
          a.value_boolean != null
            ? a.value_boolean
            : eavBool.has(a.code)
            ? eavBool.get(a.code)
            : jsonHas(a.code, "boolean")
            ? (jsonVal(a.code) ? 1 : 0)
            : null;
        value = ev == null ? null : localizedBool(!!ev);

      } else if (a.data_type === "int" || a.data_type === "decimal") {
        const ev =
          a.value_numeric != null
            ? a.value_numeric
            : eavNum.has(a.code)
            ? eavNum.get(a.code)
            : jsonHas(a.code, a.data_type)
            ? Number(jsonVal(a.code))
            : null;
        value = ev == null ? null : ev;

      } else if (a.data_type === "enum") {
        // Prefer localized label if backend provided it; else enum_code
        value = (a.enum_label && String(a.enum_label).trim()) || (a.enum_code || "");

      } else {
        // text: prefer i18n JSON > JSON raw > effective text
        const fromJson = jsonI18n[a.code] ?? (jsonHas(a.code, "text") ? String(jsonVal(a.code)) : null);
        value = fromJson != null ? fromJson : (a.value_text ?? null);
      }

      // Compute group metadata + BG title
      const dg   = a.display_group || a.category || "Other";
      const info = parseDisplayGroup(dg, a.category);
      const group_bg = GROUP_BG[info.en] || info.en; // translate EN group -> BG if known

      return {
        ...a,
        value,
        _gseq: info.seq,
        _group_en: info.en,
        _group_bg: group_bg,
        _item_order: Number.isFinite(a.display_order) ? a.display_order : 9999,
      };
    });

    // Filter out null/empty ONLY; keep 0 and "Не"
    const filtered = raw.filter((r) => {
      if (HIDDEN_CODES.has(r.code)) return false;
      const v = r.value;
      if (v === null || v === undefined) return false;
      if (typeof v === "string" && v.trim() === "") return false;
      return true; // keep numbers (incl. 0) and non-empty strings (incl. "Не", "0")
    });

    // Sort by group seq -> group name -> item order -> label
    filtered.sort((a, b) => {
      if (a._gseq !== b._gseq) return a._gseq - b._gseq;
      if (a._group_bg !== b._group_bg) return String(a._group_bg).localeCompare(String(b._group_bg), "bg");
      if (a._item_order !== b._item_order) return a._item_order - b._item_order;
      const la = a.name_bg || a.label || a.code;
      const lb = b.name_bg || b.label || b.code;
      return String(la).localeCompare(String(lb), "bg");
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
  if (typeof v === "number" && unit) return `${v} ${unit}`;
  if (typeof v === "string" && unit && !v.endsWith(unit)) return `${v} ${unit}`;
  return String(v);
}
