// frontend/src/components/offers/Inputs.jsx
import React from "react";

export function MoneyInput({ className = "input", value, onChange, placeholder = "0.00" }) {
  return (
    <input
      className={className}
      inputMode="decimal"
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "");
        const parts = raw.split(".");
        const fixed = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : raw;
        onChange(fixed);
      }}
    />
  );
}

export function PercentInput({ className = "input", value, onChange, placeholder = "20" }) {
  return (
    <input
      className={className}
      inputMode="decimal"
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "");
        const num = raw === "" ? "" : String(Math.min(1000, Math.max(0, Number(raw))));
        onChange(num);
      }}
    />
  );
}
