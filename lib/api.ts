// Base URL for the Django REST Framework backend.
// Set VITE_API_URL at build time (e.g. in Vercel's environment settings).
// localhost is only a fallback for local dev; deployed builds must set it.
export const API_URL =
  import.meta.env.VITE_API_URL
