package com.grassgrower.proxy;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.util.Enumeration;

@RestController
public class ProxyController {
    private final RestClient client = RestClient.builder().build();

    @RequestMapping(value = "/proxy", method = {RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT, RequestMethod.PATCH, RequestMethod.DELETE})
    public ResponseEntity<byte[]> proxy(HttpServletRequest request, @RequestBody(required = false) byte[] body,
                                        @RequestParam String url) {
        URI target = URI.create(url);
        if (!"http".equalsIgnoreCase(target.getScheme()) && !"https".equalsIgnoreCase(target.getScheme())) {
            return ResponseEntity.badRequest().body("Only HTTP(S) targets are allowed".getBytes());
        }

        HttpHeaders headers = new HttpHeaders();
        Enumeration<String> names = request.getHeaderNames();
        while (names != null && names.hasMoreElements()) {
            String name = names.nextElement();
            if (!name.equalsIgnoreCase("host") && !name.equalsIgnoreCase("content-length")) {
                Enumeration<String> values = request.getHeaders(name);
                while (values.hasMoreElements()) headers.add(name, values.nextElement());
            }
        }

        HttpMethod method = HttpMethod.valueOf(request.getMethod());
        var spec = client.method(method).uri(target).headers(h -> h.addAll(headers));
        if (body != null && body.length > 0) spec.body(body);

        return spec.exchange((req, res) -> {
            HttpHeaders responseHeaders = new HttpHeaders();
            responseHeaders.putAll(res.getHeaders());
            return ResponseEntity.status(res.getStatusCode()).headers(responseHeaders).body(res.getBody().readAllBytes());
        });
    }
}
