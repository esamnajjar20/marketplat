// The eslint rule @typescript-eslint/ban-ts-comment prefers @ts-expect-error
// over @ts-ignore because the latter silently swallows ALL errors on the
// following line. Here we specifically cannot use @ts-expect-error: this
// file is compiled in two environments — locally on Termux (where the
// package is not installed, so the import errors and @ts-expect-error
// would work) and on Cloudflare (where the package IS installed, so the
// import is clean and @ts-expect-error would itself fail with "unused
// expect-error"). Silence the rule instead, with the reasoning captured
// here rather than in a code comment far from the rule's own message.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Package installed on Cloudflare but not locally (Termux ARM64)
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
