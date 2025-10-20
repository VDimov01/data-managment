// Offer statuses → BG labels
export const STATUS_TO_BG = {
  draft:     "Чернова",
  issued:    "Издадена",
  revised:   "За редакция",
  accepted:  "Приета",
  rejected:  "Отхвърлена",
  expired:   "Изтекла",
  withdrawn: "Оттеглена",
  converted: "Конвертирана",
};

export function statusToBG(status) {
  const key = String(status || "").toLowerCase();
  return STATUS_TO_BG[key] || status || "—";
}
