package com.grassgrower.proxy;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.net.*;
import java.security.MessageDigest;
import java.util.*;

@RestController
public class ProxyController {
    private final RestClient client = RestClient.builder().build();
    private final String apiKey;
    private final Set<String> allowedHosts;

    public ProxyController(@Value("${proxy.api-key:}") String apiKey, @Value("${proxy.allowed-hosts:}") String allowedHosts) {
        this.apiKey = apiKey.trim();
        this.allowedHosts = Arrays.stream(allowedHosts.split(",")).map(String::trim).map(String::toLowerCase)
                .filter(s -> !s.isBlank()).collect(java.util.stream.Collectors.toSet());
    }

    @RequestMapping(value = "/proxy", method = {RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE})
    public ResponseEntity<byte[]> proxy(HttpServletRequest request, @RequestBody(required = false) byte[] body,
                                        @RequestParam String url) {
        if (apiKey.isBlank() || !constantTimeEquals(apiKey, request.getHeader("X-Proxy-Key")))
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Unauthorized".getBytes());
        if (body != null && body.length > 5 * 1024 * 1024)
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body("Request too large".getBytes());

        final URI target;
        try { target = URI.create(url); } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body("Invalid URL".getBytes());
        }
        if (!("http".equalsIgnoreCase(target.getScheme()) || "https".equalsIgnoreCase(target.getScheme())) || target.getHost() == null)
            return ResponseEntity.badRequest().body("Only HTTP(S) URLs are allowed".getBytes());

        String host = target.getHost().toLowerCase(Locale.ROOT);
        if (!allowedHosts.isEmpty() && allowedHosts.stream().noneMatch(h -> host.equals(h) || host.endsWith("." + h)))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Destination not allowed".getBytes());
        try {
            for (InetAddress address : InetAddress.getAllByName(host)) {
                if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                        || address.isSiteLocalAddress() || address.isMulticastAddress())
                    return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Private destination blocked".getBytes());
            }
        } catch (UnknownHostException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body("Destination cannot be resolved".getBytes());
        }

        HttpHeaders headers = new HttpHeaders();
        Enumeration<String> names = request.getHeaderNames();
        while (names != null && names.hasMoreElements()) {
            String name = names.nextElement();
            String lower = name.toLowerCase(Locale.ROOT);
            if (!Set.of("host", "content-length", "x-proxy-key", "connection", "transfer-encoding").contains(lower)) {
                Enumeration<String> values = request.getHeaders(name);
                while (values.hasMoreElements()) headers.add(name, values.nextElement());
            }
        }

        try {
            HttpMethod method = HttpMethod.valueOf(request.getMethod());
            var spec = client.method(method).uri(target).headers(h -> h.addAll(headers));
            if (body != null && body.length > 0) spec.body(body);
            return spec.exchange((req, res) -> {
                HttpHeaders responseHeaders = new HttpHeaders();
                res.getHeaders().forEach((k, v) -> { if (!k.equalsIgnoreCase("connection")) responseHeaders.put(k, v); });
                try { return ResponseEntity.status(res.getStatusCode()).headers(responseHeaders).body(res.getBody().readAllBytes()); }
                catch (java.io.IOException e) { throw new RestClientException("Unable to read upstream response", e); }
            });
        } catch (RestClientException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body("Upstream request failed".getBytes());
        }
    }

    private static boolean constantTimeEquals(String expected, String actual) {
        if (actual == null) return false;
        return MessageDigest.isEqual(expected.getBytes(java.nio.charset.StandardCharsets.UTF_8), actual.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }
}
