"""Serve the static site; refresh the page to pick up source changes."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
import threading

from build_site import PROJECT, SOURCE, build

output = SOURCE / "dist"
lock = threading.Lock()


def fingerprint():
    return tuple(
        (str(p), p.stat().st_mtime_ns)
        for root in (SOURCE / "src", SOURCE / "vendor", PROJECT / "answers")
        for p in sorted(root.rglob("*"))
        if p.is_file()
    ) + ((str(SOURCE / "index.html"), (SOURCE / "index.html").stat().st_mtime_ns),)


build(output)
previous = fingerprint()


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        global previous
        with lock:
            current = fingerprint()
            if current != previous:
                build(output)
                previous = current
        super().do_GET()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(output)))
print(f"Local: http://127.0.0.1:{port} — refresh after editing", flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    server.server_close()
