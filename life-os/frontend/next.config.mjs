/** @type {import('next').NextConfig} */
const nextConfig = {
  // Production build 出 static files，俾 FastAPI serve
  output: "export",
  // 圖片優化喺 static export 時要關
  images: {
    unoptimized: true,
  },
  // 開發時 proxy /api 去 backend
  async rewrites() {
    if (process.env.NODE_ENV === "development") {
      return [
        {
          source: "/api/:path*",
          destination: `http://localhost:${process.env.BACKEND_PORT || "5100"}/api/:path*`,
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
