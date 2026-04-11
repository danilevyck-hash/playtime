import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'halqekrjfttpwoqtazjm.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: "fashion-group",
  project: "playtime",
  widenClientFileUpload: true,
  disableLogger: true,
});
