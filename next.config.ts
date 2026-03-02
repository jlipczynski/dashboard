import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/migrate": ["./supabase/migrations/**/*.sql"],
  },
};

export default nextConfig;
