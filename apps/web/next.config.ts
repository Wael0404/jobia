import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  transpilePackages: ["@jobia/api-client", "@jobia/shared"],
  poweredByHeader: false,
  /**
   * Optional same-origin API: with API_INTERNAL_URL set (and NEXT_PUBLIC_API_URL=""), the browser calls
   * /v1/* on the web origin and Next.js forwards to the API. Useful behind a single public port.
   */
  async rewrites() {
    const api = process.env.API_INTERNAL_URL;
    return api ? [{ source: "/v1/:path*", destination: `${api}/v1/:path*` }] : [];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default config;
