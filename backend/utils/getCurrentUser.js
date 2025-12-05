function getCurrentUserId(req) {
  // Основно: от JWT (requireAuth)
  if (req.user && req.user.sub) {
    const n = Number(req.user.sub);
    if (Number.isFinite(n) && n > 0) return n;
  }

  // По избор: fallback от header (ако някъде ти трябва)
  const hdr = req.headers['x-user-id'];
  if (hdr != null) {
    const n = Number(hdr);
    if (Number.isFinite(n) && n > 0) return n;
  }

  // Последен fallback – 1 (system/admin)
  return 1;
}

module.exports = {
    getCurrentUserId,
}