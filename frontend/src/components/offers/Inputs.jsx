// frontend/src/components/offers/Inputs.jsx
import React from "react";

// unchanged behaviour, just forward extra DOM props to <input/>
export function MoneyInput({ value, onChange, placeholder, className, disabled, ...rest }) {
  return (
    <input
      {...rest}
      className={className || "input"}
      disabled={disabled}
      inputMode="decimal"
      placeholder={placeholder || "0.00"}
      value={value}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "");
        const parts = raw.split(".");
        const fixed = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : raw;
        onChange(fixed);
      }}
    />
  );
}

export function PercentInput({ value, onChange, placeholder, className, disabled, ...rest }) {
  return (
    <input
      {...rest}
      className={className || "input"}
      disabled={disabled}
      inputMode="decimal"
      placeholder={placeholder || "0"}
      value={value}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "");
        const num = raw === "" ? "" : String(Math.min(1000, Math.max(0, Number(raw))));
        onChange(num);
      }}
    />
  );
}
