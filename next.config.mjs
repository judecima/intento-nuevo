/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "optionline-prod-files.s3.amazonaws.com"
      }
    ]
  }
};

export default nextConfig;
