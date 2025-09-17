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
            <th>Name / Company</th>
            <th>Type</th>
            <th>Email</th>
            <th>Phone</th>
            <th>City</th>
            <th>Active</th>
            <th>UUID</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="cust-empty">No customers found.</td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.customer_id}>
              <td>{r.customer_id}</td>
              <td>
                <div className="cust-name">{r.display_name || r.company_name || (r.first_name || r.last_name ? `${r.first_name || ""} ${r.last_name || ""}` : "—")}</div>
                {r.customer_type === "Company" && r.company_name && (
                  <div className="cust-sub">
                    Rep: { [r.rep_first_name, r.rep_middle_name, r.rep_last_name].filter(Boolean).join(" ") || "—"}
                  </div>
                )}
              </td>
              <td><span className={`badge ${r.customer_type === "Company" ? "badge-company" : "badge-indiv"}`}>{r.customer_type}</span></td>
              <td>{r.email || "—"}</td>
              <td>
                {r.phone || r.secondary_phone || "—"}
                {r.phone && r.secondary_phone && <div className="cust-sub">{r.secondary_phone}</div>}
              </td>
              <td>{r.city || "—"}</td>
              <td>{r.is_active ? "Yes" : "No"}</td>
              <td className="cust-uuid">{r.public_uuid}</td>
              <td>
                <div className="cust-actions">
                  <button className="cust-btn" onClick={() => onCopyLink?.(r)}>Copy Link</button>
                  <button className="cust-btn" onClick={() => onEdit?.(r)}>Edit</button>
                  <button className="cust-btn danger" onClick={() => onDelete?.(r)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={9} className="cust-foot">
              Showing {(rows.length === 0) ? 0 : (page - 1) * limit + 1} – {(page - 1) * limit + rows.length} of {total}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
