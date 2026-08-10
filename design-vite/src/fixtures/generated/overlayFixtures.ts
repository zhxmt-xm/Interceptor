import type { FixtureNode } from '../FixtureNode';

export const overlayFixtures: readonly FixtureNode[] = [
  {
    "type": "element",
    "tag": "div",
    "attributes": {
      "class": "ov",
      "data-ov": "import-export"
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
          "class": "dlg transfer-dialog"
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
              "class": "dlghead"
            },
            "children": [
              {
                "type": "text",
                "value": "\n            "
              },
              {
                "type": "element",
                "tag": "span",
                "attributes": {
                  "class": "di transfer-import-only"
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
                          "href": "#i-upload"
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
                "tag": "span",
                "attributes": {
                  "class": "di transfer-export-only"
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
                          "href": "#i-download"
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
                "tag": "b",
                "attributes": {
                  "class": "transfer-only transfer-har-import"
                },
                "children": [
                  {
                    "type": "text",
                    "value": "Import HAR"
                  }
                ]
              },
              {
                "type": "text",
                "value": "\n            "
              },
              {
                "type": "element",
                "tag": "b",
                "attributes": {
                  "class": "transfer-only transfer-har-export"
                },
                "children": [
                  {
                    "type": "text",
                    "value": "Export HAR"
                  }
                ]
              },
              {
                "type": "text",
                "value": "\n            "
              },
              {
                "type": "element",
                "tag": "b",
                "attributes": {
                  "class": "transfer-only transfer-archive-import"
                },
                "children": [
                  {
                    "type": "text",
                    "value": "Open Capture"
                  }
                ]
              },
              {
                "type": "text",
                "value": "\n            "
              },
              {
                "type": "element",
                "tag": "b",
                "attributes": {
                  "class": "transfer-only transfer-archive-export"
                },
                "children": [
                  {
                    "type": "text",
                    "value": "Save Capture"
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
                  "class": "ib sm"
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
            "value": "\n          "
          },
          {
            "type": "element",
            "tag": "div",
            "attributes": {
              "class": "dlgbody"
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
                  "class": "wnote transfer-har-only"
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
                          "href": "#i-alert"
                        },
                        "children": []
                      }
                    ]
                  },
                  {
                    "type": "element",
                    "tag": "span",
                    "attributes": {},
                    "children": [
                      {
                        "type": "text",
                        "value": "HAR omits HTTP/2 pseudo-headers and trailers, WebSocket messages, TLS detail, and rule history."
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
                "tag": "div",
                "attributes": {
                  "class": "wnote transfer-archive-only"
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
                          "href": "#i-alert"
                        },
                        "children": []
                      }
                    ]
                  },
                  {
                    "type": "element",
                    "tag": "span",
                    "attributes": {},
                    "children": [
                      {
                        "type": "text",
                        "value": "An Interceptor Capture preserves bodies, HTTP/2 metadata, WebSocket frames, and capture details."
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
                "tag": "div",
                "attributes": {
                  "class": "frow transfer-only transfer-har-export"
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
                      "class": "fl"
                    },
                    "children": [
                      {
                        "type": "text",
                        "value": "Scope"
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
                      "class": "radios"
                    },
                    "children": [
                      {
                        "type": "text",
                        "value": "\n                "
                      },
                      {
                        "type": "element",
                        "tag": "div",
                        "attributes": {
                          "class": "ritem"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "span",
                            "attributes": {
                              "class": "rd"
                            },
                            "children": []
                          },
                          {
                            "type": "element",
                            "tag": "div",
                            "attributes": {
                              "class": "rc"
                            },
                            "children": [
                              {
                                "type": "element",
                                "tag": "b",
                                "attributes": {},
                                "children": [
                                  {
                                    "type": "text",
                                    "value": "All traffic"
                                  }
                                ]
                              }
                            ]
                          },
                          {
                            "type": "element",
                            "tag": "span",
                            "attributes": {
                              "class": "cnt"
                            },
                            "children": [
                              {
                                "type": "text",
                                "value": "241"
                              }
                            ]
                          }
                        ]
                      },
                      {
                        "type": "text",
                        "value": "\n                "
                      },
                      {
                        "type": "element",
                        "tag": "div",
                        "attributes": {
                          "class": "ritem on"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "span",
                            "attributes": {
                              "class": "rd"
                            },
                            "children": []
                          },
                          {
                            "type": "element",
                            "tag": "div",
                            "attributes": {
                              "class": "rc"
                            },
                            "children": [
                              {
                                "type": "element",
                                "tag": "b",
                                "attributes": {},
                                "children": [
                                  {
                                    "type": "text",
                                    "value": "Current filter"
                                  }
                                ]
                              },
                              {
                                "type": "element",
                                "tag": "span",
                                "attributes": {},
                                "children": [
                                  {
                                    "type": "text",
                                    "value": "No active filter"
                                  }
                                ]
                              }
                            ]
                          },
                          {
                            "type": "element",
                            "tag": "span",
                            "attributes": {
                              "class": "cnt"
                            },
                            "children": [
                              {
                                "type": "text",
                                "value": "10"
                              }
                            ]
                          }
                        ]
                      },
                      {
                        "type": "text",
                        "value": "\n                "
                      },
                      {
                        "type": "element",
                        "tag": "div",
                        "attributes": {
                          "class": "ritem"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "span",
                            "attributes": {
                              "class": "rd"
                            },
                            "children": []
                          },
                          {
                            "type": "element",
                            "tag": "div",
                            "attributes": {
                              "class": "rc"
                            },
                            "children": [
                              {
                                "type": "element",
                                "tag": "b",
                                "attributes": {},
                                "children": [
                                  {
                                    "type": "text",
                                    "value": "Selected request"
                                  }
                                ]
                              }
                            ]
                          },
                          {
                            "type": "element",
                            "tag": "span",
                            "attributes": {
                              "class": "cnt"
                            },
                            "children": [
                              {
                                "type": "text",
                                "value": "1"
                              }
                            ]
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
                "value": "\n            "
              },
              {
                "type": "element",
                "tag": "div",
                "attributes": {
                  "class": "frow transfer-only transfer-har-export"
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
                      "class": "fl"
                    },
                    "children": [
                      {
                        "type": "text",
                        "value": "Redaction"
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
                      "class": "checks"
                    },
                    "children": [
                      {
                        "type": "text",
                        "value": "\n                "
                      },
                      {
                        "type": "element",
                        "tag": "label",
                        "attributes": {
                          "class": "chk"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "span",
                            "attributes": {
                              "class": "cb on"
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
                                      "href": "#i-check"
                                    },
                                    "children": []
                                  }
                                ]
                              }
                            ]
                          },
                          {
                            "type": "text",
                            "value": "Mask authorization tokens"
                          }
                        ]
                      },
                      {
                        "type": "text",
                        "value": "\n                "
                      },
                      {
                        "type": "element",
                        "tag": "label",
                        "attributes": {
                          "class": "chk"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "span",
                            "attributes": {
                              "class": "cb on"
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
                                      "href": "#i-check"
                                    },
                                    "children": []
                                  }
                                ]
                              }
                            ]
                          },
                          {
                            "type": "text",
                            "value": "Mask cookies & Set-Cookie"
                          }
                        ]
                      },
                      {
                        "type": "text",
                        "value": "\n                "
                      },
                      {
                        "type": "element",
                        "tag": "label",
                        "attributes": {
                          "class": "chk"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "span",
                            "attributes": {
                              "class": "cb"
                            },
                            "children": []
                          },
                          {
                            "type": "text",
                            "value": "Strip request/response bodies"
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
                "value": "\n            "
              },
              {
                "type": "element",
                "tag": "div",
                "attributes": {
                  "class": "wnote danger transfer-only transfer-archive-export"
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
                          "href": "#i-alert"
                        },
                        "children": []
                      }
                    ]
                  },
                  {
                    "type": "element",
                    "tag": "span",
                    "attributes": {},
                    "children": [
                      {
                        "type": "text",
                        "value": "This capture contains complete headers, cookies, bodies, and URLs. Share it only with people you trust."
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
            "value": "\n          "
          },
          {
            "type": "element",
            "tag": "div",
            "attributes": {
              "class": "dlgfoot"
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
                  "class": "btn"
                },
                "children": [
                  {
                    "type": "text",
                    "value": "Cancel"
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
                  "class": "btn pri transfer-only transfer-har-import"
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
                          "href": "#i-upload"
                        },
                        "children": []
                      }
                    ]
                  },
                  {
                    "type": "text",
                    "value": "Import HAR"
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
                  "class": "btn pri transfer-only transfer-har-export"
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
                          "href": "#i-download"
                        },
                        "children": []
                      }
                    ]
                  },
                  {
                    "type": "text",
                    "value": "Export 10 requests"
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
                  "class": "btn pri transfer-only transfer-archive-import"
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
                          "href": "#i-upload"
                        },
                        "children": []
                      }
                    ]
                  },
                  {
                    "type": "text",
                    "value": "Open Capture"
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
                  "class": "btn pri transfer-only transfer-archive-export"
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
                          "href": "#i-download"
                        },
                        "children": []
                      }
                    ]
                  },
                  {
                    "type": "text",
                    "value": "Save Capture"
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
  },
  {
    "type": "element",
    "tag": "div",
    "attributes": {
      "class": "ov",
      "data-ov": "https-setup"
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
          "class": "dlg https-setup"
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
              "class": "dlghead"
            },
            "children": [
              {
                "type": "element",
                "tag": "span",
                "attributes": {
                  "class": "di"
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
                  }
                ]
              },
              {
                "type": "element",
                "tag": "b",
                "attributes": {},
                "children": [
                  {
                    "type": "text",
                    "value": "Decrypt HTTPS (MITM)"
                  }
                ]
              },
              {
                "type": "element",
                "tag": "button",
                "attributes": {
                  "class": "ib sm",
                  "data-close-overlay": ""
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
              }
            ]
          },
          {
            "type": "text",
            "value": "\n          "
          },
          {
            "type": "element",
            "tag": "div",
            "attributes": {
              "class": "https-body"
            },
            "children": [
              {
                "type": "text",
                "value": "\n            "
              },
              {
                "type": "text",
                "value": "\n            "
              },
              {
                "type": "element",
                "tag": "div",
                "attributes": {
                  "class": "chain"
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
                      "class": "chain-icon chain-client"
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
                              "href": "#i-app-window"
                            },
                            "children": []
                          }
                        ]
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
                      "class": "chain-wire chain-inbound"
                    },
                    "children": [
                      {
                        "type": "text",
                        "value": "\n                "
                      },
                      {
                        "type": "element",
                        "tag": "i",
                        "attributes": {
                          "class": "chain-seg"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "b",
                            "attributes": {
                              "class": "chain-flow"
                            },
                            "children": []
                          }
                        ]
                      },
                      {
                        "type": "text",
                        "value": "\n                "
                      },
                      {
                        "type": "element",
                        "tag": "span",
                        "attributes": {
                          "class": "chain-badge chain-route"
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
                          }
                        ]
                      },
                      {
                        "type": "text",
                        "value": "\n                "
                      },
                      {
                        "type": "element",
                        "tag": "i",
                        "attributes": {
                          "class": "chain-seg"
                        },
                        "children": []
                      },
                      {
                        "type": "text",
                        "value": "\n              "
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
                      "class": "chain-icon chain-self"
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
                    "value": "\n              "
                  },
                  {
                    "type": "element",
                    "tag": "div",
                    "attributes": {
                      "class": "chain-wire chain-outbound"
                    },
                    "children": [
                      {
                        "type": "text",
                        "value": "\n                "
                      },
                      {
                        "type": "element",
                        "tag": "i",
                        "attributes": {
                          "class": "chain-seg"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "b",
                            "attributes": {
                              "class": "chain-flow"
                            },
                            "children": []
                          }
                        ]
                      },
                      {
                        "type": "text",
                        "value": "\n                "
                      },
                      {
                        "type": "element",
                        "tag": "span",
                        "attributes": {
                          "class": "chain-badge chain-lock"
                        },
                        "children": [
                          {
                            "type": "text",
                            "value": "\n                  "
                          },
                          {
                            "type": "element",
                            "tag": "svg",
                            "attributes": {
                              "class": "chain-lock-secure"
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
                            "value": "\n                  "
                          },
                          {
                            "type": "element",
                            "tag": "svg",
                            "attributes": {
                              "class": "chain-lock-plain"
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
                            "value": "\n                "
                          }
                        ]
                      },
                      {
                        "type": "text",
                        "value": "\n                "
                      },
                      {
                        "type": "element",
                        "tag": "i",
                        "attributes": {
                          "class": "chain-seg"
                        },
                        "children": []
                      },
                      {
                        "type": "text",
                        "value": "\n              "
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
                      "class": "chain-icon chain-origin"
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
                              "href": "#i-globe"
                            },
                            "children": []
                          }
                        ]
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
                      "class": "chain-name chain-name-client"
                    },
                    "children": [
                      {
                        "type": "text",
                        "value": "Client apps"
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
                      "class": "chain-name chain-name-self"
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
                      "class": "chain-name chain-name-origin"
                    },
                    "children": [
                      {
                        "type": "text",
                        "value": "Internet"
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
                "tag": "p",
                "attributes": {},
                "children": [
                  {
                    "type": "text",
                    "value": "Set up a local root certificate only when you need to inspect HTTPS request and response content."
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
                  "class": "https-steps"
                },
                "children": [
                  {
                    "type": "text",
                    "value": "\n              "
                  },
                  {
                    "type": "element",
                    "tag": "div",
                    "attributes": {
                      "class": "https-row https-fresh-only"
                    },
                    "children": [
                      {
                        "type": "element",
                        "tag": "span",
                        "attributes": {
                          "class": "https-num"
                        },
                        "children": [
                          {
                            "type": "text",
                            "value": "1"
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "div",
                        "attributes": {
                          "class": "https-copy"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "b",
                            "attributes": {},
                            "children": [
                              {
                                "type": "text",
                                "value": "Root Certificate Authority"
                              }
                            ]
                          },
                          {
                            "type": "element",
                            "tag": "span",
                            "attributes": {},
                            "children": [
                              {
                                "type": "text",
                                "value": "No CA generated yet"
                              }
                            ]
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "button",
                        "attributes": {
                          "class": "btn pri"
                        },
                        "children": [
                          {
                            "type": "text",
                            "value": "Generate"
                          }
                        ]
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
                      "class": "https-row https-ready-only"
                    },
                    "children": [
                      {
                        "type": "element",
                        "tag": "span",
                        "attributes": {
                          "class": "https-num done"
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
                                  "href": "#i-check"
                                },
                                "children": []
                              }
                            ]
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "div",
                        "attributes": {
                          "class": "https-copy"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "b",
                            "attributes": {},
                            "children": [
                              {
                                "type": "text",
                                "value": "Root Certificate Authority"
                              }
                            ]
                          },
                          {
                            "type": "element",
                            "tag": "span",
                            "attributes": {},
                            "children": [
                              {
                                "type": "text",
                                "value": "CN=Interceptor CA, O=Interceptor"
                              }
                            ]
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "span",
                        "attributes": {
                          "class": "sbadge"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "span",
                            "attributes": {
                              "class": "d"
                            },
                            "children": []
                          },
                          {
                            "type": "text",
                            "value": "Generated"
                          }
                        ]
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
                      "class": "https-row pending https-fresh-only"
                    },
                    "children": [
                      {
                        "type": "element",
                        "tag": "span",
                        "attributes": {
                          "class": "https-num"
                        },
                        "children": [
                          {
                            "type": "text",
                            "value": "2"
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "div",
                        "attributes": {
                          "class": "https-copy"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "b",
                            "attributes": {},
                            "children": [
                              {
                                "type": "text",
                                "value": "Install to local trust store"
                              }
                            ]
                          },
                          {
                            "type": "element",
                            "tag": "span",
                            "attributes": {},
                            "children": [
                              {
                                "type": "text",
                                "value": "explicit OS authorization required"
                              }
                            ]
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "button",
                        "attributes": {
                          "class": "btn",
                          "disabled": ""
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
                                  "href": "#i-lock"
                                },
                                "children": []
                              }
                            ]
                          },
                          {
                            "type": "text",
                            "value": "Install…"
                          }
                        ]
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
                      "class": "https-row https-ready-only"
                    },
                    "children": [
                      {
                        "type": "element",
                        "tag": "span",
                        "attributes": {
                          "class": "https-num done"
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
                                  "href": "#i-check"
                                },
                                "children": []
                              }
                            ]
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "div",
                        "attributes": {
                          "class": "https-copy"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "b",
                            "attributes": {},
                            "children": [
                              {
                                "type": "text",
                                "value": "Install to local trust store"
                              }
                            ]
                          },
                          {
                            "type": "element",
                            "tag": "span",
                            "attributes": {},
                            "children": [
                              {
                                "type": "text",
                                "value": "explicit OS authorization required"
                              }
                            ]
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "span",
                        "attributes": {
                          "class": "sbadge"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "span",
                            "attributes": {
                              "class": "d"
                            },
                            "children": []
                          },
                          {
                            "type": "text",
                            "value": "Trusted"
                          }
                        ]
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
                      "class": "https-row pending https-fresh-only"
                    },
                    "children": [
                      {
                        "type": "element",
                        "tag": "span",
                        "attributes": {
                          "class": "https-num"
                        },
                        "children": [
                          {
                            "type": "text",
                            "value": "3"
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "div",
                        "attributes": {
                          "class": "https-copy"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "b",
                            "attributes": {},
                            "children": [
                              {
                                "type": "text",
                                "value": "Decrypt HTTPS (MITM)"
                              }
                            ]
                          },
                          {
                            "type": "element",
                            "tag": "span",
                            "attributes": {},
                            "children": [
                              {
                                "type": "text",
                                "value": "The local proxy restarts on the same address."
                              }
                            ]
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "span",
                        "attributes": {
                          "class": "sbadge waiting"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "span",
                            "attributes": {
                              "class": "d"
                            },
                            "children": []
                          },
                          {
                            "type": "text",
                            "value": "waiting for trust installation"
                          }
                        ]
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
                      "class": "https-row https-ready-only"
                    },
                    "children": [
                      {
                        "type": "element",
                        "tag": "span",
                        "attributes": {
                          "class": "https-num"
                        },
                        "children": [
                          {
                            "type": "text",
                            "value": "3"
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "div",
                        "attributes": {
                          "class": "https-copy"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "b",
                            "attributes": {},
                            "children": [
                              {
                                "type": "text",
                                "value": "Decrypt HTTPS (MITM)"
                              }
                            ]
                          },
                          {
                            "type": "element",
                            "tag": "span",
                            "attributes": {},
                            "children": [
                              {
                                "type": "text",
                                "value": "The local proxy restarts on the same address."
                              }
                            ]
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "span",
                        "attributes": {
                          "class": "sbadge waiting"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "span",
                            "attributes": {
                              "class": "d"
                            },
                            "children": []
                          },
                          {
                            "type": "text",
                            "value": "Ready"
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
                  "class": "privacy-note"
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
                          "href": "#i-lock"
                        },
                        "children": []
                      }
                    ]
                  },
                  {
                    "type": "element",
                    "tag": "span",
                    "attributes": {},
                    "children": [
                      {
                        "type": "text",
                        "value": "Until setup completes, HTTPS continues through encrypted and uninterrupted."
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
            "value": "\n          "
          },
          {
            "type": "element",
            "tag": "div",
            "attributes": {
              "class": "dlgfoot"
            },
            "children": [
              {
                "type": "element",
                "tag": "button",
                "attributes": {
                  "class": "btn",
                  "data-close-overlay": ""
                },
                "children": [
                  {
                    "type": "text",
                    "value": "Cancel"
                  }
                ]
              },
              {
                "type": "element",
                "tag": "button",
                "attributes": {
                  "class": "btn pri https-fresh-only",
                  "disabled": ""
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
                    "value": "Start decrypting"
                  }
                ]
              },
              {
                "type": "element",
                "tag": "button",
                "attributes": {
                  "class": "btn pri https-ready-only"
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
                    "value": "Start decrypting"
                  }
                ]
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
  },
  {
    "type": "element",
    "tag": "div",
    "attributes": {
      "class": "ov",
      "data-ov": "proxy-not-ready"
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
          "class": "dlg proxy-ready-dialog"
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
              "class": "dlghead"
            },
            "children": [
              {
                "type": "element",
                "tag": "span",
                "attributes": {
                  "class": "di warning"
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
                          "href": "#i-alert"
                        },
                        "children": []
                      }
                    ]
                  }
                ]
              },
              {
                "type": "element",
                "tag": "b",
                "attributes": {},
                "children": [
                  {
                    "type": "text",
                    "value": "Proxy not ready"
                  }
                ]
              },
              {
                "type": "element",
                "tag": "button",
                "attributes": {
                  "class": "ib sm",
                  "data-close-overlay": ""
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
              }
            ]
          },
          {
            "type": "text",
            "value": "\n          "
          },
          {
            "type": "element",
            "tag": "div",
            "attributes": {
              "class": "proxy-ready-body"
            },
            "children": [
              {
                "type": "text",
                "value": "\n            "
              },
              {
                "type": "element",
                "tag": "p",
                "attributes": {},
                "children": [
                  {
                    "type": "text",
                    "value": "Enable the proxy before starting recording."
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
                  "class": "proxy-ready-status"
                },
                "children": [
                  {
                    "type": "element",
                    "tag": "span",
                    "attributes": {
                      "class": "proxy-ready-dot"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "div",
                    "attributes": {},
                    "children": [
                      {
                        "type": "element",
                        "tag": "b",
                        "attributes": {},
                        "children": [
                          {
                            "type": "text",
                            "value": "System Proxy off"
                          }
                        ]
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
                "tag": "div",
                "attributes": {
                  "class": "privacy-note"
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
                    "type": "element",
                    "tag": "span",
                    "attributes": {},
                    "children": [
                      {
                        "type": "text",
                        "value": "Interceptor only takes ownership after the current configuration is saved for guarded restoration."
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
            "value": "\n          "
          },
          {
            "type": "element",
            "tag": "div",
            "attributes": {
              "class": "dlgfoot"
            },
            "children": [
              {
                "type": "element",
                "tag": "button",
                "attributes": {
                  "class": "btn",
                  "data-close-overlay": ""
                },
                "children": [
                  {
                    "type": "text",
                    "value": "Cancel"
                  }
                ]
              },
              {
                "type": "element",
                "tag": "button",
                "attributes": {
                  "class": "btn"
                },
                "children": [
                  {
                    "type": "text",
                    "value": "Proxy & Listener"
                  }
                ]
              },
              {
                "type": "element",
                "tag": "button",
                "attributes": {
                  "class": "btn pri"
                },
                "children": [
                  {
                    "type": "text",
                    "value": "Enable"
                  }
                ]
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
  },
  {
    "type": "element",
    "tag": "div",
    "attributes": {
      "class": "ov",
      "data-ov": "app-container-confirm"
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
          "class": "dlg settings-confirm-dialog"
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
              "class": "dlghead"
            },
            "children": [
              {
                "type": "element",
                "tag": "span",
                "attributes": {
                  "class": "di warning"
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
                  }
                ]
              },
              {
                "type": "element",
                "tag": "b",
                "attributes": {
                  "data-app-container-confirm-title": ""
                },
                "children": [
                  {
                    "type": "text",
                    "value": "Allow loopback access?"
                  }
                ]
              },
              {
                "type": "element",
                "tag": "button",
                "attributes": {
                  "class": "ib sm",
                  "data-close-overlay": "",
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
              }
            ]
          },
          {
            "type": "text",
            "value": "\n          "
          },
          {
            "type": "element",
            "tag": "div",
            "attributes": {
              "class": "settings-confirm-body"
            },
            "children": [
              {
                "type": "text",
                "value": "\n            "
              },
              {
                "type": "element",
                "tag": "p",
                "attributes": {},
                "children": [
                  {
                    "type": "element",
                    "tag": "b",
                    "attributes": {
                      "data-app-container-confirm-name": ""
                    },
                    "children": [
                      {
                        "type": "text",
                        "value": "Microsoft AAD Broker Plugin"
                      }
                    ]
                  },
                  {
                    "type": "text",
                    "value": " "
                  },
                  {
                    "type": "element",
                    "tag": "span",
                    "attributes": {
                      "data-app-container-confirm-action": ""
                    },
                    "children": [
                      {
                        "type": "text",
                        "value": "will be allowed to connect to local services on this PC."
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
                "tag": "div",
                "attributes": {
                  "class": "settings-identity"
                },
                "children": [
                  {
                    "type": "element",
                    "tag": "span",
                    "attributes": {},
                    "children": [
                      {
                        "type": "text",
                        "value": "AppContainer SID"
                      }
                    ]
                  },
                  {
                    "type": "element",
                    "tag": "code",
                    "attributes": {
                      "data-app-container-confirm-sid": ""
                    },
                    "children": [
                      {
                        "type": "text",
                        "value": "S-1-15-2-1910091885-1573563583-1104941280-2418270861-3411158377-2822700936-2990310272"
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
                "tag": "div",
                "attributes": {
                  "class": "wnote"
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
                          "href": "#i-alert"
                        },
                        "children": []
                      }
                    ]
                  },
                  {
                    "type": "element",
                    "tag": "span",
                    "attributes": {},
                    "children": [
                      {
                        "type": "text",
                        "value": "This permission covers every loopback port, not only Interceptor. It persists after Interceptor exits and remains until you turn this switch off."
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
                "tag": "div",
                "attributes": {
                  "class": "privacy-note"
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
                    "type": "element",
                    "tag": "span",
                    "attributes": {},
                    "children": [
                      {
                        "type": "text",
                        "value": "Windows will show an administrator approval prompt before the setting changes."
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
            "value": "\n          "
          },
          {
            "type": "element",
            "tag": "div",
            "attributes": {
              "class": "dlgfoot"
            },
            "children": [
              {
                "type": "element",
                "tag": "button",
                "attributes": {
                  "class": "btn",
                  "data-close-overlay": ""
                },
                "children": [
                  {
                    "type": "text",
                    "value": "Cancel"
                  }
                ]
              },
              {
                "type": "element",
                "tag": "button",
                "attributes": {
                  "class": "btn pri",
                  "data-app-container-confirm": ""
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
                    "type": "element",
                    "tag": "span",
                    "attributes": {
                      "data-app-container-confirm-button": ""
                    },
                    "children": [
                      {
                        "type": "text",
                        "value": "Continue to Windows approval"
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
          }
        ]
      },
      {
        "type": "text",
        "value": "\n      "
      }
    ]
  },
  {
    "type": "element",
    "tag": "div",
    "attributes": {
      "class": "ov",
      "data-ov": "tls-compatibility"
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
          "class": "dlg settings-confirm-dialog tls-compatibility-dialog"
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
              "class": "dlghead"
            },
            "children": [
              {
                "type": "element",
                "tag": "span",
                "attributes": {
                  "class": "di warning"
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
                          "href": "#i-lock-off"
                        },
                        "children": []
                      }
                    ]
                  }
                ]
              },
              {
                "type": "element",
                "tag": "b",
                "attributes": {},
                "children": [
                  {
                    "type": "text",
                    "value": "TLS interception may be incompatible"
                  }
                ]
              },
              {
                "type": "element",
                "tag": "button",
                "attributes": {
                  "class": "ib sm",
                  "data-tls-compatibility-dismiss": "",
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
              }
            ]
          },
          {
            "type": "text",
            "value": "\n          "
          },
          {
            "type": "element",
            "tag": "div",
            "attributes": {
              "class": "settings-confirm-body"
            },
            "children": [
              {
                "type": "text",
                "value": "\n            "
              },
              {
                "type": "element",
                "tag": "p",
                "attributes": {},
                "children": [
                  {
                    "type": "element",
                    "tag": "span",
                    "attributes": {
                      "data-tls-compatibility-count": ""
                    },
                    "children": [
                      {
                        "type": "text",
                        "value": "3 hosts"
                      }
                    ]
                  },
                  {
                    "type": "text",
                    "value": " failed during intercepted TLS handshakes. Each host is preselected on its own; pick a wildcard instead if the whole domain should skip interception."
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
                  "class": "tls-compatibility-list"
                },
                "children": [
                  {
                    "type": "text",
                    "value": "\n              "
                  },
                  {
                    "type": "element",
                    "tag": "div",
                    "attributes": {
                      "class": "tls-compatibility-row",
                      "data-tls-compatibility-host": "rdweb.wvd.microsoft.com"
                    },
                    "children": [
                      {
                        "type": "element",
                        "tag": "span",
                        "attributes": {
                          "class": "tls-compatibility-host-icon"
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
                                  "href": "#i-lock-off"
                                },
                                "children": []
                              }
                            ]
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "div",
                        "attributes": {
                          "class": "tls-compatibility-copy"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "code",
                            "attributes": {},
                            "children": [
                              {
                                "type": "text",
                                "value": "rdweb.wvd.microsoft.com"
                              }
                            ]
                          },
                          {
                            "type": "element",
                            "tag": "span",
                            "attributes": {},
                            "children": [
                              {
                                "type": "text",
                                "value": "Connection closed during intercepted TLS handshake"
                              }
                            ]
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "div",
                        "attributes": {
                          "class": "tls-pattern-choices"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "label",
                            "attributes": {
                              "class": "tls-pattern-choice"
                            },
                            "children": [
                              {
                                "type": "element",
                                "tag": "span",
                                "attributes": {
                                  "class": "cb on"
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
                                          "href": "#i-check"
                                        },
                                        "children": []
                                      }
                                    ]
                                  }
                                ]
                              },
                              {
                                "type": "element",
                                "tag": "code",
                                "attributes": {},
                                "children": [
                                  {
                                    "type": "text",
                                    "value": "rdweb.wvd.microsoft.com"
                                  }
                                ]
                              }
                            ]
                          },
                          {
                            "type": "element",
                            "tag": "label",
                            "attributes": {
                              "class": "tls-pattern-choice"
                            },
                            "children": [
                              {
                                "type": "element",
                                "tag": "span",
                                "attributes": {
                                  "class": "cb"
                                },
                                "children": []
                              },
                              {
                                "type": "element",
                                "tag": "code",
                                "attributes": {},
                                "children": [
                                  {
                                    "type": "text",
                                    "value": "*.wvd.microsoft.com"
                                  }
                                ]
                              }
                            ]
                          },
                          {
                            "type": "element",
                            "tag": "label",
                            "attributes": {
                              "class": "tls-pattern-choice"
                            },
                            "children": [
                              {
                                "type": "element",
                                "tag": "span",
                                "attributes": {
                                  "class": "cb"
                                },
                                "children": []
                              },
                              {
                                "type": "element",
                                "tag": "code",
                                "attributes": {},
                                "children": [
                                  {
                                    "type": "text",
                                    "value": "*.microsoft.com"
                                  }
                                ]
                              }
                            ]
                          }
                        ]
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
                      "class": "tls-compatibility-row",
                      "data-tls-compatibility-host": "windows365.microsoft.com"
                    },
                    "children": [
                      {
                        "type": "element",
                        "tag": "span",
                        "attributes": {
                          "class": "tls-compatibility-host-icon"
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
                                  "href": "#i-lock-off"
                                },
                                "children": []
                              }
                            ]
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "div",
                        "attributes": {
                          "class": "tls-compatibility-copy"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "code",
                            "attributes": {},
                            "children": [
                              {
                                "type": "text",
                                "value": "windows365.microsoft.com"
                              }
                            ]
                          },
                          {
                            "type": "element",
                            "tag": "span",
                            "attributes": {},
                            "children": [
                              {
                                "type": "text",
                                "value": "Connection closed during intercepted TLS handshake"
                              }
                            ]
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "div",
                        "attributes": {
                          "class": "tls-pattern-choices"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "label",
                            "attributes": {
                              "class": "tls-pattern-choice"
                            },
                            "children": [
                              {
                                "type": "element",
                                "tag": "span",
                                "attributes": {
                                  "class": "cb on"
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
                                          "href": "#i-check"
                                        },
                                        "children": []
                                      }
                                    ]
                                  }
                                ]
                              },
                              {
                                "type": "element",
                                "tag": "code",
                                "attributes": {},
                                "children": [
                                  {
                                    "type": "text",
                                    "value": "windows365.microsoft.com"
                                  }
                                ]
                              }
                            ]
                          },
                          {
                            "type": "element",
                            "tag": "label",
                            "attributes": {
                              "class": "tls-pattern-choice"
                            },
                            "children": [
                              {
                                "type": "element",
                                "tag": "span",
                                "attributes": {
                                  "class": "cb"
                                },
                                "children": []
                              },
                              {
                                "type": "element",
                                "tag": "code",
                                "attributes": {},
                                "children": [
                                  {
                                    "type": "text",
                                    "value": "*.microsoft.com"
                                  }
                                ]
                              }
                            ]
                          }
                        ]
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
                      "class": "tls-compatibility-row",
                      "data-tls-compatibility-host": "afdfp-rdgateway-r0.wvd.microsoft.com"
                    },
                    "children": [
                      {
                        "type": "element",
                        "tag": "span",
                        "attributes": {
                          "class": "tls-compatibility-host-icon"
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
                                  "href": "#i-lock-off"
                                },
                                "children": []
                              }
                            ]
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "div",
                        "attributes": {
                          "class": "tls-compatibility-copy"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "code",
                            "attributes": {},
                            "children": [
                              {
                                "type": "text",
                                "value": "afdfp-rdgateway-r0.wvd.microsoft.com"
                              }
                            ]
                          },
                          {
                            "type": "element",
                            "tag": "span",
                            "attributes": {},
                            "children": [
                              {
                                "type": "text",
                                "value": "Client rejected the Interceptor certificate"
                              }
                            ]
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "div",
                        "attributes": {
                          "class": "tls-pattern-choices"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "label",
                            "attributes": {
                              "class": "tls-pattern-choice"
                            },
                            "children": [
                              {
                                "type": "element",
                                "tag": "span",
                                "attributes": {
                                  "class": "cb on"
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
                                          "href": "#i-check"
                                        },
                                        "children": []
                                      }
                                    ]
                                  }
                                ]
                              },
                              {
                                "type": "element",
                                "tag": "code",
                                "attributes": {},
                                "children": [
                                  {
                                    "type": "text",
                                    "value": "afdfp-rdgateway-r0.wvd.microsoft.com"
                                  }
                                ]
                              }
                            ]
                          },
                          {
                            "type": "element",
                            "tag": "label",
                            "attributes": {
                              "class": "tls-pattern-choice"
                            },
                            "children": [
                              {
                                "type": "element",
                                "tag": "span",
                                "attributes": {
                                  "class": "cb"
                                },
                                "children": []
                              },
                              {
                                "type": "element",
                                "tag": "code",
                                "attributes": {},
                                "children": [
                                  {
                                    "type": "text",
                                    "value": "*.wvd.microsoft.com"
                                  }
                                ]
                              }
                            ]
                          },
                          {
                            "type": "element",
                            "tag": "label",
                            "attributes": {
                              "class": "tls-pattern-choice"
                            },
                            "children": [
                              {
                                "type": "element",
                                "tag": "span",
                                "attributes": {
                                  "class": "cb"
                                },
                                "children": []
                              },
                              {
                                "type": "element",
                                "tag": "code",
                                "attributes": {},
                                "children": [
                                  {
                                    "type": "text",
                                    "value": "*.microsoft.com"
                                  }
                                ]
                              }
                            ]
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
                  "class": "privacy-note"
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
                    "type": "element",
                    "tag": "span",
                    "attributes": {},
                    "children": [
                      {
                        "type": "text",
                        "value": "Saved patterns apply to new connections immediately and do not interrupt current proxy traffic. TLS passthrough settings will open so you can review the list."
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
            "value": "\n          "
          },
          {
            "type": "element",
            "tag": "div",
            "attributes": {
              "class": "dlgfoot"
            },
            "children": [
              {
                "type": "element",
                "tag": "button",
                "attributes": {
                  "class": "btn",
                  "data-tls-compatibility-dismiss": ""
                },
                "children": [
                  {
                    "type": "text",
                    "value": "Not now"
                  }
                ]
              },
              {
                "type": "element",
                "tag": "button",
                "attributes": {
                  "class": "btn pri",
                  "data-tls-compatibility-add-dialog": ""
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
                          "href": "#i-lock-off"
                        },
                        "children": []
                      }
                    ]
                  },
                  {
                    "type": "element",
                    "tag": "span",
                    "attributes": {
                      "data-tls-compatibility-add-label": ""
                    },
                    "children": [
                      {
                        "type": "text",
                        "value": "Add 3 patterns"
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
          }
        ]
      },
      {
        "type": "text",
        "value": "\n      "
      }
    ]
  },
  {
    "type": "element",
    "tag": "div",
    "attributes": {
      "class": "ov",
      "data-ov": "body-full"
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
          "class": "bodyfull"
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
              "class": "bodyfull-head"
            },
            "children": [
              {
                "type": "element",
                "tag": "b",
                "attributes": {},
                "children": [
                  {
                    "type": "text",
                    "value": "Response body"
                  }
                ]
              },
              {
                "type": "element",
                "tag": "span",
                "attributes": {
                  "class": "c"
                },
                "children": [
                  {
                    "type": "text",
                    "value": "html · 84 KB"
                  }
                ]
              },
              {
                "type": "element",
                "tag": "span",
                "attributes": {
                  "class": "sp"
                },
                "children": []
              },
              {
                "type": "element",
                "tag": "button",
                "attributes": {
                  "class": "ib sm",
                  "aria-label": "Copy body",
                  "title": "Copy"
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
                          "href": "#i-copy"
                        },
                        "children": []
                      }
                    ]
                  }
                ]
              },
              {
                "type": "element",
                "tag": "button",
                "attributes": {
                  "class": "ib sm",
                  "data-close-overlay": "",
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
              "class": "bodyfull-body"
            },
            "children": [
              {
                "type": "text",
                "value": "\n              "
              },
              {
                "type": "element",
                "tag": "div",
                "attributes": {
                  "class": "bodybar",
                  "data-kind": "code",
                  "style": "display:flex"
                },
                "children": [
                  {
                    "type": "element",
                    "tag": "div",
                    "attributes": {
                      "class": "seg"
                    },
                    "children": [
                      {
                        "type": "element",
                        "tag": "span",
                        "attributes": {
                          "class": "on",
                          "data-mode": "default"
                        },
                        "children": [
                          {
                            "type": "text",
                            "value": "Code"
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "span",
                        "attributes": {
                          "data-mode": "raw"
                        },
                        "children": [
                          {
                            "type": "text",
                            "value": "Raw"
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "span",
                        "attributes": {
                          "data-mode": "hex"
                        },
                        "children": [
                          {
                            "type": "text",
                            "value": "Hex"
                          }
                        ]
                      }
                    ]
                  },
                  {
                    "type": "element",
                    "tag": "span",
                    "attributes": {
                      "class": "sp"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "span",
                    "attributes": {
                      "class": "cnt"
                    },
                    "children": [
                      {
                        "type": "text",
                        "value": "text/html"
                      }
                    ]
                  },
                  {
                    "type": "element",
                    "tag": "div",
                    "attributes": {
                      "class": "icon-actions"
                    },
                    "children": [
                      {
                        "type": "element",
                        "tag": "button",
                        "attributes": {
                          "class": "ib sm bodyfmt",
                          "aria-label": "Format",
                          "title": "Format"
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
                                  "href": "#i-code"
                                },
                                "children": []
                              }
                            ]
                          }
                        ]
                      }
                    ]
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
                  "class": "bodybox grow"
                },
                "children": [
                  {
                    "type": "text",
                    "value": "<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  <title>Datang EV · Model Overview</title>\n  <link rel=\"stylesheet\" href=\"/assets/app.8f2c1d.css\" />\n  <script defer src=\"/assets/vendor.4a9b02.js\"></script>\n</head>\n<body class=\"theme-light\">\n  <header class=\"site-header\">\n    <a class=\"brand\" href=\"/\">\n      <img src=\"/assets/logo@2x.png\" width=\"132\" height=\"28\" alt=\"Datang EV\" />\n    </a>\n    <nav class=\"primary-nav\">\n      <a href=\"/models\">Models</a>\n      <a href=\"/charging\">Charging</a>\n      <a href=\"/support\">Support</a>\n    </nav>\n  </header>\n\n  <main id=\"app\">\n    <section class=\"hero\" data-model=\"d7\">\n      <h1>D7 Long Range</h1>\n      <p class=\"lede\">705 km CLTC · 0–100 km/h in 3.8 s</p>\n      <button class=\"cta\" data-action=\"configure\">Configure</button>\n    </section>\n  </main>\n</body>\n</html>"
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
  }
];
