import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  outputFileTracingIncludes: {
    "/api/migrate": ["./supabase/migrations/**/*.sql"],
  },
};

export default nextConfig;
