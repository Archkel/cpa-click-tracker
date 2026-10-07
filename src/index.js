export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        service: "cpa-click-tracker"
      });
    }

    /*
     * CPAlead conversion postback.
     *
     * Expected CPAlead macros:
     * subid
     * lead_id
     * campaign_id
     * campaign_name
     * payout
     * password
     * event_key
     * event_name
     */
    if (url.pathname === "/postback/cpalead") {
      if (request.method !== "GET") {
        return Response.json(
          { error: "method_not_allowed" },
          { status: 405 }
        );
      }

      const password = url.searchParams.get("password") || "";
      const expectedPassword = env.POSTBACK_PASSWORD || "";

      if (!expectedPassword) {
        return Response.json(
          { error: "postback_not_configured" },
          { status: 503 }
        );
      }

      if (password !== expectedPassword) {
        return Response.json(
          { error: "unauthorized" },
          { status: 401 }
        );
      }

      const subid = url.searchParams.get("subid") || "";
      const leadId = url.searchParams.get("lead_id") || "";
      const campaignId = url.searchParams.get("campaign_id") || "";
      const campaignName = url.searchParams.get("campaign_name") || "";
      const payoutRaw = url.searchParams.get("payout") || "0";
      const eventKey = url.searchParams.get("event_key") || "";
      const eventName = url.searchParams.get("event_name") || "";

      if (!subid || !leadId || !campaignId) {
        return Response.json(
          {
            error: "missing_required_fields",
            required: ["subid", "lead_id", "campaign_id"]
          },
          { status: 400 }
        );
      }

      const payout = Number(payoutRaw);

      if (!Number.isFinite(payout) || payout < 0) {
        return Response.json(
          { error: "invalid_payout" },
          { status: 400 }
        );
      }

      if (!env.CLICK_LOG) {
        return Response.json(
          { error: "click_log_not_configured" },
          { status: 503 }
        );
      }

      /*
       * CPAlead may retry the same conversion.
       * lead_id is the unique conversion identifier.
       */
      const conversionKey = `conversion:${leadId}`;
      const existing = await env.CLICK_LOG.get(conversionKey);

      if (existing) {
        return Response.json({
          status: "already_recorded",
          lead_id: leadId
        });
      }

      /*
       * Match the CPAlead subid back to the original click.
       */
      const clickRaw = await env.CLICK_LOG.get(`click:${subid}`);

      let click = null;

      if (clickRaw) {
        try {
          click = JSON.parse(clickRaw);
        } catch {
          click = null;
        }
      }

      const conversion = {
        type: "conversion",
        lead_id: leadId,
        subid,
        offer_id: click?.offer_id ?? null,
        campaign_id: Number(campaignId),
        campaign_name: campaignName,
        payout,
        event_key: eventKey,
        event_name: eventName,
        click_found: Boolean(click),
        timestamp: new Date().toISOString()
      };

      await env.CLICK_LOG.put(
        conversionKey,
        JSON.stringify(conversion)
      );

      return Response.json({
        status: "recorded",
        lead_id: leadId,
        subid,
        offer_id: click?.offer_id ?? null,
        payout
      });
    }

    /*
     * EXISTING CLICK TRACKER
     *
     * Preserves:
     * - offer validation
     * - OFFER_REGISTRY
     * - CLICK_LOG
     * - 302 redirect
     *
     * Adds:
     * - unique click reference
     * - CPAlead subid
     * - direct click-to-conversion attribution
     */
    if (url.pathname.startsWith("/click/")) {
      const offerId = url.pathname.split("/")[2];

      if (!/^\d+$/.test(offerId)) {
        return Response.json(
          { error: "invalid_offer_id" },
          { status: 400 }
        );
      }

      const rawOffer = await env.OFFER_REGISTRY.get(`offer:${offerId}`);

      if (!rawOffer) {
        return Response.json(
          { error: "offer_not_found" },
          { status: 404 }
        );
      }

      let offer;

      try {
        offer = JSON.parse(rawOffer);
      } catch {
        return Response.json(
          { error: "offer_registry_invalid" },
          { status: 500 }
        );
      }

      if (offer.status !== "ready_for_human_approval") {
        return Response.json(
          { error: "offer_not_active" },
          { status: 404 }
        );
      }

      const trackingUrl = offer.tracking_url;

      if (!trackingUrl) {
        return Response.json(
          { error: "tracking_url_missing" },
          { status: 400 }
        );
      }

      const clickRef = crypto.randomUUID();

      const event = {
        type: "click",
        offer_id: Number(offerId),
        click_ref: clickRef,
        timestamp: new Date().toISOString(),
        referrer: request.headers.get("Referer"),
        user_agent: request.headers.get("User-Agent")
      };

      /*
       * Preserve the existing offer-scoped click record.
       */
      await env.CLICK_LOG.put(
        `${offerId}:${clickRef}`,
        JSON.stringify(event)
      );

      /*
       * Add direct lookup by subid so a later CPAlead
       * conversion can be matched to this exact click.
       */
      await env.CLICK_LOG.put(
        `click:${clickRef}`,
        JSON.stringify(event)
      );

      /*
       * Preserve the CPA tracking URL and append subid.
       */
      const outbound = new URL(trackingUrl);
      outbound.searchParams.set("subid", clickRef);

      return Response.redirect(
        outbound.toString(),
        302
      );
    }

    return Response.json(
      { error: "not_found" },
      { status: 404 }
    );
  }
};
