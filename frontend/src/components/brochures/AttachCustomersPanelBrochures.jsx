import AttachCustomersPanel from "../attach/AttachCustomerPanel.jsx";
import { api, qs } from "../../services/api";

export default function AttachCustomersPanelBrochure({ brochureId }) {
  const base = `/brochures/${brochureId}/attachments`;

  return (
    <AttachCustomersPanel
      listAttached={async () => {
        const data = await api(base); // GET /brochures/:id/attachments
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
