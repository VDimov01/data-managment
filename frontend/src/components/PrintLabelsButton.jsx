// src/components/PrintLabelsButton.jsx
export default function PrintLabelsButton({ apiBase = 'http://localhost:5000', shopId, shopName, status = 'Available' }) {
  const href = `${apiBase}/api/labels/vehicles.pdf?shop_id=${shopId || ''}&status=${encodeURIComponent(status)}`;
  return (
    <a href={href} key={shopId} target="_blank" rel="noopener noreferrer">
      <button>Print labels ({shopName || 'all'})</button>
    </a>
  );
}
