import type { FixtureNode } from '../FixtureNode';

export const bootFixture: FixtureNode = {
  "type": "element",
  "tag": "div",
  "attributes": {
    "class": "boot"
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
        "class": "boot-chrome"
      },
      "children": [
        {
          "type": "text",
          "value": "\n          "
        },
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "window-controls"
          },
          "children": [
            {
              "type": "text",
              "value": "\n            "
            },
            {
              "type": "element",
              "tag": "button",
              "attributes": {
                "class": "ib sm window-control",
                "aria-label": "Minimize",
                "title": "Minimize"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "svg",
                  "attributes": {},
                  "children": [
                    {
                      "type": "element",
                      "tag": "use",
                      "attributes": {
                        "href": "#i-minus"
                      },
                      "children": []
                    }
                  ]
                }
              ]
            },
            {
              "type": "text",
              "value": "\n            "
            },
            {
              "type": "element",
              "tag": "button",
              "attributes": {
                "class": "ib sm window-control",
                "aria-label": "Maximize or restore",
                "title": "Maximize or restore"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "svg",
                  "attributes": {},
                  "children": [
                    {
                      "type": "element",
                      "tag": "use",
                      "attributes": {
                        "href": "#i-maximize"
                      },
                      "children": []
                    }
                  ]
                }
              ]
            },
            {
              "type": "text",
              "value": "\n            "
            },
            {
              "type": "element",
              "tag": "button",
              "attributes": {
                "class": "ib sm window-close",
                "aria-label": "Close",
                "title": "Close"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "svg",
                  "attributes": {},
                  "children": [
                    {
                      "type": "element",
                      "tag": "use",
                      "attributes": {
                        "href": "#i-x"
                      },
                      "children": []
                    }
                  ]
                }
              ]
            },
            {
              "type": "text",
              "value": "\n          "
            }
          ]
        },
        {
          "type": "text",
          "value": "\n        "
        }
      ]
    },
    {
      "type": "text",
      "value": "\n\n        "
    },
    {
      "type": "element",
      "tag": "div",
      "attributes": {
        "class": "boot-stage"
      },
      "children": [
        {
          "type": "text",
          "value": "\n          "
        },
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "boot-splash"
          },
          "children": [
            {
              "type": "text",
              "value": "\n            "
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "boot-ring-wrap"
              },
              "children": [
                {
                  "type": "text",
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "boot-ring-track"
                  },
                  "children": []
                },
                {
                  "type": "text",
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "boot-ring"
                  },
                  "children": []
                },
                {
                  "type": "text",
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "boot-logo"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "svg",
                      "attributes": {},
                      "children": [
                        {
                          "type": "element",
                          "tag": "use",
                          "attributes": {
                            "href": "#i-zap"
                          },
                          "children": []
                        }
                      ]
                    }
                  ]
                },
                {
                  "type": "text",
                  "value": "\n            "
                }
              ]
            },
            {
              "type": "text",
              "value": "\n            "
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "boot-splash-copy"
              },
              "children": [
                {
                  "type": "text",
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "b",
                  "attributes": {
                    "class": "boot-wordmark"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Interceptor"
                    }
                  ]
                },
                {
                  "type": "text",
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "boot-phase",
                    "data-when": "core"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Starting Proxy Core"
                    }
                  ]
                },
                {
                  "type": "text",
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "boot-phase",
                    "data-when": "listener"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Binding 127.0.0.1:8888"
                    }
                  ]
                },
                {
                  "type": "text",
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "boot-phase",
                    "data-when": "proxy"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Enabling the Windows system proxy"
                    }
                  ]
                },
                {
                  "type": "text",
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "boot-phase",
                    "data-when": "ready"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Ready — opening Capture"
                    }
                  ]
                },
                {
                  "type": "text",
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "boot-phase",
                    "data-when": "error"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Proxy Core exited with code 1 after 0.8 s"
                    }
                  ]
                },
                {
                  "type": "text",
                  "value": "\n            "
                }
              ]
            },
            {
              "type": "text",
              "value": "\n\n            "
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "boot-dots"
              },
              "children": [
                {
                  "type": "text",
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "boot-dot",
                    "data-step": "core"
                  },
                  "children": []
                },
                {
                  "type": "text",
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "boot-dot",
                    "data-step": "listener"
                  },
                  "children": []
                },
                {
                  "type": "text",
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "boot-dot",
                    "data-step": "proxy"
                  },
                  "children": []
                },
                {
                  "type": "text",
                  "value": "\n            "
                }
              ]
            },
            {
              "type": "text",
              "value": "\n\n            "
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "boot-gate"
              },
              "children": [
                {
                  "type": "text",
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "p",
                  "attributes": {
                    "class": "boot-note",
                    "data-when": "core listener proxy ready"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "svg",
                      "attributes": {},
                      "children": [
                        {
                          "type": "element",
                          "tag": "use",
                          "attributes": {
                            "href": "#i-shield"
                          },
                          "children": []
                        }
                      ]
                    },
                    {
                      "type": "text",
                      "value": "Interceptor takes over the Windows system proxy and restores your current settings when it exits."
                    }
                  ]
                },
                {
                  "type": "text",
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "p",
                  "attributes": {
                    "class": "boot-note",
                    "data-when": "error"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "svg",
                      "attributes": {},
                      "children": [
                        {
                          "type": "element",
                          "tag": "use",
                          "attributes": {
                            "href": "#i-shield"
                          },
                          "children": []
                        }
                      ]
                    },
                    {
                      "type": "text",
                      "value": "Your system proxy settings were not changed."
                    }
                  ]
                },
                {
                  "type": "text",
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "div",
                  "attributes": {
                    "class": "boot-actions",
                    "data-when": "error"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "\n                "
                    },
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "btn"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "svg",
                          "attributes": {},
                          "children": [
                            {
                              "type": "element",
                              "tag": "use",
                              "attributes": {
                                "href": "#i-terminal"
                              },
                              "children": []
                            }
                          ]
                        },
                        {
                          "type": "text",
                          "value": "Open diagnostics"
                        }
                      ]
                    },
                    {
                      "type": "text",
                      "value": "\n                "
                    },
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "btn"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "svg",
                          "attributes": {},
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
                          "type": "text",
                          "value": "Enter anyway"
                        }
                      ]
                    },
                    {
                      "type": "text",
                      "value": "\n                "
                    },
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "btn pri"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "svg",
                          "attributes": {},
                          "children": [
                            {
                              "type": "element",
                              "tag": "use",
                              "attributes": {
                                "href": "#i-refresh"
                              },
                              "children": []
                            }
                          ]
                        },
                        {
                          "type": "text",
                          "value": "Retry"
                        }
                      ]
                    },
                    {
                      "type": "text",
                      "value": "\n              "
                    }
                  ]
                },
                {
                  "type": "text",
                  "value": "\n            "
                }
              ]
            },
            {
              "type": "text",
              "value": "\n          "
            }
          ]
        },
        {
          "type": "text",
          "value": "\n        "
        }
      ]
    },
    {
      "type": "text",
      "value": "\n      "
    }
  ]
};
