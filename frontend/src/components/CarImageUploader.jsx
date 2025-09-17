// EditionImageUploader.jsx
import { useEffect, useState } from "react";

export default function EditionImageUploader({
  apiBase = "http://localhost:5000",
  editionId,
  makeName,
  modelName,
  modelYear,
  editionName,
}) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [images, setImages] = useState([]);
  const [part, setPart] = useState("main"); // main | exterior | interior
  
  // Replace "-" with space, collapse extra spaces, then URL-encode
  const safe = (s) =>
    encodeURIComponent(
      String(s ?? "")
        .trim()
        .replace(/-/g, " ")
        .replace(/\s+/g, " ")
  );

  // const unslug = (s) => String(s ?? "").replace(/-/g, " ");

  const fetchImages = async () => {
    if (!editionId) return;
    try {
      const r = await fetch(`${apiBase}/api/car-images/${editionId}-${safe(makeName)}-${safe(modelName)}-${safe(modelYear)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setImages(Array.isArray(data?.images) ? data.images : []);
    } catch (e) {
      console.error("Error fetching edition images:", e);
    }
  };

  const handleUpload = async () => {
    if (!editionId || !part) {
      alert("Pick an edition and image type (part).");
      return;
    }
    const formData = new FormData();
    selectedFiles.forEach((file) => formData.append("images", file));

    // Path scheme similar to your car-images approach, but for editions:
    // /api/edition-images/:editionId^:make^:model^:editionName^:part
    const url = `${apiBase}/api/car-images/${editionId}-${safe(makeName)}-${safe(modelName)}-${safe(modelYear)}-${safe(part)}`;

    try {
      const res = await fetch(url, { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        console.error("Upload failed:", data);
        alert(data?.error || "Upload failed");
        return;
      }
      alert("Upload successful");
      setSelectedFiles([]);
      fetchImages();
    } catch (e) {
      console.error("Upload error:", e);
      alert("Network error while uploading");
    }
  };

  async function deleteImage(id) {
  if (!window.confirm('Delete this image? This cannot be undone.')) return;
  try {
    const r = await fetch(`${apiBase}/api/car-images/${id}`, { method: 'DELETE' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return alert(data?.error || 'Delete failed');
    // refresh list
    fetchImages();
  } catch (e) {
    console.error(e); alert('Network error while deleting');
  }
}


  useEffect(() => {
    fetchImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editionId]);

  const groups = {
    main: images.filter((i) => i.part === "main"),
    exterior: images.filter((i) => i.part === "exterior"),
    interior: images.filter((i) => i.part === "interior"),
  };

  return (
    <div style={{ borderTop: "1px solid #eee", marginTop: 16, paddingTop: 12 }}>
      <h3 style={{ margin: 0, marginBottom: 8 }}>Edition images</h3>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
        <label>
          Тип изображение:
          <select value={part} onChange={(e) => setPart(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="main">Основна снимка</option>
            <option value="exterior">Екстериор</option>
            <option value="interior">Интериор</option>
          </select>
        </label>

        <input type="file" multiple onChange={(e) => setSelectedFiles([...e.target.files])} />
        <button type="button" onClick={handleUpload}>Качи</button>
      </div>

      {/* Preview groups */}
      {groups.main.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <h4>Основна снимка</h4>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {groups.main.map((img) => (
  <div key={img.id} style={{ position: 'relative' }}>
    <img src={img.image_url} alt="main" width="120" />
    <button
      type="button"
      onClick={() => deleteImage(img.id)}
      style={{
        position: 'absolute', top: 2, right: 2,
        background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
        borderRadius: 4, padding: '2px 6px', cursor: 'pointer'
      }}
      title="Delete image"
    >
      ×
    </button>
  </div>
))}
          </div>
        </div>
      )}

      {groups.exterior.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <h4>Външни снимки</h4>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {groups.exterior.map((img) => (
  <div key={img.id} style={{ position: 'relative' }}>
    <img src={img.image_url} alt="exterior" width="120" />
    <button
      type="button"
      onClick={() => deleteImage(img.id)}
      style={{
        position: 'absolute', top: 2, right: 2,
        background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
        borderRadius: 4, padding: '2px 6px', cursor: 'pointer'
      }}
      title="Delete image"
    >
      ×
    </button>
  </div>
))}
          </div>
        </div>
      )}

      {groups.interior.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <h4>Вътрешни снимки</h4>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {groups.interior.map((img) => (
  <div key={img.id} style={{ position: 'relative' }}>
    <img src={img.image_url} alt="interior" width="120" />
    <button
      type="button"
      onClick={() => deleteImage(img.id)}
      style={{
        position: 'absolute', top: 2, right: 2,
        background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
        borderRadius: 4, padding: '2px 6px', cursor: 'pointer'
      }}
      title="Delete image"
    >
      ×
    </button>
  </div>
))}
          </div>
        </div>
      )}
    </div>
  );
}
