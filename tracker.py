import json
from pathlib import Path
from urllib.parse import urlparse

QUEUE = Path.home() / "cpa_bot/data/campaign_queue.json"

def load_queue():
    with open(QUEUE) as f:
        return json.load(f)

def get_offer(offer_id):
    for offer in load_queue():
        if int(offer.get("offer_id", 0)) == int(offer_id):
            return offer
    return None

def validate_offer(offer):
    url = offer.get("tracking_url")

    if not url:
        return False, "tracking_url_missing"

    parsed = urlparse(url)

    if parsed.scheme not in ("http", "https"):
        return False, "invalid_tracking_url"

    return True, url

if __name__ == "__main__":
    print("CPA click-tracker deployment package")
    print("Queue:", QUEUE)
