# Visual Parity Report

Generated: 2026-07-23T11:32:50.200Z

## Overall Summary

| Metric | Value |
| --- | ---: |
| Result | Review required |
| Views checked | 1 |
| Average pixel diff | 2.59% |
| Targets | 6 |
| Matched | 6 |
| Missing | 0 |
| Flagged | 4 |
| Largest geometry delta | 4.8 px |
| Worst element | capture-tunnel-mitm-active / Inspector host |

## View Summary

| View | Pixel diff | Targets | Matched | Missing | Flagged | Max geometry delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| capture-tunnel-mitm-active | 2.59% | 6 | 6 | 0 | 4 | 4.8 px |

## Element Geometry

| View | Element | dx | dy | dw | dh | Max delta | Style differences | Status |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| capture-tunnel-mitm-active | Inspector host | 3.7 px | -0.6 px | -4.8 px | 1.4 px | 4.8 px | none | flagged |
| capture-tunnel-mitm-active | Inspector status | -1.1 px | 0.5 px | 1.1 px | -0.9 px | 1.1 px | none | flagged |
| capture-tunnel-mitm-active | TLS tunnel | 0.0 px | 0.1 px | -1.7 px | -0.6 px | 1.7 px | none | flagged |
| capture-tunnel-mitm-active | HTTPS content is encrypted | 0.0 px | 0.0 px | 0.0 px | 0.1 px | 0.1 px | none | ok |
| capture-tunnel-mitm-active | MITM active | 3.5 px | -0.4 px | -3.5 px | -0.9 px | 3.5 px | none | flagged |
| capture-tunnel-mitm-active | MITM is active for new connections. Reconnect this client to inspect its HTTPS traffic. | 0.0 px | -0.5 px | 0.0 px | 0.0 px | 0.5 px | none | ok |

> Geometry deltas are measured after subtracting the detected systematic canvas-border offset. A row is flagged when any absolute geometry delta is at least 1 px or a tracked font style differs.
