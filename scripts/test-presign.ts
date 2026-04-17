import { presignGet } from "../lib/r2";

async function main() {
  const url = await presignGet("_bin/ffmpeg-linux-x64", 300);
  console.log("URL length:", url.length);

  // Test range request (first 1KB)
  const res = await fetch(url, { headers: { Range: "bytes=0-1023" } });
  console.log("Range GET status:", res.status);
  console.log("Content-Range:", res.headers.get("content-range"));
  console.log("Accept-Ranges:", res.headers.get("accept-ranges"));
  console.log("Content-Length:", res.headers.get("content-length"));

  // Now test: can ffprobe read duration from the URL directly?
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const exec = promisify(execFile);

  // Presign an actual video file if one exists
  try {
    // Use a known storage path from a recent upload
    const videoUrl = await presignGet("132576c4-c27a-4728-8905-9710efbfd2e9/chunks/a2485204-fcc3-4076-aa66-cb8031221aa2_0.mp4", 300);
    console.log("\n--- ffprobe from URL ---");
    const t = Date.now();
    const { stdout } = await exec("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      videoUrl,
    ]);
    const info = JSON.parse(stdout);
    console.log("Duration:", info.format?.duration, "seconds");
    console.log("ffprobe time:", Date.now() - t, "ms");
  } catch (e: any) {
    console.log("ffprobe URL test failed:", e.message?.slice(0, 200));
  }
}

main().catch(console.error);
