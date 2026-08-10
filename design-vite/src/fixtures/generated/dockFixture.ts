import type { FixtureNode } from '../FixtureNode';

export const dockFixture: FixtureNode = {
  "type": "element",
  "tag": "div",
  "attributes": {
    "class": "dock",
    "data-open": "false"
  },
  "children": [
    {
      "type": "text",
      "value": "\n      "
    },
    {
      "type": "element",
      "tag": "button",
      "attributes": {
        "class": "dock-toggle",
        "aria-label": "Toggle design controls"
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
                "href": "#i-settings"
              },
              "children": []
            }
          ]
        }
      ]
    },
    {
      "type": "text",
      "value": "\n      "
    },
    {
      "type": "element",
      "tag": "div",
      "attributes": {
        "class": "dock-panel"
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
            "class": "grp"
          },
          "children": [
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "lbl"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Feature"
                }
              ]
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "switch",
                "data-key": "view"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "capture"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Capture"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "rules"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Rules"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "composer"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Composer"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "diagnostics"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Diag"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "settings"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Settings"
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
            "class": "grp"
          },
          "children": [
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "lbl"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Rule font"
                }
              ]
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "switch",
                "data-key": "ruleTypography"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "current"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Current"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "composer"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Composer"
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
            "class": "grp"
          },
          "children": [
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "lbl"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Breakpoint"
                }
              ]
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "switch",
                "data-key": "breakpointState"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "none"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "None"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "request"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Request"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "response"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Response"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "queue"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Queue"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "full"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Full"
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
            "class": "grp"
          },
          "children": [
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "lbl"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Request body"
                }
              ]
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "switch",
                "data-key": "breakpointBody"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "loading"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Loading"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "ready"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Loaded"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "replace"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Replace"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "file"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "File"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "invalid"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Invalid"
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
            "class": "grp"
          },
          "children": [
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "lbl"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Break UI"
                }
              ]
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "switch",
                "data-key": "breakpointUi"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "none"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "None"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "panel"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Rules"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "armed"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Notice"
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
            "class": "grp"
          },
          "children": [
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "lbl"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Break mode"
                }
              ]
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "switch",
                "data-key": "breakpoints"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "on"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "On"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "off"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Off"
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
            "class": "grp"
          },
          "children": [
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "lbl"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Theme"
                }
              ]
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "switch",
                "data-key": "theme"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "light"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Light"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "warm"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Warm"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "dark"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Dark"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "ember"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Ember"
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
            "class": "grp"
          },
          "children": [
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "lbl"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Sidebar"
                }
              ]
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "switch",
                "data-key": "sidebar"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "expanded"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Expand"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "collapsed"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Collapse"
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
            "class": "grp"
          },
          "children": [
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "lbl"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Overlay"
                }
              ]
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "switch",
                "data-key": "overlay"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "none"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "None"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "https-setup"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "HTTPS"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "import-export"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Export"
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
            "class": "grp"
          },
          "children": [
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "lbl"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Boot"
                }
              ]
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "switch",
                "data-key": "boot"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "none"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Off"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "core"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Core"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "listener"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Listener"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "proxy"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Proxy"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "ready"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Ready"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "error"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Error"
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
            "class": "grp"
          },
          "children": [
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "lbl"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Upstream"
                }
              ]
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "switch",
                "data-key": "upstream"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "on"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "On"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "down"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Down"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "data-set": "none"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "None"
                    }
                  ]
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
    },
    {
      "type": "text",
      "value": "\n    "
    }
  ]
};
