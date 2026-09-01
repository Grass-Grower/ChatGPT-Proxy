# ChatGPT Proxy

A small Java 17 / Spring Boot HTTP(S) web proxy.

## Run

```bash
mvn spring-boot:run
```

## Use

Forward a request through `/proxy` with the destination in the `url` query parameter:

```bash
curl 'http://localhost:8080/proxy?url=https://example.com'
```

For production use, add authentication, an allowlist of destination hosts, request-size limits, timeouts, and SSRF protections. Do not expose this open proxy directly to the public internet.
