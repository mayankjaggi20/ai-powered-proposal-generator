/** @type {import('next').NextConfig} */
const nextConfig = {
  // Make sure the knowledge folder is bundled with the API functions on Vercel
  outputFileTracingIncludes: {
    "/api/**": ["./knowledge/**"],
  },
};
export default nextConfig;
