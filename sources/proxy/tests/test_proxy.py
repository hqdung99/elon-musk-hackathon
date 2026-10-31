import gzip
import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

import azure.functions as func
import requests

with patch.dict(os.environ, {}, clear=True):
    import function_app as proxy


FAKE_HEADERS = {
    "SHOPEE_PROXY_AF_AC_ENC_DAT": "fake-enc",
    "SHOPEE_PROXY_COOKIE": "session=fake",
    "SHOPEE_PROXY_USER_AGENT": "Proxy-Test",
    "SHOPEE_PROXY_CSRF_TOKEN": "fake-csrf",
    "SHOPEE_PROXY_REFERER": "https://shopee.vn/product/123/456",
}


class FakeUpstream(BaseHTTPRequestHandler):
    def do_GET(self):
        self.respond()

    def do_POST(self):
        self.respond()

    do_PUT = do_POST
    do_PATCH = do_POST
    do_DELETE = do_POST
    do_OPTIONS = do_GET

    def do_HEAD(self):
        self.respond(head=True)

    def respond(self, head=False):
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        payload = json.dumps({
            "path": self.path,
            "method": self.command,
            "headers": dict(self.headers),
            "body": body.decode(),
        }).encode()
        status = 429 if self.path.startswith("/api/error") else 200
        if self.path.startswith("/api/redirect"):
            status = 302
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Set-Cookie", "upstream-session=secret")
        self.send_header("Connection", "close, X-Transport")
        self.send_header("X-Transport", "must-not-forward")
        self.send_header("X-Upstream", "preserved")
        if status == 429:
            self.send_header("Retry-After", "60")
        if status == 302:
            self.send_header("Location", "https://example.invalid/login")
        if self.path.startswith("/api/compressed"):
            payload = gzip.compress(payload)
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        if not head:
            self.wfile.write(payload)

    def log_message(self, format, *args):
        pass


class ProxyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeUpstream)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.origin = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, path, method="GET", body=b"", headers=None):
        request = func.HttpRequest(
            method=method,
            url=f"https://proxy.example/shopee-api/{path}",
            headers=headers or {},
            body=body,
        )
        with patch.object(proxy, "UPSTREAM", self.origin), patch.object(
            proxy, "UPSTREAM_HEADERS", proxy.load_headers(FAKE_HEADERS)
        ):
            return proxy.shopee_proxy(request)

    def test_path_query_method_body_and_header_overrides(self):
        response = self.request(
            "v4/pdp/cart_panel/select_variation_pc?keyword=iphone%2017&x=1&x=2",
            method="POST",
            body=b'{"quantity":2}',
            headers={
                "Host": "proxy.example",
                "Content-Type": "application/json",
                "Content-Length": "999",
                "af-ac-enc-dat": "client-enc",
                "Cookie": "client-cookie",
                "User-Agent": "client-agent",
                "X-CSRFToken": "client-csrf",
                "Referer": "https://client.example",
                "Authorization": "Bearer private-client-token",
                "x-functions-key": "private-function-key",
                "Connection": "keep-alive, X-Private",
                "X-Private": "must-not-forward",
                "X-Custom": "preserved",
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.get_body())
        self.assertEqual(
            payload["path"],
            "/api/v4/pdp/cart_panel/select_variation_pc?keyword=iphone%2017&x=1&x=2",
        )
        self.assertEqual(payload["method"], "POST")
        self.assertEqual(payload["body"], '{"quantity":2}')
        headers = {name.lower(): value for name, value in payload["headers"].items()}
        self.assertEqual(headers["host"], self.origin.removeprefix("http://"))
        self.assertEqual(headers["content-length"], str(len(b'{"quantity":2}')))
        self.assertEqual(headers["x-custom"], "preserved")
        for header, variable in proxy.HEADER_VARIABLES.items():
            self.assertEqual(headers[header], FAKE_HEADERS[variable])
        for name in ("authorization", "x-functions-key", "x-private"):
            self.assertNotIn(name, headers)

    def test_function_key_query_removed_without_reencoding_other_parameters(self):
        response = self.request(
            "search?q=a+b&%63ode=secret&x=%2F&code=other&x=2"
        )
        self.assertEqual(
            json.loads(response.get_body())["path"], "/api/search?q=a+b&x=%2F&x=2"
        )

    def test_upstream_errors_and_response_headers_preserved(self):
        response = self.request("error")
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers["retry-after"], "60")
        self.assertEqual(response.headers["x-upstream"], "preserved")
        self.assertEqual(response.headers["content-type"], "application/json")
        for name in (
            "set-cookie", "connection", "x-transport", "content-length",
            "content-encoding",
        ):
            self.assertNotIn(name, response.headers)

    def test_redirect_not_followed(self):
        response = self.request("redirect")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["location"], "https://example.invalid/login")

    def test_compressed_response_decoded(self):
        response = self.request("compressed")
        self.assertEqual(json.loads(response.get_body())["path"], "/api/compressed")
        self.assertNotIn("content-encoding", response.headers)
        self.assertNotIn("content-length", response.headers)

    def test_head_has_empty_body(self):
        response = self.request("search", method="HEAD")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_body(), b"")

    def test_remaining_methods_forwarded(self):
        for method in ("PUT", "PATCH", "DELETE", "OPTIONS"):
            with self.subTest(method=method):
                response = self.request("search", method=method, body=b"test-body")
                payload = json.loads(response.get_body())
                self.assertEqual(payload["method"], method)
                self.assertEqual(payload["body"], "test-body")

    def test_invalid_path_rejected_before_network(self):
        for path in ("../outside", "%2e%2e/outside", "v4/./search", "%5coutside"):
            with self.subTest(path=path), patch.object(
                requests.Session, "request"
            ) as send, self.assertLogs(level="WARNING"):
                response = self.request(path)
                self.assertEqual(response.status_code, 400)
                send.assert_not_called()

    def test_network_failures_are_explicit_and_do_not_log_secrets(self):
        for exception, status in (
            (requests.ConnectTimeout("secret-url"), 504),
            (requests.ReadTimeout("secret-cookie"), 504),
            (requests.ConnectionError("secret-header"), 502),
            (requests.exceptions.ContentDecodingError("secret-payload"), 502),
        ):
            with self.subTest(status=status), patch.object(
                requests.Session, "request", side_effect=exception
            ), self.assertLogs(level="ERROR") as logs:
                response = self.request("search")
                self.assertEqual(response.status_code, status)
                self.assertIn("error", json.loads(response.get_body()))
                self.assertNotIn("secret-", "".join(logs.output))
                self.assertEqual(response.headers["cache-control"], "no-store")


class ConfigurationTests(unittest.TestCase):
    def test_no_configuration_allowed(self):
        self.assertEqual(proxy.load_headers({}), {})

    def test_complete_configuration(self):
        self.assertEqual(
            proxy.load_headers(FAKE_HEADERS),
            {header: FAKE_HEADERS[name] for header, name in proxy.HEADER_VARIABLES.items()},
        )

    def test_incomplete_configuration_names_missing_settings_not_values(self):
        with self.assertRaises(ValueError) as raised:
            proxy.load_headers({"SHOPEE_PROXY_COOKIE": "secret-cookie"})
        self.assertIn("SHOPEE_PROXY_CSRF_TOKEN", str(raised.exception))
        self.assertIn("SHOPEE_PROXY_REFERER", str(raised.exception))
        self.assertNotIn("secret-cookie", str(raised.exception))

    def test_whitespace_is_missing(self):
        values = {**FAKE_HEADERS, "SHOPEE_PROXY_COOKIE": "  "}
        with self.assertRaisesRegex(ValueError, "Missing: SHOPEE_PROXY_COOKIE"):
            proxy.load_headers(values)

    def test_header_injection_rejected_without_logging_values(self):
        values = {**FAKE_HEADERS, "SHOPEE_PROXY_COOKIE": "secret\r\nX-Bad: injected"}
        with self.assertRaisesRegex(ValueError, "^Invalid Shopee proxy header: SHOPEE_PROXY_COOKIE$"):
            proxy.load_headers(values)

    def test_binding_requires_function_key_and_all_supported_methods(self):
        functions = proxy.app.get_functions()
        self.assertEqual(len(functions), 1)
        binding = json.loads(functions[0].get_function_json())["bindings"][0]
        self.assertEqual(binding["authLevel"].lower(), "function")
        self.assertEqual(binding["route"], "shopee-api/{*path}")
        self.assertEqual(
            {method.upper() for method in binding["methods"]},
            {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
        )
        with open("host.json", encoding="utf-8") as settings:
            self.assertEqual(json.load(settings)["extensions"]["http"]["routePrefix"], "")


if __name__ == "__main__":
    unittest.main()
