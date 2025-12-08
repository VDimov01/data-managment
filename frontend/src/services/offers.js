// frontend/src/services/offers.js
import { api, qs } from './api';

export const Offers = {
  // list offers
  async list({ term, status, limit = 25, offset = 0, clientUuid } = {}) {
    return api(`/offers${qs({ term, status, limit, offset, client_uuid: clientUuid })}`);
  },

  // create draft
  async createDraft(payload = {}) {
    return api('/offers', { method: 'POST', body: payload });
  },

  // get one offer by uuid
  async get(uuid) {
    return api(`/offers/${uuid}`);
  },

  // update draft fields (customer_id, currency, vat_rate, valid_until, notes_public, notes_internal, discount_amount)
  async update(uuid, patch) {
    return api(`/offers/${uuid}`, { method: 'PUT', body: patch });
  },

  // lines
  async addVehicleLine(uuid, { vehicle_id, quantity, unit_price, description, metadata_json }) {
    return api(`/offers/${uuid}/items`, {
      method: 'POST',
      body: { vehicle_id, quantity, unit_price, description, metadata_json }
    });
  },
  async updateLine(uuid, lineNo, patch) {
    return api(`/offers/${uuid}/items/${lineNo}`, { method: 'PUT', body: patch });
  },
  async deleteLine(uuid, lineNo) {
    return api(`/offers/${uuid}/items/${lineNo}`, { method: 'DELETE' });
  },

  // PDFs
  async renderDraftPdf(uuid) {
    return api(`/offers/${uuid}/render-draft`, { method: 'POST' });
  },
  async issue(uuid) {
    return api(`/offers/${uuid}/issue`, { method: 'POST' });
  },
  async getSignedUrl(uuid, version_no, { minutes = 10 } = {}) {
    return api(`/offers/${uuid}/pdfs/${version_no}/signed-url${qs({ minutes })}`);
  },
};

// customers (search), matches the searchCustomers endpoint we sketched earlier
export const Customers = {
  async search(q) {
    if (!q || !q.trim()) return [];
    return api(`/customers/search${qs({ q })}`);
  }
};

// vehicles (search) – adapt path to whatever you already have
export const Vehicles = {
  async search(q) {
    if (!q || !q.trim()) return [];
    // If your existing endpoint differs, change it here:
    return api(`/vehicles/search${qs({ q })}`);
  }
};
