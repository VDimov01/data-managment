export default function CustomerList({
  rows = [],
  page, limit, total, totalPages,
  onEdit, onDelete, onCopyLink, onInfo
}) {
  return (
    <div className="table-wrap">
      <table className="table table-hover table-tight">
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
              <td colSpan={9} className="center text-muted">Не са намерени клиенти.</td>
            </tr>
          )}

          {rows.map((r) => (
            <tr key={r.customer_id}>
              <td data-th='#'>{r.customer_id}</td>

              <td data-th='Име'>
                <div className="fw-600">
                  {r.display_name || r.company_name || (r.first_name || r.last_name ? `${r.first_name || ""} ${r.last_name || ""}` : "—")}
                </div>

                {r.customer_type === "Company" && r.company_name && (
                  <div className="text-muted">
                    Представител: {[r.rep_first_name, r.rep_middle_name, r.rep_last_name].filter(Boolean).join(" ") || "—"}
                  </div>
                )}
              </td>

              <td data-th='Тип клиент'>
                <span className={"badge " + (r.customer_type === "Company" ? "badge-company" : "badge-indiv")}>
                  {r.customer_type === "Company" ? "Фирма" : "Индивидуално лице"}
                </span>
              </td>

              <td data-th='Email'>{r.email || "—"}</td>

              <td data-th='Телефон'>
                {r.phone || r.secondary_phone || "—"}
                {r.phone && r.secondary_phone && <div className="text-muted">{r.secondary_phone}</div>}
              </td>

              <td data-th='Град'>{r.city || "—"}</td>
              <td data-th='Активен'>{r.is_active ? "Да" : "Не"}</td>

              <td data-th='UUID' className="cust-uuid mono">{r.public_uuid}</td>

              <td data-th='Действия'>
                <div className="btn-row">
                  <button className="btn btn-ghost" type="button" onClick={() => onInfo?.(r)} title="Информация">
                    ℹ
                  </button>
                  <button className="btn" type="button" onClick={() => onCopyLink?.(r)}>Копирай линк</button>
                  <button className="btn" type="button" onClick={() => onEdit?.(r)}>Редактирай</button>
                  <button className="btn btn-danger" type="button" onClick={() => onDelete?.(r)}>Изтрий</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr>
            <td colSpan={9} className="results">
              Показване {(rows.length === 0) ? 0 : (page - 1) * limit + 1} – {(page - 1) * limit + rows.length} от {total}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
