// @ts-expect-error - Package not installed locally (Termux ARM64 limitation), but works on Cloudflare
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
