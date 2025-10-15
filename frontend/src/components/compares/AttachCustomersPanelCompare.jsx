import AttachCustomersPanel from "../attach/AttachCustomerPanel.jsx";
import { api, qs } from "../../services/api";

/**
 * If your compare API already mirrors brochures (…/attachments),
 * this wrapper works as-is. If not, adapt endpoints here ONLY.
 */
export default function AttachCustomersPanelCompare({ compareId }) {
  const base = `/compares/${compareId}/attach`;

  return (
    <AttachCustomersPanel
      listAttached={async () => {
        const data = await api(base); // make your server support this if it doesn't yet
        return Array.isArray(data) ? data : (data?.items || []);
      }}
      searchCustomers={async (term) => {
        const data = await api(`/customers${qs({ q: term, page: 1, limit: 10 })}`);
        return data?.customers ?? data?.items ?? (Array.isArray(data) ? data : []);
      }}
      attachToCustomer={async (customer_id) => {
        await api(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: { customer_id, is_visible: 1 },
        });
      }}
      detachFromCustomer={async (customer_id) => {
        await api(`${base}/${customer_id}`, { method: "DELETE" });
      }}
    />
  );
}
