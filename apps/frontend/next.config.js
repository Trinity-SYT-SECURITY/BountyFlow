/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Get backend URL from environment variable or default value
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8002';
    console.log('🔧 Next.js rewrites: Backend URL =', backendUrl);
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
