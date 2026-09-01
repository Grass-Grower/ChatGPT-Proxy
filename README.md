# ChatGPT Proxy

A Java 17 / Spring Boot HTTP(S) web proxy with basic abuse and SSRF protections.

## Run

Set a secret key before starting:

```bash
export PROXY_API_KEY='replace-with-a-long-random-secret'
export PROXY_ALLOWED_HOSTS='example.com,api.example.org'
mvn spring-boot:run
```

The allowlist is strongly recommended. When it is empty, the proxy permits public destinations but still blocks loopback, link-local, site-local, any-local and multicast addresses after DNS resolution.

## Use

```bash
curl -H 'X-Proxy-Key: replace-with-a-long-random-secret' \
  'http://localhost:8080/proxy?url=https://example.com'
```

## Protections

- API-key authentication via `X-Proxy-Key`
- Optional destination hostname allowlist
- DNS resolution with blocking of local/private/multicast addresses
- 5 MB request-size limit
- Does not forward the proxy credential or hop-by-hop headers
- Rejects non-HTTP(S) targets

For public deployment, also put the service behind TLS and a reverse proxy/WAF, add rate limiting, and add upstream connection/read timeouts and response-size controls.
