/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "200mb" },
    serverComponentsExternalPackages: [
      "ffmpeg-static",
      "ffprobe-static",
    ],
  },
};
module.exports = nextConfig;
