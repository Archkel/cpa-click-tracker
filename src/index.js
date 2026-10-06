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

      const rawOffer = await env.OFFER_REGISTRY.get(`offer:${offerId}`);

      if (!rawOffer) {
        return Response.json({ error: "offer_not_found" }, { status: 404 });
      }

      let offer;

      try {
        offer = JSON.parse(rawOffer);
      } catch {
        return Response.json({ error: "offer_registry_invalid" }, { status: 500 });
      }

      if (offer.status !== "ready_for_human_approval") {
        return Response.json({ error: "offer_not_active" }, { status: 404 });
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
