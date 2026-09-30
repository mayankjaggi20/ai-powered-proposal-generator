/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bundle the knowledge and config folders with the API functions on Vercel
  outputFileTracingIncludes: {
    "/api/**": ["./knowledge/**", "./config/**"],
  },
};
export default nextConfig;
