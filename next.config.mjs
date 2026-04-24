/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /** Evita que webpack empaquete drivers nativos (exports de mongodb rompen el bundle). */
  webpack: (config, { isServer }) => {
    if (isServer) {
      const prev = config.externals;
      config.externals = [
        ...(Array.isArray(prev) ? prev : prev != null ? [prev] : []),
        "mongodb",
        "multer",
        "express",
        "bcryptjs",
        "cookie",
        "cors",
        "fast-xml-parser",
      ];
    }
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/store-media/:path*",
        destination: "/api/store-media/:path*",
      },
    ];
  },
};

export default nextConfig;
