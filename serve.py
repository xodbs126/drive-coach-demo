"""Local preview server for the mockup.

`python -m http.server` takes MIME types from the OS. On some Windows PCs the
registry maps .js to text/plain, and browsers may keep stale copies of edited
files. This server pins the types the site needs, listens
on IPv4 and IPv6 (so http://localhost reaches it), refuses to share a port
that is already in use, and disables caching so edits show up on reload.

usage: python serve.py [port]   (default 8000)
"""
import http.server
import socket
import sys

TYPES = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **TYPES}

    def guess_type(self, path):
        for ext, mime in TYPES.items():
            if str(path).lower().endswith(ext):
                return mime
        return super().guess_type(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class Server(http.server.ThreadingHTTPServer):
    address_family = socket.AF_INET6
    allow_reuse_address = False  # on Windows reuse lets two servers share a port silently

    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)  # also accept IPv4
        except (AttributeError, OSError):
            pass
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    try:
        httpd = Server(("::", port), Handler)
    except OSError as e:
        sys.exit(f"포트 {port}을(를) 쓸 수 없어요 ({e}). 이미 켜 둔 서버를 끄거나 다른 포트로 실행해 주세요: python serve.py 8001")
    print(f"Drive Coach mockup: http://localhost:{port}")
    httpd.serve_forever()
