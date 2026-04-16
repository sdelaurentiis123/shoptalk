/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "200mb" },
    serverComponentsExternalPackages: [
      "ffmpeg-static",
      "ffprobe-static",
    ],
    outputFileTracingIncludes: {
      "/api/process-upload": ["./node_modules/ffmpeg-static/**/*", "./node_modules/ffprobe-static/**/*"],
      "/api/process-session": ["./node_modules/ffmpeg-static/**/*", "./node_modules/ffprobe-static/**/*"],
      "/api/cron/process-videos": ["./node_modules/ffmpeg-static/**/*", "./node_modules/ffprobe-static/**/*"],
      "/api/process-stale": ["./node_modules/ffmpeg-static/**/*", "./node_modules/ffprobe-static/**/*"],
    },
  },
};
module.exports = nextConfig;
