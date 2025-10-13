export default function CustomerList({
  rows = [],
  page, limit, total, totalPages,
  onEdit, onDelete, onCopyLink
}) {
  return (
    <div className="cust-table-wrap">
      <table className="cust-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Име / Компания</th>
            <th>Тип клиент</th>
            <th>Email</th>
            <th>Телефон</th>
            <th>Град</th>
            <th>Активен</th>
            <th>UUID</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="cust-empty">Не са намерени клиенти.</td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.customer_id}>
              <td>{r.customer_id}</td>
              <td>
                <div className="cust-name">{r.display_name || r.company_name || (r.first_name || r.last_name ? `${r.first_name || ""} ${r.last_name || ""}` : "—")}</div>
                {r.customer_type === "Company" && r.company_name && (
                  <div className="cust-sub">
                    Представител: { [r.rep_first_name, r.rep_middle_name, r.rep_last_name].filter(Boolean).join(" ") || "—"}
                  </div>
                )}
              </td>
              <td><span className={`badge ${r.customer_type === "Company" ? "badge-company" : "badge-indiv"}`}>{r.customer_type === "Company" ? "Фирма" : "Индивидуално лице"}</span></td>
              <td>{r.email || "—"}</td>
              <td>
                {r.phone || r.secondary_phone || "—"}
                {r.phone && r.secondary_phone && <div className="cust-sub">{r.secondary_phone}</div>}
              </td>
              <td>{r.city || "—"}</td>
              <td>{r.is_active ? "Да" : "Не"}</td>
              <td className="cust-uuid">{r.public_uuid}</td>
              <td>
                <div className="cust-actions">
                  <button className="cust-btn" onClick={() => onCopyLink?.(r)}>Копирай линк</button>
                  <button className="cust-btn" onClick={() => onEdit?.(r)}>Редактирай</button>
                  <button className="cust-btn danger" onClick={() => onDelete?.(r)}>Изтрий</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={9} className="cust-foot">
              Показване {(rows.length === 0) ? 0 : (page - 1) * limit + 1} – {(page - 1) * limit + rows.length} от {total}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
