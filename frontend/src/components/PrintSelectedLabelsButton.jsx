// src/components/PrintSelectedLabelsButton.jsx
export default function PrintSelectedLabelsButton({ apiBase = 'http://localhost:5000', selectedIds = [] }) {
  const href = `${apiBase}/api/labels/vehicles.pdf?ids=${selectedIds.join(',')}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      <button>Print selected ({selectedIds.length})</button>
    </a>
  );
}
