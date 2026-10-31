"""Azure Functions equivalent of Musk's server-side Shopee proxy."""

import json
import logging
import os
from collections.abc import Mapping
from urllib.parse import unquote, unquote_plus, urlsplit

import azure.functions as func
import requests


HEADER_VARIABLES = {
    "af-ac-enc-dat": "SHOPEE_PROXY_AF_AC_ENC_DAT",
    "cookie": "SHOPEE_PROXY_COOKIE",
    "user-agent": "SHOPEE_PROXY_USER_AGENT",
    "x-csrftoken": "SHOPEE_PROXY_CSRF_TOKEN",
    "referer": "SHOPEE_PROXY_REFERER",
}
HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}
UPSTREAM = "https://shopee.vn"
TIMEOUT = (5, 30)


def load_headers(environment: Mapping[str, str]) -> dict[str, str]:
    missing = [
        name for name in HEADER_VARIABLES.values()
        if not environment.get(name, "").strip()
    ]
    if missing and len(missing) != len(HEADER_VARIABLES):
        raise ValueError(
            f"Incomplete Shopee proxy configuration. Missing: {', '.join(missing)}"
        )
    headers = {} if missing else {
        header: environment[name] for header, name in HEADER_VARIABLES.items()
    }
    for header, value in headers.items():
        if "\r" in value or "\n" in value:
            raise ValueError(f"Invalid Shopee proxy header: {HEADER_VARIABLES[header]}")
    return headers


def filtered_headers(
    headers: Mapping[str, str], excluded: set[str]
) -> dict[str, str]:
    connection = next(
        (value for name, value in headers.items() if name.lower() == "connection"),
        "",
    )
    blocked = HOP_BY_HOP | excluded | {
        token.strip().lower() for token in connection.split(",")
    }
    return {
        name.lower(): value
        for name, value in headers.items()
        if name.lower() not in blocked
    }


def upstream_url(request_url: str) -> str:
    parsed = urlsplit(request_url)
    prefix = "/shopee-api/"
    if not parsed.path.startswith(prefix):
        raise ValueError("Expected a /shopee-api/ path.")
    path = parsed.path[len(prefix):]
    # Requests normalizes dot segments; do not let them escape the /api/ prefix.
    decoded = unquote(path)
    if "\\" in decoded or any(part in {".", ".."} for part in decoded.split("/")):
        raise ValueError("Invalid proxy path.")
    query = "&".join(
        pair for pair in parsed.query.split("&")
        if unquote_plus(pair.partition("=")[0]).lower() != "code"
    )
    return f"{UPSTREAM}/api/{path}" + (f"?{query}" if query else "")


def error_response(status: int, message: str) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps({"error": message}),
        status_code=status,
        mimetype="application/json",
        headers={"Cache-Control": "no-store"},
    )


UPSTREAM_HEADERS = load_headers(os.environ)
app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)


@app.route(
    route="shopee-api/{*path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
)
def shopee_proxy(req: func.HttpRequest) -> func.HttpResponse:
    try:
        url = upstream_url(req.url)
    except ValueError:
        logging.warning("Rejected invalid Shopee proxy path")
        return error_response(400, "Invalid proxy path.")

    headers = filtered_headers(
        req.headers,
        {"host", "content-length", "authorization", "x-functions-key"},
    )
    headers.update(UPSTREAM_HEADERS)
    try:
        with requests.Session() as session:
            # Do not inherit .netrc credentials or an ambient machine proxy.
            session.trust_env = False
            session.headers.clear()
            with session.request(
                method=req.method,
                url=url,
                headers=headers,
                data=req.get_body(),
                timeout=TIMEOUT,
                allow_redirects=False,
            ) as response:
                body = response.content
                response_headers = filtered_headers(
                    response.headers,
                    # Requests decodes compression; Azure sets the new body length.
                    {"content-length", "content-encoding", "set-cookie"},
                )
                return func.HttpResponse(
                    body,
                    status_code=response.status_code,
                    headers=response_headers,
                )
    except requests.Timeout:
        logging.error("Shopee proxy upstream timed out")
        return error_response(504, "Shopee upstream timed out.")
    except requests.RequestException as error:
        # Exception messages can include URLs or credential-bearing headers.
        logging.error("Shopee proxy upstream failed (%s)", type(error).__name__)
        return error_response(502, "Shopee upstream request failed.")
