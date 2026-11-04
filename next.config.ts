import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  env: {
    // Base URL of the Django REST Framework backend.
    NEXT_PUBLIC_API_URL: `https://${process.env.NEXT_PUBLIC_API_URL}`,
  },
}

export default nextConfig
