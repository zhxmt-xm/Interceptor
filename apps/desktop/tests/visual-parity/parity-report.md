# Visual Parity Report

Generated: 2026-07-17T12:02:04.511Z

## Overall Summary

| Metric | Value |
| --- | ---: |
| Result | Review required |
| Views checked | 21 |
| Average pixel diff | 1.32% |
| Targets | 160 |
| Matched | 155 |
| Missing | 5 |
| Flagged | 65 |
| Largest geometry delta | 258.2 px |
| Worst element | rules / Add action |

## View Summary

| View | Pixel diff | Targets | Matched | Missing | Flagged | Max geometry delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| first-run-welcome | 0.40% | 7 | 7 | 0 | 2 | 1.1 px |
| first-run-proxy | 0.20% | 7 | 7 | 0 | 2 | 1.2 px |
| first-run-ca | 0.60% | 6 | 6 | 0 | 1 | 1.1 px |
| first-run-ready | 0.26% | 6 | 6 | 0 | 2 | 1.4 px |
| first-run-welcome-dark | 0.46% | 3 | 3 | 0 | 1 | 1.1 px |
| first-run-proxy-dark | 0.26% | 4 | 4 | 0 | 1 | 1.1 px |
| first-run-ca-dark | 0.66% | 4 | 4 | 0 | 1 | 1.1 px |
| first-run-ready-dark | 0.31% | 4 | 4 | 0 | 1 | 1.4 px |
| capture | 2.53% | 11 | 11 | 0 | 4 | 2.1 px |
| capture-websocket | 2.39% | 8 | 8 | 0 | 4 | 2.0 px |
| capture-grpc | 2.56% | 9 | 9 | 0 | 5 | 2.0 px |
| import-export | 0.89% | 11 | 11 | 0 | 0 | 0.9 px |
| import-export-dark | 0.49% | 11 | 11 | 0 | 0 | 0.9 px |
| rules | 3.25% | 11 | 11 | 0 | 6 | 258.2 px |
| composer | 1.68% | 10 | 7 | 3 | 2 | 2.0 px |
| settings | 2.18% | 10 | 8 | 2 | 8 | 107.3 px |
| settings-proxy | 1.83% | 14 | 14 | 0 | 13 | 2.9 px |
| settings-proxy-dark | 1.77% | 6 | 6 | 0 | 4 | 2.8 px |
| settings-proxy-repair | 1.87% | 4 | 4 | 0 | 1 | 3.7 px |
| breakpoints | 1.47% | 8 | 8 | 0 | 4 | 2.9 px |
| diagnostics | 1.70% | 6 | 6 | 0 | 3 | 2.3 px |

## Element Geometry

| View | Element | dx | dy | dw | dh | Max delta | Style differences | Status |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| first-run-welcome | Set up Interceptor | 0.0 px | 0.2 px | -0.8 px | -0.6 px | 0.8 px | none | ok |
| first-run-welcome | Welcome | 0.0 px | 0.0 px | -0.3 px | -0.3 px | 0.3 px | none | ok |
| first-run-welcome | Proxy | 0.0 px | 0.0 px | -0.2 px | -0.3 px | 0.3 px | none | ok |
| first-run-welcome | Trust CA | 0.1 px | 0.0 px | -0.3 px | -0.3 px | 0.3 px | none | ok |
| first-run-welcome | Ready | 0.2 px | 0.0 px | -0.2 px | -0.3 px | 0.3 px | none | ok |
| first-run-welcome | Welcome to Interceptor | 0.0 px | -0.1 px | 0.0 px | 1.1 px | 1.1 px | none | flagged |
| first-run-welcome | Get started | 0.4 px | 1.0 px | -0.4 px | 0.0 px | 1.0 px | none | flagged |
| first-run-proxy | Route traffic through Interceptor | 0.0 px | -1.0 px | 0.0 px | 1.1 px | 1.1 px | none | flagged |
| first-run-proxy | System proxy ready | 0.0 px | 0.1 px | 0.0 px | 0.4 px | 0.4 px | none | ok |
| first-run-proxy | Ready | 0.2 px | -0.9 px | -0.2 px | -0.3 px | 0.9 px | none | ok |
| first-run-proxy | Manual proxy address | 0.0 px | 0.0 px | 0.2 px | 0.4 px | 0.4 px | none | ok |
| first-run-proxy | 127.0.0.1:8888 | -1.0 px | -1.2 px | 0.0 px | -1.1 px | 1.2 px | none | flagged |
| first-run-proxy | Copy | 0.2 px | 0.0 px | -0.2 px | 0.0 px | 0.2 px | none | ok |
| first-run-proxy | Continue | 0.4 px | 0.0 px | -0.4 px | 0.0 px | 0.4 px | none | ok |
| first-run-ca | Trust the Interceptor CA | 0.0 px | -1.0 px | 0.0 px | 1.1 px | 1.1 px | none | flagged |
| first-run-ca | Root CA generated on this device | 0.0 px | 0.1 px | 0.0 px | 0.4 px | 0.4 px | none | ok |
| first-run-ca | Install to local trust store | 0.0 px | 0.0 px | 0.4 px | 0.4 px | 0.4 px | none | ok |
| first-run-ca | Install | 0.4 px | 0.0 px | -0.4 px | 0.0 px | 0.4 px | none | ok |
| first-run-ca | Verify trust | 0.0 px | 0.0 px | 0.0 px | 0.4 px | 0.4 px | none | ok |
| first-run-ca | Continue | 0.4 px | -0.1 px | -0.4 px | 0.0 px | 0.4 px | none | ok |
| first-run-ready | You're all set | 0.0 px | -1.4 px | 0.0 px | 1.1 px | 1.4 px | none | flagged |
| first-run-ready | Proxy configured | 0.0 px | -0.5 px | 0.0 px | 0.4 px | 0.5 px | none | ok |
| first-run-ready | 127.0.0.1:8888 | -1.0 px | -1.0 px | 0.0 px | -1.1 px | 1.1 px | none | flagged |
| first-run-ready | CA trusted | 0.0 px | 0.0 px | 0.0 px | 0.4 px | 0.4 px | none | ok |
| first-run-ready | MITM ready | 0.0 px | 0.1 px | 0.0 px | 0.1 px | 0.1 px | none | ok |
| first-run-ready | Start capturing | 0.7 px | 0.7 px | -0.7 px | 0.0 px | 0.7 px | none | ok |
| first-run-welcome-dark | Set up Interceptor | 0.0 px | 0.0 px | -0.8 px | -0.6 px | 0.8 px | none | ok |
| first-run-welcome-dark | Welcome to Interceptor | 0.0 px | -0.3 px | 0.0 px | 1.1 px | 1.1 px | none | flagged |
| first-run-welcome-dark | Get started | 0.4 px | 0.8 px | -0.4 px | 0.0 px | 0.8 px | none | ok |
| first-run-proxy-dark | Route traffic through Interceptor | 0.0 px | -1.1 px | 0.0 px | 1.1 px | 1.1 px | none | flagged |
| first-run-proxy-dark | System proxy ready | 0.0 px | 0.1 px | 0.0 px | 0.4 px | 0.4 px | none | ok |
| first-run-proxy-dark | Manual proxy address | 0.0 px | 0.0 px | 0.2 px | 0.4 px | 0.4 px | none | ok |
| first-run-proxy-dark | Continue | 0.4 px | 0.0 px | -0.4 px | 0.0 px | 0.4 px | none | ok |
| first-run-ca-dark | Trust the Interceptor CA | 0.0 px | -1.0 px | 0.0 px | 1.1 px | 1.1 px | none | flagged |
| first-run-ca-dark | Install to local trust store | 0.0 px | 0.0 px | 0.4 px | 0.4 px | 0.4 px | none | ok |
| first-run-ca-dark | Install | 0.4 px | 0.0 px | -0.4 px | 0.0 px | 0.4 px | none | ok |
| first-run-ca-dark | Verify trust | 0.0 px | 0.0 px | 0.0 px | 0.4 px | 0.4 px | none | ok |
| first-run-ready-dark | You're all set | 0.0 px | -1.4 px | 0.0 px | 1.1 px | 1.4 px | none | flagged |
| first-run-ready-dark | Proxy configured | 0.0 px | -0.5 px | 0.0 px | 0.4 px | 0.5 px | none | ok |
| first-run-ready-dark | CA trusted | 0.0 px | 0.0 px | 0.0 px | 0.4 px | 0.4 px | none | ok |
| first-run-ready-dark | Start capturing | 0.7 px | 0.7 px | -0.7 px | 0.0 px | 0.7 px | none | ok |
| capture | Capture | 0.0 px | 0.0 px | 0.0 px | 0.0 px | 0.0 px | none | ok |
| capture | Rules & Map | 0.0 px | 0.0 px | 0.0 px | 0.0 px | 0.0 px | none | ok |
| capture | Composer | 0.0 px | 0.0 px | 0.0 px | 0.0 px | 0.0 px | none | ok |
| capture | Breakpoints | 0.0 px | 0.0 px | 0.0 px | 0.0 px | 0.0 px | none | ok |
| capture | Diagnostics | 0.0 px | 0.0 px | 0.0 px | 0.0 px | 0.0 px | none | ok |
| capture | Local traffic | 0.0 px | 0.5 px | 0.0 px | 0.0 px | 0.5 px | none | ok |
| capture | Settings | 0.0 px | 2.1 px | 0.0 px | 0.0 px | 2.1 px | none | flagged |
| capture | Theme | 0.0 px | 2.1 px | 0.0 px | 0.0 px | 2.1 px | none | flagged |
| capture | api.github.com | 0.0 px | 0.5 px | 2.0 px | 0.0 px | 2.0 px | none | flagged |
| capture | /user | 0.0 px | 0.5 px | 2.0 px | -0.9 px | 2.0 px | none | flagged |
| capture | Recording | 0.0 px | -0.1 px | -0.3 px | 0.4 px | 0.4 px | none | ok |
| capture-websocket | Capture | -2.0 px | -0.4 px | 0.0 px | 0.0 px | 2.0 px | none | flagged |
| capture-websocket | realtime.example.com | -2.0 px | 0.1 px | 2.0 px | 0.0 px | 2.0 px | none | flagged |
| capture-websocket | /socket | -2.0 px | 0.1 px | 2.0 px | -0.9 px | 2.0 px | none | flagged |
| capture-websocket | Connected | 0.0 px | -0.3 px | 0.0 px | 0.1 px | 0.3 px | none | ok |
| capture-websocket | Messages | 0.0 px | -0.2 px | 0.0 px | 0.4 px | 0.4 px | none | ok |
| capture-websocket | Pause on message | 0.0 px | 0.0 px | 0.0 px | -0.9 px | 0.9 px | none | ok |
| capture-websocket | Received text | 0.0 px | 0.2 px | 0.0 px | -0.5 px | 0.5 px | none | ok |
| capture-websocket | Binary | 0.0 px | -0.1 px | 0.0 px | -1.1 px | 1.1 px | none | flagged |
| capture-grpc | orders.example.com | -2.0 px | 0.0 px | 2.0 px | 0.0 px | 2.0 px | none | flagged |
| capture-grpc | /orders.v1.OrderService/Watch | -2.0 px | 0.0 px | 2.0 px | -0.9 px | 2.0 px | none | flagged |
| capture-grpc | gRPC 0 OK | 0.0 px | -0.4 px | 0.0 px | 0.1 px | 0.4 px | none | ok |
| capture-grpc | Messages | 0.0 px | -0.3 px | 0.0 px | 0.4 px | 0.4 px | none | ok |
| capture-grpc | Response | -0.5 px | -0.9 px | -0.3 px | 0.8 px | 0.9 px | none | ok |
| capture-grpc | Message 2 | 0.0 px | 0.9 px | 0.0 px | -1.1 px | 1.1 px | none | flagged |
| capture-grpc | gzip compressed | 0.0 px | 0.9 px | 0.0 px | -1.1 px | 1.1 px | none | flagged |
| capture-grpc | Response message 2 | 0.0 px | 0.1 px | 0.0 px | -0.5 px | 0.5 px | none | ok |
| capture-grpc | No descriptor loaded. Payload is shown as raw binary. | 0.0 px | 1.8 px | 0.0 px | -0.5 px | 1.8 px | none | flagged |
| import-export | HAR import / export | 0.0 px | 0.8 px | 0.0 px | 0.8 px | 0.8 px | none | ok |
| import-export | HAR 1.2 | 0.0 px | 0.7 px | -0.2 px | -0.3 px | 0.7 px | none | ok |
| import-export | Native archive | -0.2 px | 0.7 px | -0.9 px | -0.3 px | 0.9 px | none | ok |
| import-export | All traffic | 0.0 px | -0.2 px | 0.9 px | 0.4 px | 0.9 px | none | ok |
| import-export | Current filter | 0.0 px | 0.0 px | 0.6 px | 0.4 px | 0.6 px | none | ok |
| import-export | Selected request | 0.0 px | 0.3 px | 0.3 px | 0.4 px | 0.4 px | none | ok |
| import-export | Mask authorization tokens | 0.0 px | 0.0 px | 0.0 px | 0.0 px | 0.0 px | none | ok |
| import-export | Mask cookies & Set-Cookie | 0.0 px | 0.0 px | 0.0 px | 0.0 px | 0.0 px | none | ok |
| import-export | Strip request/response bodies | 0.0 px | 0.0 px | 0.0 px | 0.0 px | 0.0 px | none | ok |
| import-export | Import HAR | 0.1 px | 0.0 px | -0.4 px | 0.0 px | 0.4 px | none | ok |
| import-export | Export 10 requests | 0.7 px | 0.0 px | -0.7 px | 0.0 px | 0.7 px | none | ok |
| import-export-dark | HAR import / export | 0.0 px | 0.8 px | 0.0 px | 0.8 px | 0.8 px | none | ok |
| import-export-dark | HAR 1.2 | 0.0 px | 0.7 px | -0.2 px | -0.3 px | 0.7 px | none | ok |
| import-export-dark | Native archive | -0.2 px | 0.7 px | -0.9 px | -0.3 px | 0.9 px | none | ok |
| import-export-dark | All traffic | 0.0 px | -0.2 px | 0.9 px | 0.4 px | 0.9 px | none | ok |
| import-export-dark | Current filter | 0.0 px | 0.0 px | 0.6 px | 0.4 px | 0.6 px | none | ok |
| import-export-dark | Selected request | 0.0 px | 0.3 px | 0.3 px | 0.4 px | 0.4 px | none | ok |
| import-export-dark | Mask authorization tokens | 0.0 px | 0.0 px | 0.0 px | 0.0 px | 0.0 px | none | ok |
| import-export-dark | Mask cookies & Set-Cookie | 0.0 px | 0.0 px | 0.0 px | 0.0 px | 0.0 px | none | ok |
| import-export-dark | Strip request/response bodies | 0.0 px | 0.0 px | 0.0 px | 0.0 px | 0.0 px | none | ok |
| import-export-dark | Import HAR | 0.1 px | 0.0 px | -0.4 px | 0.0 px | 0.4 px | none | ok |
| import-export-dark | Export 10 requests | 0.7 px | 0.0 px | -0.7 px | 0.0 px | 0.7 px | none | ok |
| rules | Rules | 0.0 px | -0.1 px | -0.3 px | 0.2 px | 0.3 px | none | ok |
| rules | New rule | 2.8 px | 0.0 px | -0.3 px | 0.0 px | 2.8 px | none | flagged |
| rules | Apply changes | 2.6 px | 0.0 px | -0.6 px | 0.0 px | 2.6 px | none | flagged |
| rules | Stub /v1/user | 0.0 px | 0.3 px | 0.0 px | 0.0 px | 0.3 px | none | ok |
| rules | Force CORS + JSON | 0.0 px | 0.3 px | 0.0 px | 0.0 px | 0.3 px | none | ok |
| rules | Redirect to staging | 0.0 px | 0.3 px | 0.0 px | 0.0 px | 0.3 px | none | ok |
| rules | Block trackers | 0.0 px | 0.3 px | 0.0 px | 0.0 px | 0.3 px | none | ok |
| rules | Mock payment | 0.0 px | 0.3 px | 63.3 px | 0.0 px | 63.3 px | none | flagged |
| rules | Match | 0.0 px | 0.0 px | 2.0 px | -0.5 px | 2.0 px | none | flagged |
| rules | Add condition | 0.0 px | -42.5 px | -0.5 px | 0.0 px | 42.5 px | none | flagged |
| rules | Add action | 0.0 px | -258.2 px | -0.4 px | 0.0 px | 258.2 px | none | flagged |
| composer | History | 0.5 px | 0.0 px | -0.4 px | 0.0 px | 0.5 px | none | ok |
| composer | New | 0.1 px | 0.0 px | -0.1 px | 0.0 px | 0.1 px | none | ok |
| composer | Send | 0.2 px | 0.0 px | -0.2 px | 0.0 px | 0.2 px | none | ok |
| composer | Protocol | -2.0 px | 0.1 px | 0.0 px | -0.5 px | 2.0 px | none | flagged |
| composer | TLS 1.3 · h2 | 0.0 px | 0.3 px | 0.0 px | -0.9 px | 0.9 px | none | ok |
| composer | authorization | n/a | n/a | n/a | n/a | n/a | none | app missing |
| composer | content-type | n/a | n/a | n/a | n/a | n/a | none | app missing |
| composer | accept | n/a | n/a | n/a | n/a | n/a | none | app missing |
| composer | Created | 0.0 px | 0.0 px | 0.0 px | 0.1 px | 0.1 px | none | ok |
| composer | Add header… | -2.0 px | 0.8 px | 0.9 px | -1.3 px | 2.0 px | none | flagged |
| settings | Root Certificate Authority | 0.0 px | -0.8 px | 2.0 px | -0.1 px | 2.0 px | none | flagged |
| settings | Trust status | 0.0 px | 0.0 px | 2.0 px | -0.1 px | 2.0 px | none | flagged |
| settings | HTTPS interception | 0.0 px | 0.4 px | 2.0 px | -0.1 px | 2.0 px | none | flagged |
| settings | Generated | 2.0 px | -0.7 px | 0.0 px | 0.1 px | 2.0 px | none | flagged |
| settings | Trusted | -107.3 px | 1.3 px | 0.0 px | 0.1 px | 107.3 px | none | flagged |
| settings | MITM active | -1.0 px | -0.7 px | 0.0 px | -0.5 px | 1.0 px | none | flagged |
| settings | Export | n/a | n/a | n/a | n/a | n/a | none | app missing |
| settings | Regenerate | 2.4 px | 0.0 px | -0.4 px | 0.0 px | 2.4 px | none | flagged |
| settings | Add host | 2.3 px | 0.8 px | -0.3 px | 0.0 px | 2.3 px | none | flagged |
| settings | 1 flagged | n/a | n/a | n/a | n/a | n/a | none | app missing |
| settings-proxy | Local listener, operating-system routing, ownership and guarded recovery. | 0.0 px | -0.7 px | 2.0 px | 0.4 px | 2.0 px | none | flagged |
| settings-proxy | Owned | -0.8 px | -0.8 px | 0.0 px | 0.1 px | 0.8 px | none | ok |
| settings-proxy | Listener | 0.0 px | -0.3 px | 2.0 px | -0.1 px | 2.0 px | none | flagged |
| settings-proxy | Listening | 2.0 px | -0.2 px | 0.0 px | 0.1 px | 2.0 px | none | flagged |
| settings-proxy | Address | 0.0 px | -0.2 px | 2.2 px | 0.4 px | 2.2 px | none | flagged |
| settings-proxy | 127.0.0.1:8888 | 0.0 px | -0.5 px | 0.0 px | -1.1 px | 1.1 px | none | flagged |
| settings-proxy | System proxy | 0.0 px | 0.1 px | 2.0 px | -0.1 px | 2.0 px | none | flagged |
| settings-proxy | Owned by Interceptor | 2.3 px | -0.1 px | 0.0 px | 0.1 px | 2.3 px | none | flagged |
| settings-proxy | Current configuration | 0.0 px | 0.0 px | 2.0 px | 0.4 px | 2.0 px | none | flagged |
| settings-proxy | Bypass | 0.0 px | 0.5 px | 2.0 px | 0.4 px | 2.0 px | none | flagged |
| settings-proxy | PAC / Auto detect | 0.0 px | 1.0 px | 2.0 px | 0.4 px | 2.0 px | none | flagged |
| settings-proxy | Recovery | 0.0 px | 1.5 px | 2.0 px | -0.1 px | 2.0 px | none | flagged |
| settings-proxy | Protected | 2.0 px | 1.6 px | 0.0 px | 0.1 px | 2.0 px | none | flagged |
| settings-proxy | Emergency repair… | 2.9 px | 2.0 px | -0.9 px | 0.0 px | 2.9 px | none | flagged |
| settings-proxy-dark | Local listener, operating-system routing, ownership and guarded recovery. | -2.0 px | -0.6 px | 2.0 px | 0.4 px | 2.0 px | none | flagged |
| settings-proxy-dark | Owned | -2.8 px | -0.8 px | 0.0 px | 0.1 px | 2.8 px | none | flagged |
| settings-proxy-dark | Listening | 0.0 px | -0.2 px | 0.0 px | 0.1 px | 0.2 px | none | ok |
| settings-proxy-dark | Owned by Interceptor | 0.3 px | 0.0 px | 0.0 px | 0.1 px | 0.3 px | none | ok |
| settings-proxy-dark | Protected | 0.0 px | 1.7 px | 0.0 px | 0.1 px | 1.7 px | none | flagged |
| settings-proxy-dark | Emergency repair… | 0.9 px | 2.0 px | -0.9 px | 0.0 px | 2.0 px | none | flagged |
| settings-proxy-repair | Emergency repair | -2.8 px | -0.3 px | 3.7 px | 0.4 px | 3.7 px | none | flagged |
| settings-proxy-repair | Restore owned settings? | 0.9 px | -0.1 px | -0.9 px | 0.1 px | 0.9 px | none | ok |
| settings-proxy-repair | Cancel | 0.0 px | 0.0 px | -0.3 px | 0.0 px | 0.3 px | none | ok |
| settings-proxy-repair | Confirm repair | -0.3 px | 0.0 px | -0.5 px | 0.0 px | 0.5 px | none | ok |
| breakpoints | Debug checkout | -0.5 px | 0.0 px | -0.5 px | 0.4 px | 0.5 px | none | ok |
| breakpoints | Inspect token | -0.5 px | 0.0 px | -0.5 px | 0.4 px | 0.5 px | none | ok |
| breakpoints | Continue all | 0.0 px | 0.0 px | -0.5 px | 0.0 px | 0.5 px | none | ok |
| breakpoints | Request paused | 1.5 px | 0.0 px | 0.0 px | -0.5 px | 1.5 px | none | flagged |
| breakpoints | Drop | -0.5 px | 2.0 px | -0.1 px | 0.0 px | 2.0 px | none | flagged |
| breakpoints | Continue unmodified | 2.9 px | 2.0 px | -0.9 px | 0.0 px | 2.9 px | none | flagged |
| breakpoints | Execute edited | 2.0 px | 2.0 px | -0.5 px | 0.0 px | 2.0 px | none | flagged |
| breakpoints | shop.example.com/checkout | -0.5 px | -0.4 px | 0.0 px | -0.5 px | 0.5 px | none | ok |
| diagnostics | core · core:echo | -2.3 px | -1.6 px | 2.0 px | -0.9 px | 2.3 px | none | flagged |
| diagnostics | main · rules:apply | -2.3 px | -1.6 px | 2.0 px | -0.9 px | 2.3 px | none | flagged |
| diagnostics | Process | 0.0 px | 0.0 px | 0.0 px | 0.0 px | 0.0 px | none | ok |
| diagnostics | Level | 0.0 px | 0.0 px | 0.0 px | 0.0 px | 0.0 px | none | ok |
| diagnostics | Outcome | 0.0 px | 0.0 px | 0.0 px | 0.0 px | 0.0 px | none | ok |
| diagnostics | Export JSONL | 0.0 px | -2.0 px | -0.3 px | 0.0 px | 2.0 px | none | flagged |

> Geometry deltas are measured after subtracting the detected systematic canvas-border offset. A row is flagged when any absolute geometry delta is at least 1 px or a tracked font style differs.
