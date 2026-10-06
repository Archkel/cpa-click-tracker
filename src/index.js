export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    if (url.pathname.startsWith("/click/")) {
      const offerId = url.pathname.split("/")[2];

      if (!/^\d+$/.test(offerId)) {
        return Response.json({ error: "invalid_offer_id" }, { status: 400 });
      }

      const offers = {
        "5542950": {
          tracking_url:
            "https://www.cdnflyer.com/view.php?id=5542950&pub=3363954"
        }
      };

      const offer = offers[offerId];

      if (!offer) {
        return Response.json({ error: "offer_not_found" }, { status: 404 });
      }

      const trackingUrl = offer.tracking_url;

      if (!trackingUrl) {
        return Response.json(
          { error: "tracking_url_missing" },
          { status: 400 }
        );
      }

      const event = {
        offer_id: Number(offerId),
        timestamp: new Date().toISOString(),
        referrer: request.headers.get("Referer"),
        user_agent: request.headers.get("User-Agent")
      };

      if (env.CLICK_LOG) {
        await env.CLICK_LOG.put(
          `${offerId}:${crypto.randomUUID()}`,
          JSON.stringify(event)
        );
      }

      return Response.redirect(trackingUrl, 302);
    }

    return Response.json({ error: "not_found" }, { status: 404 });
  }
};
