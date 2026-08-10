import type { FixtureNode } from '../FixtureNode';

export const statusbarFixture: FixtureNode = {
  "type": "element",
  "tag": "footer",
  "attributes": {
    "class": "statusbar"
  },
  "children": [
    {
      "type": "text",
      "value": "\n        "
    },
    {
      "type": "element",
      "tag": "div",
      "attributes": {
        "class": "sv",
        "data-v": "capture"
      },
      "children": [
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "capture-status-default"
          },
          "children": [
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "g capture-endpoint"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "gd"
                  },
                  "children": []
                },
                {
                  "type": "text",
                  "value": "127.0.0.1:8888"
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "proxy-on-label"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "System proxy on"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "proxy-off-label"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "System proxy off"
                    }
                  ]
                }
              ]
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "g capture-decrypt"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "capture-decrypting"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "svg",
                      "attributes": {
                        "class": "si"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "use",
                          "attributes": {
                            "href": "#i-lock"
                          },
                          "children": []
                        }
                      ]
                    },
                    {
                      "type": "text",
                      "value": "HTTPS decrypting · CA trusted"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "capture-passthrough"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "svg",
                      "attributes": {
                        "class": "si"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "use",
                          "attributes": {
                            "href": "#i-lock-off"
                          },
                          "children": []
                        }
                      ]
                    },
                    {
                      "type": "text",
                      "value": "HTTPS passthrough"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "class": "slink capture-enable-decrypt",
                    "data-open-https": "",
                    "title": "HTTPS traffic is forwarded without decryption. Click to set up the CA and start decrypting."
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Click to enable MITM"
                    }
                  ]
                }
              ]
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "g capture-upstream"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "svg",
                  "attributes": {
                    "class": "si"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "use",
                      "attributes": {
                        "href": "#i-arrow"
                      },
                      "children": []
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "upstream-ok-label"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "upstream 127.0.0.1:7890"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "upstream-direct-label"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "direct"
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "capture-breakpoint-status"
          },
          "children": [
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "break-status-dot"
              },
              "children": []
            },
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "break-status-count"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "b",
                  "attributes": {},
                  "children": [
                    {
                      "type": "text",
                      "value": "2"
                    }
                  ]
                },
                {
                  "type": "text",
                  "value": " requests paused"
                }
              ]
            },
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "break-status-rule"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Checkout API"
                }
              ]
            },
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "break-queue-full"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Queue full · 3 requests auto-continued"
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "text",
      "value": "\n        "
    },
    {
      "type": "element",
      "tag": "div",
      "attributes": {
        "class": "sv",
        "data-v": "rules"
      },
      "children": [
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "g"
          },
          "children": [
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "gd"
              },
              "children": []
            },
            {
              "type": "text",
              "value": "Rule set applied"
            }
          ]
        },
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "g mono"
          },
          "children": [
            {
              "type": "text",
              "value": "rev 42"
            }
          ]
        },
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "g"
          },
          "children": [
            {
              "type": "text",
              "value": "9 of 10 enabled"
            }
          ]
        },
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "sp g mono"
          },
          "children": [
            {
              "type": "text",
              "value": "2 force body buffering"
            }
          ]
        }
      ]
    },
    {
      "type": "text",
      "value": "\n        "
    },
    {
      "type": "element",
      "tag": "div",
      "attributes": {
        "class": "sv",
        "data-v": "composer"
      },
      "children": [
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "g"
          },
          "children": [
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "gd"
              },
              "children": []
            },
            {
              "type": "text",
              "value": "Ready"
            }
          ]
        },
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "g"
          },
          "children": [
            {
              "type": "text",
              "value": "Sent directly — not routed through the proxy"
            }
          ]
        },
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "sp g"
          },
          "children": [
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "csv-idle"
              },
              "children": [
                {
                  "type": "text",
                  "value": "last send 201 · 142 ms"
                }
              ]
            },
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "csv-empty"
              },
              "children": [
                {
                  "type": "text",
                  "value": "no request sent yet"
                }
              ]
            },
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "csv-busy"
              },
              "children": [
                {
                  "type": "text",
                  "value": "sending…"
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "text",
      "value": "\n        "
    },
    {
      "type": "element",
      "tag": "div",
      "attributes": {
        "class": "sv",
        "data-v": "settings"
      },
      "children": [
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "g"
          },
          "children": [
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "gd"
              },
              "children": []
            },
            {
              "type": "text",
              "value": "Core Running"
            }
          ]
        },
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "g mono"
          },
          "children": [
            {
              "type": "text",
              "value": "127.0.0.1:8888"
            }
          ]
        },
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "g"
          },
          "children": [
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "gd"
              },
              "children": []
            },
            {
              "type": "text",
              "value": "System Proxy"
            }
          ]
        },
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "sp g mono"
          },
          "children": [
            {
              "type": "text",
              "value": "CA trusted · MITM on"
            }
          ]
        }
      ]
    },
    {
      "type": "text",
      "value": "\n        "
    },
    {
      "type": "element",
      "tag": "div",
      "attributes": {
        "class": "sv",
        "data-v": "diagnostics"
      },
      "children": [
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "g"
          },
          "children": [
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "gd"
              },
              "children": []
            },
            {
              "type": "text",
              "value": "Diagnostics"
            }
          ]
        },
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "g mono"
          },
          "children": [
            {
              "type": "text",
              "value": "2,481 records"
            }
          ]
        },
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "g"
          },
          "children": [
            {
              "type": "text",
              "value": "3 dropped under load"
            }
          ]
        },
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "sp g mono"
          },
          "children": [
            {
              "type": "text",
              "value": "retention 7d · redacted"
            }
          ]
        }
      ]
    },
    {
      "type": "text",
      "value": "\n      "
    }
  ]
};
