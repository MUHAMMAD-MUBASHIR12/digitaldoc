import threading
import time
import urllib.request

def _ping():
    while True:
        try:
            urllib.request.urlopen(
                "https://digitaldoc-api.onrender.com/",
                timeout=10
            )
        except Exception:
            pass
        time.sleep(840)

def start_keep_alive():
    t = threading.Thread(target=_ping, daemon=True)
    t.start()
