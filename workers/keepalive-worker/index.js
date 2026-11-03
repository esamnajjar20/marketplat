export default {
  async scheduled(event, env, ctx) {
    const urlsString = env.KEEPALIVE_URLS || "";
    const urls = urlsString.split(',').map(url => url.trim()).filter(url => url.length > 0);
    
    if (urls.length === 0) {
      console.warn("[keepalive] ⚠️ No URLs configured");
      return;
    }

    console.log(`[keepalive] 🚀 Pinging ${urls.length} URLs...`);
    const requests = urls.map(url => 
      fetch(url)
        .then(r => console.log(`[keepalive] ✅ ${url} ->`, r.status))
        .catch(err => console.warn(`[keepalive] ❌ ${url} failed:`, err && err.message))
    );
    
    ctx.waitUntil(Promise.allSettled(requests));
  },
  
  async fetch(request, env) {
    const urlsString = env.KEEPALIVE_URLS || "⚠️ No URLs configured.";
    return new Response(`marketplat keepalive is running.\n\nURLs:\n${urlsString.replace(/,/g, '\n')}`, {
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
};
