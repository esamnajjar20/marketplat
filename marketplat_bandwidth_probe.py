#!/usr/bin/env python3
"""Measure MarketPlat API response transfer sizes using Python 3 + requests only.

This is a sequential, read-only probe. It does not create load and does not mutate data.
For Express-origin measurements, point --base-url at the direct API origin, not a
Cloudflare Worker. It requests gzip (or identity) and counts response body bytes
as transferred plus an estimate of HTTP response-header bytes.
"""
from __future__ import annotations
import argparse
import csv
import gzip
import json
import os
import statistics
import sys
import time
import zlib
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

try:
    import requests
except ImportError:
    print("Missing dependency: requests. Install with: python -m pip install requests", file=sys.stderr)
    raise SystemExit(2)

GIB = 1024 ** 3
DEFAULT_PATHS = [
    # Home page public endpoints
    ("home_static", "/api/v1/home/static"),
    ("home_root", "/api/v1/home/"),
    # Public entity listings
    ("ads_list", "/api/v1/ads?limit=12&page=1"),
    ("products_list", "/api/v1/products?limit=12&page=1"),
    ("stores_list", "/api/v1/stores?limit=10&page=1"),
    ("services_list", "/api/v1/service-listings?limit=10&page=1"),
    # Taxonomies / reference data
    ("categories", "/api/v1/categories"),
    ("product_categories", "/api/v1/product-categories"),
    ("service_categories", "/api/v1/service-categories"),
    ("service_types", "/api/v1/service-types"),
    ("store_types", "/api/v1/store-types"),
    # Other public discovery endpoints
    ("cross_search", "/api/v1/search?q=غزة&limit=10"),
]


def percentile(values, p):
    if not values:
        return 0
    s = sorted(values)
    if len(s) == 1:
        return s[0]
    pos = (len(s) - 1) * p
    lo = int(pos)
    hi = min(lo + 1, len(s) - 1)
    frac = pos - lo
    return int(s[lo] + (s[hi] - s[lo]) * frac)


def decoded_size(raw: bytes, encoding: str) -> int:
    enc = (encoding or "identity").lower().strip()
    try:
        if enc == "gzip":
            return len(gzip.decompress(raw))
        if enc == "deflate":
            try:
                return len(zlib.decompress(raw))
            except zlib.error:
                return len(zlib.decompress(raw, -zlib.MAX_WBITS))
        if enc in ("", "identity"):
            return len(raw)
    except Exception:
        pass
    # Unknown or malformed encoding: don't invent an expanded size.
    return len(raw)


def response_header_bytes(resp) -> int:
    # Approximation: status line + serialized response headers + CRLF terminator.
    # HTTP/2/3 header compression and TLS framing are not represented here.
    status_line = len(f"HTTP/1.1 {resp.status_code} {resp.reason}\r\n".encode("latin-1", "replace"))
    hdrs = sum(len(str(k).encode("latin-1", "replace")) + 2 +
               len(str(v).encode("latin-1", "replace")) + 2
               for k, v in resp.headers.items())
    return status_line + hdrs + 2


def main():
    ap = argparse.ArgumentParser(description="Measure MarketPlat API bandwidth per GET endpoint")
    ap.add_argument("--base-url", default=os.getenv("MARKETPLAT_API_BASE_URL", "https://marketplat.onrender.com"),
                    help="Direct Express origin URL (default: MARKETPLAT_API_BASE_URL or known Render origin)")
    ap.add_argument("--repeat", type=int, default=3, help="Samples per endpoint (default: 3)")
    ap.add_argument("--timeout", type=float, default=25, help="Per-request timeout seconds")
    ap.add_argument("--pause", type=float, default=0.25, help="Pause between requests; keep low impact")
    ap.add_argument("--encoding", choices=["gzip", "identity"], default="gzip",
                    help="Request compressed responses (default gzip) or identity")
    ap.add_argument("--token", default=os.getenv("MARKETPLAT_TOKEN"), help="Optional Bearer token for personal feed")
    ap.add_argument("--include-personal-feed", action="store_true", help="Also sample /home/feed (requires token)")
    ap.add_argument("--path", action="append", default=[], help="Additional GET path; can be repeated")
    ap.add_argument("--output-dir", default="marketplat-bandwidth-results")
    args = ap.parse_args()

    base = args.base_url.rstrip("/")
    parsed = urlparse(base)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        ap.error("--base-url must be an absolute http(s) URL")
    if args.repeat < 1 or args.repeat > 20:
        ap.error("--repeat must be between 1 and 20")

    host = parsed.hostname or ""
    if "workers.dev" in host or "cloudflare" in host:
        print("WARNING: target looks like an edge/proxy URL, not a direct Express origin.", file=sys.stderr)
    else:
        print("Target host:", host)

    paths = list(DEFAULT_PATHS)
    if args.include_personal_feed:
        if not args.token:
            ap.error("--include-personal-feed requires --token or MARKETPLAT_TOKEN")
        paths.append(("home_personal_feed", "/api/v1/home/feed"))
    for i, p in enumerate(args.path):
        paths.append((f"custom_{i+1}", p if p.startswith("/") else "/" + p))

    session = requests.Session()
    session.headers.update({
        "Accept": "application/json",
        "Accept-Encoding": "gzip" if args.encoding == "gzip" else "identity",
        "Cache-Control": "no-cache, no-store, max-age=0",
        "Pragma": "no-cache",
        "User-Agent": "MarketPlat-Bandwidth-Probe/1.0",
    })
    if args.token:
        session.headers["Authorization"] = "Bearer " + args.token

    rows = []
    started = datetime.now(timezone.utc).isoformat()
    print(f"\nMarketPlat bandwidth probe | {started}")
    print(f"Base URL: {base} | repeat={args.repeat} | encoding={args.encoding}")
    print("Read-only sequential requests; this is a measurement, not a load test.\n")

    for label, path in paths:
        for sample in range(1, args.repeat + 1):
            url = base + path
            t0 = time.perf_counter()
            try:
                resp = session.get(url, timeout=args.timeout, stream=True, allow_redirects=True)
                raw = resp.raw.read(decode_content=False)
                elapsed_ms = (time.perf_counter() - t0) * 1000
                wire_body = len(raw)
                expanded = decoded_size(raw, resp.headers.get("Content-Encoding", "identity"))
                hdr_bytes = response_header_bytes(resp)
                rows.append({
                    "endpoint": label, "path": path, "sample": sample,
                    "status": resp.status_code, "elapsed_ms": round(elapsed_ms, 2),
                    "wire_body_bytes": wire_body, "decoded_body_bytes": expanded,
                    "response_header_bytes_est": hdr_bytes,
                    "estimated_response_bytes": wire_body + hdr_bytes,
                    "content_encoding": resp.headers.get("Content-Encoding", "identity"),
                    "content_type": resp.headers.get("Content-Type", ""),
                    "cache_control": resp.headers.get("Cache-Control", ""),
                    "age": resp.headers.get("Age", ""),
                    "cf_cache_status": resp.headers.get("CF-Cache-Status", ""),
                    "x_proxy_cache": resp.headers.get("X-Proxy-Cache", ""),
                    "x_cache": resp.headers.get("X-Cache", ""),
                    "error": "",
                })
                resp.close()
                print(f"{label:22s} {resp.status_code:3d}  {wire_body:9,d} B body  "
                      f"{hdr_bytes:5,d} B hdr(est)  {elapsed_ms:8.1f} ms  "
                      f"enc={rows[-1]['content_encoding'] or 'identity'}")
            except requests.RequestException as exc:
                rows.append({"endpoint": label, "path": path, "sample": sample,
                             "status": 0, "elapsed_ms": 0, "wire_body_bytes": 0,
                             "decoded_body_bytes": 0, "response_header_bytes_est": 0,
                             "estimated_response_bytes": 0, "content_encoding": "",
                             "content_type": "", "cache_control": "", "age": "",
                             "cf_cache_status": "", "x_proxy_cache": "", "x_cache": "",
                             "error": str(exc)})
                print(f"{label:22s} ERROR {exc}", file=sys.stderr)
            time.sleep(max(0, args.pause))

    groups = defaultdict(list)
    for row in rows:
        if row["status"]:
            groups[row["endpoint"]].append(row)

    summary = []
    for label, path in paths:
        samples = groups.get(label, [])
        if not samples:
            continue
        wire = [r["wire_body_bytes"] for r in samples]
        decoded = [r["decoded_body_bytes"] for r in samples]
        total = [r["estimated_response_bytes"] for r in samples]
        statuses = sorted(set(r["status"] for r in samples))
        summary.append({
            "endpoint": label, "path": path, "samples_ok": len(samples),
            "statuses": statuses,
            "avg_wire_body_bytes": round(statistics.mean(wire)),
            "median_wire_body_bytes": round(statistics.median(wire)),
            "p95_wire_body_bytes": percentile(wire, .95),
            "avg_decoded_body_bytes": round(statistics.mean(decoded)),
            "avg_estimated_response_bytes": round(statistics.mean(total)),
            "avg_latency_ms": round(statistics.mean(r["elapsed_ms"] for r in samples), 2),
            "cache_indicators": sorted(set(
                (r["cf_cache_status"] or r["x_proxy_cache"] or r["x_cache"] or "not-reported")
                for r in samples)),
        })

    total_requests = len(rows)
    successful = [r for r in rows if r["status"]]
    total_wire = sum(r["wire_body_bytes"] for r in successful)
    total_est = sum(r["estimated_response_bytes"] for r in successful)
    avg_wire = total_wire / len(successful) if successful else 0
    avg_est = total_est / len(successful) if successful else 0
    budget_bytes = 5_000_000_000  # decimal 5 GB to match typical hosting quota notation
    budget_gib = 5 * GIB

    def request_count(budget, avg):
        return int(budget / avg) if avg > 0 else 0

    result = {
        "generated_at": started, "base_url": base, "encoding_requested": args.encoding,
        "repeat_per_endpoint": args.repeat, "requests_attempted": total_requests,
        "responses_received": len(successful), "errors": total_requests-len(successful),
        "measured_wire_body_bytes": total_wire,
        "measured_estimated_response_bytes_including_headers": total_est,
        "average_wire_body_bytes_per_response": round(avg_wire),
        "average_estimated_response_bytes_per_response": round(avg_est),
        "estimated_requests_per_5GB_decimal": request_count(budget_bytes, avg_est),
        "estimated_requests_per_5GiB": request_count(budget_gib, avg_est),
        "endpoint_summary": sorted(summary, key=lambda x: x["avg_estimated_response_bytes"], reverse=True),
        "samples": rows,
        "limitations": [
            "Sequential GET samples only; not a concurrency/load test.",
            "5GB estimates extrapolate the measured endpoint mix equally; change mix to match real usage.",
            "Response header bytes are approximate; HTTP/2/3 HPACK/QPACK and TLS framing are excluded.",
            "Direct-origin targeting bypasses Cloudflare edge cache only if the supplied host is truly the origin.",
            "Cache-Control request headers do not guarantee bypass of internal Redis/application caches.",
            "Upload traffic, request bodies, response streaming, retries and connection overhead are not included.",
        ],
    }

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    json_path = out / "bandwidth-results.json"
    csv_path = out / "bandwidth-samples.csv"
    md_path = out / "bandwidth-report.md"
    json_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    if rows:
        with csv_path.open("w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader(); writer.writerows(rows)

    md = ["# MarketPlat API Bandwidth Probe", "", f"- Target: `{base}`",
          f"- Generated: {started}", f"- Attempted requests: {total_requests}",
          f"- Responses: {len(successful)} | Errors: {total_requests-len(successful)}",
          f"- Mean transferred response estimate: **{avg_est:,.0f} bytes/request**",
          f"- Estimated requests per decimal 5 GB: **{request_count(budget_bytes, avg_est):,}**",
          f"- Estimated requests per 5 GiB: **{request_count(budget_gib, avg_est):,}**", "",
          "## Endpoint breakdown", "",
          "| Endpoint | Avg wire body | Avg response incl. header estimate | Avg latency | Status |",
          "|---|---:|---:|---:|---|"]
    for s in result["endpoint_summary"]:
        md.append(f"| `{s['endpoint']}` | {s['avg_wire_body_bytes']:,} B | "
                  f"{s['avg_estimated_response_bytes']:,} B | {s['avg_latency_ms']:.1f} ms | {s['statuses']} |")
    md += ["", "## Interpretation and limitations", "",
           "The 5 GB request count is a projection using the mean of the sampled endpoint mix. "
           "It is not a user count and should be recalculated with production traffic proportions.", ""]
    md += [f"- {x}" for x in result["limitations"]]
    md_path.write_text("\n".join(md), encoding="utf-8")

    print("\n=== SUMMARY ===")
    print(f"Responses: {len(successful)}/{total_requests}")
    print(f"Mean response (body + estimated headers): {avg_est:,.0f} bytes")
    print(f"Estimated requests / 5 GB: {request_count(budget_bytes, avg_est):,}")
    print(f"Estimated requests / 5 GiB: {request_count(budget_gib, avg_est):,}")
    print("Largest endpoints:")
    for s in result["endpoint_summary"][:5]:
        print(f"  {s['endpoint']:22s} {s['avg_estimated_response_bytes']:>10,d} B")
    print(f"\nSaved: {json_path}\n       {csv_path}\n       {md_path}")
    if len(successful) < total_requests:
        print("WARNING: Some requests failed; inspect CSV/JSON before trusting projections.", file=sys.stderr)

if __name__ == "__main__":
    main()
