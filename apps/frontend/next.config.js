/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Get backend URL from environment variable or default value
    // 127.0.0.1 rather than localhost: on hosts where localhost resolves to ::1
    // first, the proxy gets ECONNREFUSED because uvicorn binds IPv4 only, and
    // every page then fails with a 500 that looks like an empty database.
    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8002';
    console.log('🔧 Next.js rewrites: Backend URL =', backendUrl);
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        // the header's connection indicator polls this; proxying it keeps the
        // check same-origin so it works when the browser is on another host
        source: '/health',
        destination: `${backendUrl}/health`,
      },
    ];
  },
};

module.exports = nextConfig;
