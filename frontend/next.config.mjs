/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/explore", destination: "/incidents", permanent: false },
      { source: "/monitor", destination: "/", permanent: false },
      { source: "/health", destination: "/", permanent: false },
      { source: "/errors", destination: "/incidents", permanent: false },
      { source: "/flame", destination: "/incidents", permanent: false },
      { source: "/service-map", destination: "/incidents", permanent: false },
      { source: "/facets", destination: "/", permanent: false },
      { source: "/diff", destination: "/", permanent: false },
      { source: "/live", destination: "/incidents", permanent: false },
    ];
  },
};

export default nextConfig;
