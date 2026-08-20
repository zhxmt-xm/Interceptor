import type { FixtureNode } from '../FixtureNode';

export const rulesFixture: FixtureNode = {
  "type": "element",
  "tag": "div",
  "attributes": {
    "class": "mv rmain",
    "data-v": "rules"
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
        "class": "rlist"
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
            "class": "rlbar"
          },
          "children": [
            {
              "type": "element",
              "tag": "label",
              "attributes": {
                "class": "tree-search"
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
                        "href": "#i-search"
                      },
                      "children": []
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "input",
                  "attributes": {
                    "type": "text",
                    "placeholder": "Search rules…",
                    "aria-label": "Search rules",
                    "value": ""
                  },
                  "children": []
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
                    "class": "ib sm",
                    "aria-label": "New rule",
                    "title": "New rule"
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
                            "href": "#i-plus"
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
                    "class": "ib sm rlbar-newfolder",
                    "aria-label": "New folder",
                    "title": "New folder"
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
                            "href": "#i-folder-plus"
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
                    "data-rules-import": "",
                    "aria-label": "Import rules",
                    "title": "Import rules"
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
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "class": "ib sm",
                    "aria-label": "Export rules",
                    "title": "Export rules"
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
            "class": "rtree"
          },
          "children": [
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "searchempty"
              },
              "children": [
                {
                  "type": "text",
                  "value": "No rules match"
                }
              ]
            },
            {
              "type": "text",
              "value": "\n              "
            },
            {
              "type": "element",
              "tag": "section",
              "attributes": {
                "class": "rgrp on",
                "data-rgrp": "mock"
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
                    "class": "rgrp-h",
                    "draggable": "true"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "rgrp-chevbtn",
                        "aria-label": "Collapse folder"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "svg",
                          "attributes": {
                            "class": "rgrp-chev"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "use",
                              "attributes": {
                                "href": "#i-chev"
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
                        "class": "rgrp-namebtn"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "svg",
                          "attributes": {
                            "class": "rgrp-icon"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "use",
                              "attributes": {
                                "href": "#i-folder"
                              },
                              "children": []
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "rgrp-n"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Mock & stub"
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "rgrp-more",
                        "aria-label": "Folder actions",
                        "title": "Rename, add subfolder, delete"
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
                                "href": "#i-more"
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
                  "value": "\n                "
                },
                {
                  "type": "element",
                  "tag": "div",
                  "attributes": {
                    "class": "rgrp-b"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "\n                  "
                    },
                    {
                      "type": "element",
                      "tag": "div",
                      "attributes": {
                        "class": "rrule sel open",
                        "draggable": "true",
                        "title": "Open in editor"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "sw sm on"
                          },
                          "children": []
                        },
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "rrule-main"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "rrule-n"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "Stub /v1/user"
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "rrule-u"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "api.example.com/v1/user"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "rchips"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "rchip map"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "Map Local"
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "rchip rewrite"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "Rewrite"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "rhit"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "128"
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "type": "text",
                      "value": "\n                  "
                    },
                    {
                      "type": "element",
                      "tag": "div",
                      "attributes": {
                        "class": "rrule",
                        "draggable": "true"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "sw sm on"
                          },
                          "children": []
                        },
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "rrule-main"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "rrule-n"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "Force CORS + JSON"
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "rrule-u"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "*.api.com"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "rchips"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "rchip rewrite"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "Rewrite"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "rhit"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "512"
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "type": "text",
                      "value": "\n                  "
                    },
                    {
                      "type": "element",
                      "tag": "section",
                      "attributes": {
                        "class": "rgrp on",
                        "data-rgrp": "payments"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "\n                    "
                        },
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "rgrp-h",
                            "draggable": "true"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "button",
                              "attributes": {
                                "class": "rgrp-chevbtn",
                                "aria-label": "Collapse folder"
                              },
                              "children": [
                                {
                                  "type": "element",
                                  "tag": "svg",
                                  "attributes": {
                                    "class": "rgrp-chev"
                                  },
                                  "children": [
                                    {
                                      "type": "element",
                                      "tag": "use",
                                      "attributes": {
                                        "href": "#i-chev"
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
                                "class": "rgrp-namebtn"
                              },
                              "children": [
                                {
                                  "type": "element",
                                  "tag": "svg",
                                  "attributes": {
                                    "class": "rgrp-icon"
                                  },
                                  "children": [
                                    {
                                      "type": "element",
                                      "tag": "use",
                                      "attributes": {
                                        "href": "#i-folder"
                                      },
                                      "children": []
                                    }
                                  ]
                                },
                                {
                                  "type": "element",
                                  "tag": "span",
                                  "attributes": {
                                    "class": "rgrp-n"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": "Payments"
                                    }
                                  ]
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "button",
                              "attributes": {
                                "class": "rgrp-more",
                                "aria-label": "Folder actions",
                                "title": "Rename, add subfolder, delete"
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
                                        "href": "#i-more"
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
                          "value": "\n                    "
                        },
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "rgrp-b"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "\n                      "
                            },
                            {
                              "type": "element",
                              "tag": "div",
                              "attributes": {
                                "class": "rrule",
                                "draggable": "true"
                              },
                              "children": [
                                {
                                  "type": "element",
                                  "tag": "div",
                                  "attributes": {
                                    "class": "sw sm on"
                                  },
                                  "children": []
                                },
                                {
                                  "type": "element",
                                  "tag": "div",
                                  "attributes": {
                                    "class": "rrule-main"
                                  },
                                  "children": [
                                    {
                                      "type": "element",
                                      "tag": "span",
                                      "attributes": {
                                        "class": "rrule-n"
                                      },
                                      "children": [
                                        {
                                          "type": "text",
                                          "value": "Mock payment"
                                        }
                                      ]
                                    },
                                    {
                                      "type": "element",
                                      "tag": "span",
                                      "attributes": {
                                        "class": "rrule-u"
                                      },
                                      "children": [
                                        {
                                          "type": "text",
                                          "value": "api.stripe.com/v1/charges"
                                        }
                                      ]
                                    }
                                  ]
                                },
                                {
                                  "type": "element",
                                  "tag": "div",
                                  "attributes": {
                                    "class": "rchips"
                                  },
                                  "children": [
                                    {
                                      "type": "element",
                                      "tag": "span",
                                      "attributes": {
                                        "class": "rchip block"
                                      },
                                      "children": [
                                        {
                                          "type": "text",
                                          "value": "Synthetic"
                                        }
                                      ]
                                    }
                                  ]
                                },
                                {
                                  "type": "element",
                                  "tag": "span",
                                  "attributes": {
                                    "class": "rhit"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": "21"
                                    }
                                  ]
                                }
                              ]
                            },
                            {
                              "type": "text",
                              "value": "\n                      "
                            },
                            {
                              "type": "element",
                              "tag": "section",
                              "attributes": {
                                "class": "rgrp on",
                                "data-rgrp": "refunds"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "\n                        "
                                },
                                {
                                  "type": "element",
                                  "tag": "div",
                                  "attributes": {
                                    "class": "rgrp-h",
                                    "draggable": "true"
                                  },
                                  "children": [
                                    {
                                      "type": "element",
                                      "tag": "button",
                                      "attributes": {
                                        "class": "rgrp-chevbtn",
                                        "aria-label": "Collapse folder"
                                      },
                                      "children": [
                                        {
                                          "type": "element",
                                          "tag": "svg",
                                          "attributes": {
                                            "class": "rgrp-chev"
                                          },
                                          "children": [
                                            {
                                              "type": "element",
                                              "tag": "use",
                                              "attributes": {
                                                "href": "#i-chev"
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
                                        "class": "rgrp-namebtn"
                                      },
                                      "children": [
                                        {
                                          "type": "element",
                                          "tag": "svg",
                                          "attributes": {
                                            "class": "rgrp-icon"
                                          },
                                          "children": [
                                            {
                                              "type": "element",
                                              "tag": "use",
                                              "attributes": {
                                                "href": "#i-folder"
                                              },
                                              "children": []
                                            }
                                          ]
                                        },
                                        {
                                          "type": "element",
                                          "tag": "span",
                                          "attributes": {
                                            "class": "rgrp-n"
                                          },
                                          "children": [
                                            {
                                              "type": "text",
                                              "value": "Refunds"
                                            }
                                          ]
                                        }
                                      ]
                                    },
                                    {
                                      "type": "element",
                                      "tag": "button",
                                      "attributes": {
                                        "class": "rgrp-more",
                                        "aria-label": "Folder actions",
                                        "title": "Rename, add subfolder, delete"
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
                                                "href": "#i-more"
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
                                  "value": "\n                        "
                                },
                                {
                                  "type": "element",
                                  "tag": "div",
                                  "attributes": {
                                    "class": "rgrp-b"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": "\n                          "
                                    },
                                    {
                                      "type": "element",
                                      "tag": "div",
                                      "attributes": {
                                        "class": "rrule",
                                        "draggable": "true"
                                      },
                                      "children": [
                                        {
                                          "type": "element",
                                          "tag": "div",
                                          "attributes": {
                                            "class": "sw sm on"
                                          },
                                          "children": []
                                        },
                                        {
                                          "type": "element",
                                          "tag": "div",
                                          "attributes": {
                                            "class": "rrule-main"
                                          },
                                          "children": [
                                            {
                                              "type": "element",
                                              "tag": "span",
                                              "attributes": {
                                                "class": "rrule-n"
                                              },
                                              "children": [
                                                {
                                                  "type": "text",
                                                  "value": "Refund stub"
                                                }
                                              ]
                                            },
                                            {
                                              "type": "element",
                                              "tag": "span",
                                              "attributes": {
                                                "class": "rrule-u"
                                              },
                                              "children": [
                                                {
                                                  "type": "text",
                                                  "value": "api.stripe.com/v1/refunds"
                                                }
                                              ]
                                            }
                                          ]
                                        },
                                        {
                                          "type": "element",
                                          "tag": "div",
                                          "attributes": {
                                            "class": "rchips"
                                          },
                                          "children": [
                                            {
                                              "type": "element",
                                              "tag": "span",
                                              "attributes": {
                                                "class": "rchip map"
                                              },
                                              "children": [
                                                {
                                                  "type": "text",
                                                  "value": "Map Local"
                                                }
                                              ]
                                            }
                                          ]
                                        },
                                        {
                                          "type": "element",
                                          "tag": "span",
                                          "attributes": {
                                            "class": "rhit"
                                          },
                                          "children": [
                                            {
                                              "type": "text",
                                              "value": "6"
                                            }
                                          ]
                                        }
                                      ]
                                    },
                                    {
                                      "type": "text",
                                      "value": "\n                          "
                                    },
                                    {
                                      "type": "element",
                                      "tag": "div",
                                      "attributes": {
                                        "class": "rrule",
                                        "draggable": "true"
                                      },
                                      "children": [
                                        {
                                          "type": "element",
                                          "tag": "div",
                                          "attributes": {
                                            "class": "sw sm on"
                                          },
                                          "children": []
                                        },
                                        {
                                          "type": "element",
                                          "tag": "div",
                                          "attributes": {
                                            "class": "rrule-main"
                                          },
                                          "children": [
                                            {
                                              "type": "element",
                                              "tag": "span",
                                              "attributes": {
                                                "class": "rrule-n"
                                              },
                                              "children": [
                                                {
                                                  "type": "text",
                                                  "value": "Dispute stub"
                                                }
                                              ]
                                            },
                                            {
                                              "type": "element",
                                              "tag": "span",
                                              "attributes": {
                                                "class": "rrule-u"
                                              },
                                              "children": [
                                                {
                                                  "type": "text",
                                                  "value": "api.stripe.com/v1/disputes"
                                                }
                                              ]
                                            }
                                          ]
                                        },
                                        {
                                          "type": "element",
                                          "tag": "div",
                                          "attributes": {
                                            "class": "rchips"
                                          },
                                          "children": [
                                            {
                                              "type": "element",
                                              "tag": "span",
                                              "attributes": {
                                                "class": "rchip rewrite"
                                              },
                                              "children": [
                                                {
                                                  "type": "text",
                                                  "value": "Rewrite"
                                                }
                                              ]
                                            }
                                          ]
                                        },
                                        {
                                          "type": "element",
                                          "tag": "span",
                                          "attributes": {
                                            "class": "rhit"
                                          },
                                          "children": [
                                            {
                                              "type": "text",
                                              "value": "4"
                                            }
                                          ]
                                        }
                                      ]
                                    },
                                    {
                                      "type": "text",
                                      "value": "\n                        "
                                    }
                                  ]
                                },
                                {
                                  "type": "text",
                                  "value": "\n                      "
                                }
                              ]
                            },
                            {
                              "type": "text",
                              "value": "\n                    "
                            }
                          ]
                        },
                        {
                          "type": "text",
                          "value": "\n                  "
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
              "tag": "section",
              "attributes": {
                "class": "rgrp on",
                "data-rgrp": "staging"
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
                    "class": "rgrp-h",
                    "draggable": "true"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "rgrp-chevbtn",
                        "aria-label": "Collapse folder"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "svg",
                          "attributes": {
                            "class": "rgrp-chev"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "use",
                              "attributes": {
                                "href": "#i-chev"
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
                        "class": "rgrp-namebtn"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "svg",
                          "attributes": {
                            "class": "rgrp-icon"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "use",
                              "attributes": {
                                "href": "#i-folder"
                              },
                              "children": []
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "rgrp-n"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Staging switch"
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "rgrp-more",
                        "aria-label": "Folder actions",
                        "title": "Rename, add subfolder, delete"
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
                                "href": "#i-more"
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
                  "value": "\n                "
                },
                {
                  "type": "element",
                  "tag": "div",
                  "attributes": {
                    "class": "rgrp-b"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "\n                  "
                    },
                    {
                      "type": "element",
                      "tag": "div",
                      "attributes": {
                        "class": "rrule",
                        "draggable": "true"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "sw sm on"
                          },
                          "children": []
                        },
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "rrule-main"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "rrule-n"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "Redirect to staging"
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "rrule-u"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "prod.example.com → stg"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "rchips"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "rchip remote"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "Map Remote"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "rhit"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "44"
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "type": "text",
                      "value": "\n                  "
                    },
                    {
                      "type": "element",
                      "tag": "div",
                      "attributes": {
                        "class": "rrule off",
                        "draggable": "true"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "sw sm"
                          },
                          "children": []
                        },
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "rrule-main"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "rrule-n"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "Rewrite auth header"
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "rrule-u"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "api.github.com"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "rchips"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "rchip rewrite"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "Rewrite"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "rhit"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "76"
                            }
                          ]
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
              "tag": "section",
              "attributes": {
                "class": "rgrp",
                "data-rgrp": "noise"
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
                    "class": "rgrp-h",
                    "draggable": "true"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "rgrp-chevbtn",
                        "aria-label": "Expand folder"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "svg",
                          "attributes": {
                            "class": "rgrp-chev"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "use",
                              "attributes": {
                                "href": "#i-chev"
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
                        "class": "rgrp-namebtn"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "svg",
                          "attributes": {
                            "class": "rgrp-icon"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "use",
                              "attributes": {
                                "href": "#i-folder"
                              },
                              "children": []
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "rgrp-n"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Noise control"
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "rgrp-more",
                        "aria-label": "Folder actions",
                        "title": "Rename, add subfolder, delete"
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
                                "href": "#i-more"
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
                  "value": "\n                "
                },
                {
                  "type": "element",
                  "tag": "div",
                  "attributes": {
                    "class": "rgrp-b"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "\n                  "
                    },
                    {
                      "type": "element",
                      "tag": "div",
                      "attributes": {
                        "class": "rrule",
                        "draggable": "true"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "sw sm on"
                          },
                          "children": []
                        },
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "rrule-main"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "rrule-n"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "Block trackers"
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "rrule-u"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "*.doubleclick.net"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "rchips"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "rchip block"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "Block"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "rhit"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "1.2k"
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "type": "text",
                      "value": "\n                  "
                    },
                    {
                      "type": "element",
                      "tag": "div",
                      "attributes": {
                        "class": "rrule",
                        "draggable": "true"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "sw sm on"
                          },
                          "children": []
                        },
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "rrule-main"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "rrule-n"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "Delay uploads"
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "rrule-u"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "upload.example.com"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "rchips"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "rchip flow"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "Delay"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "rhit"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "8"
                            }
                          ]
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
              "tag": "div",
              "attributes": {
                "class": "rrule",
                "draggable": "true",
                "data-rule-id": "checkout"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "div",
                  "attributes": {
                    "class": "sw sm on"
                  },
                  "children": []
                },
                {
                  "type": "element",
                  "tag": "div",
                  "attributes": {
                    "class": "rrule-main"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "rrule-n"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "Checkout endpoint"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "rrule-u"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "POST shop.example.com/checkout"
                        }
                      ]
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "div",
                  "attributes": {
                    "class": "rchips"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "rchip brk"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "Breakpoint"
                        }
                      ]
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "rhit"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "3"
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
                "class": "rrule",
                "draggable": "true",
                "data-rule-id": "token"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "div",
                  "attributes": {
                    "class": "sw sm on"
                  },
                  "children": []
                },
                {
                  "type": "element",
                  "tag": "div",
                  "attributes": {
                    "class": "rrule-main"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "rrule-n"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "Token API"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "rrule-u"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "api.example.com/v1/*"
                        }
                      ]
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "div",
                  "attributes": {
                    "class": "rchips"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "rchip brk"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "Breakpoint"
                        }
                      ]
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "rhit"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "0"
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
        "class": "split"
      },
      "children": [
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "grip"
          },
          "children": []
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
        "class": "reditor"
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
            "class": "edhead"
          },
          "children": [
            {
              "type": "element",
              "tag": "svg",
              "attributes": {
                "class": "ed-open-rule-icon"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "use",
                  "attributes": {
                    "href": "#i-pencil"
                  },
                  "children": []
                }
              ]
            },
            {
              "type": "element",
              "tag": "span",
              "attributes": {
                "class": "edname"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Stub /v1/user"
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
                  "value": "Enabled"
                }
              ]
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "sw on"
              },
              "children": []
            },
            {
              "type": "element",
              "tag": "button",
              "attributes": {
                "class": "ib sm",
                "data-show-rule-requests": "",
                "aria-label": "Show matching requests",
                "title": "Show matching requests"
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
                        "href": "#i-funnel"
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
                        "href": "#i-more"
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
            "class": "edscroll"
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
                "class": "esec"
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
                    "class": "sh"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Match"
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
                    "class": "mrows"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "\n                  "
                    },
                    {
                      "type": "element",
                      "tag": "div",
                      "attributes": {
                        "class": "mrow"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "conn"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "IF"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "sel2",
                            "data-rule-select-trigger": ""
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Host"
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "cr"
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
                                        "href": "#i-chev"
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
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "inp"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "input",
                              "attributes": {
                                "value": "api.example.com",
                                "spellcheck": "false",
                                "aria-label": "Value"
                              },
                              "children": []
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "mtoggles"
                              },
                              "children": [
                                {
                                  "type": "element",
                                  "tag": "button",
                                  "attributes": {
                                    "class": "mtg",
                                    "data-mtg": "case",
                                    "title": "Case sensitive"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": "Aa"
                                    }
                                  ]
                                },
                                {
                                  "type": "element",
                                  "tag": "button",
                                  "attributes": {
                                    "class": "mtg",
                                    "data-mtg": "exact",
                                    "title": "Exact match"
                                  },
                                  "children": [
                                    {
                                      "type": "element",
                                      "tag": "u",
                                      "attributes": {},
                                      "children": [
                                        {
                                          "type": "text",
                                          "value": "ab"
                                        }
                                      ]
                                    }
                                  ]
                                },
                                {
                                  "type": "element",
                                  "tag": "button",
                                  "attributes": {
                                    "class": "mtg",
                                    "data-mtg": "regex",
                                    "title": "Regex"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": ".*"
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
                        }
                      ]
                    },
                    {
                      "type": "text",
                      "value": "\n                  "
                    },
                    {
                      "type": "element",
                      "tag": "div",
                      "attributes": {
                        "class": "mrow"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "conn"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "AND"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "sel2"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Path"
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "cr"
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
                                        "href": "#i-chev"
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
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "inp"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "input",
                              "attributes": {
                                "value": "/v1/user",
                                "spellcheck": "false",
                                "aria-label": "Value"
                              },
                              "children": []
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "mtoggles"
                              },
                              "children": [
                                {
                                  "type": "element",
                                  "tag": "button",
                                  "attributes": {
                                    "class": "mtg",
                                    "data-mtg": "case",
                                    "title": "Case sensitive"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": "Aa"
                                    }
                                  ]
                                },
                                {
                                  "type": "element",
                                  "tag": "button",
                                  "attributes": {
                                    "class": "mtg on",
                                    "data-mtg": "exact",
                                    "title": "Exact match"
                                  },
                                  "children": [
                                    {
                                      "type": "element",
                                      "tag": "u",
                                      "attributes": {},
                                      "children": [
                                        {
                                          "type": "text",
                                          "value": "ab"
                                        }
                                      ]
                                    }
                                  ]
                                },
                                {
                                  "type": "element",
                                  "tag": "button",
                                  "attributes": {
                                    "class": "mtg",
                                    "data-mtg": "regex",
                                    "title": "Regex"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": ".*"
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
                        }
                      ]
                    },
                    {
                      "type": "text",
                      "value": "\n                  "
                    },
                    {
                      "type": "element",
                      "tag": "div",
                      "attributes": {
                        "class": "mrow"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "conn"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "AND"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "sel2"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Method"
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "cr"
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
                                        "href": "#i-chev"
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
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "inp"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "input",
                              "attributes": {
                                "value": "GET",
                                "spellcheck": "false",
                                "aria-label": "Value"
                              },
                              "children": []
                            }
                          ]
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
                  "tag": "button",
                  "attributes": {
                    "class": "add"
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
                            "href": "#i-plus"
                          },
                          "children": []
                        }
                      ]
                    },
                    {
                      "type": "text",
                      "value": "Add condition"
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
              "value": "\n              "
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "esec"
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
                    "class": "sh"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Actions "
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
                          "value": "2"
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
                    "class": "acards"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "\n                  "
                    },
                    {
                      "type": "element",
                      "tag": "div",
                      "attributes": {
                        "class": "acard"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "\n                    "
                        },
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "ahead"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "aicon map"
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
                                        "href": "#i-map"
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
                                  "value": "Map Local"
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "asub"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "serve file"
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "sp",
                                "style": "flex:1"
                              },
                              "children": []
                            },
                            {
                              "type": "element",
                              "tag": "div",
                              "attributes": {
                                "class": "sw on"
                              },
                              "children": []
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
                            }
                          ]
                        },
                        {
                          "type": "text",
                          "value": "\n                    "
                        },
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "abody"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "\n                      "
                            },
                            {
                              "type": "element",
                              "tag": "div",
                              "attributes": {
                                "class": "orow kv2"
                              },
                              "children": [
                                {
                                  "type": "element",
                                  "tag": "div",
                                  "attributes": {
                                    "class": "lg",
                                    "style": "justify-content:flex-start;color:var(--text-2)"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": "Local path"
                                    }
                                  ]
                                },
                                {
                                  "type": "element",
                                  "tag": "div",
                                  "attributes": {
                                    "class": "inp"
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
                                            "href": "#i-file"
                                          },
                                          "children": []
                                        }
                                      ]
                                    },
                                    {
                                      "type": "text",
                                      "value": "~/mocks/user.json"
                                    }
                                  ]
                                }
                              ]
                            },
                            {
                              "type": "text",
                              "value": "\n                    "
                            }
                          ]
                        },
                        {
                          "type": "text",
                          "value": "\n                  "
                        }
                      ]
                    },
                    {
                      "type": "text",
                      "value": "\n                  "
                    },
                    {
                      "type": "element",
                      "tag": "div",
                      "attributes": {
                        "class": "acard"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "\n                    "
                        },
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "ahead"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "aicon rewrite"
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
                            },
                            {
                              "type": "element",
                              "tag": "b",
                              "attributes": {},
                              "children": [
                                {
                                  "type": "text",
                                  "value": "Rewrite"
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "asub"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "response header"
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "sp",
                                "style": "flex:1"
                              },
                              "children": []
                            },
                            {
                              "type": "element",
                              "tag": "div",
                              "attributes": {
                                "class": "sw on"
                              },
                              "children": []
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
                            }
                          ]
                        },
                        {
                          "type": "text",
                          "value": "\n                    "
                        },
                        {
                          "type": "element",
                          "tag": "div",
                          "attributes": {
                            "class": "abody"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "\n                      "
                            },
                            {
                              "type": "element",
                              "tag": "div",
                              "attributes": {
                                "class": "orow rw"
                              },
                              "children": [
                                {
                                  "type": "element",
                                  "tag": "div",
                                  "attributes": {
                                    "class": "sel2"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": "Set"
                                    },
                                    {
                                      "type": "element",
                                      "tag": "span",
                                      "attributes": {
                                        "class": "cr"
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
                                                "href": "#i-chev"
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
                                  "type": "element",
                                  "tag": "div",
                                  "attributes": {
                                    "class": "sel2"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": "Header"
                                    },
                                    {
                                      "type": "element",
                                      "tag": "span",
                                      "attributes": {
                                        "class": "cr"
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
                                                "href": "#i-chev"
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
                                  "type": "element",
                                  "tag": "div",
                                  "attributes": {
                                    "class": "inp"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": "access-control-allow-origin"
                                    }
                                  ]
                                },
                                {
                                  "type": "element",
                                  "tag": "div",
                                  "attributes": {
                                    "class": "inp"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": "*"
                                    }
                                  ]
                                }
                              ]
                            },
                            {
                              "type": "text",
                              "value": "\n                    "
                            }
                          ]
                        },
                        {
                          "type": "text",
                          "value": "\n                  "
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
                  "tag": "button",
                  "attributes": {
                    "class": "add",
                    "id": "addaction"
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
                            "href": "#i-plus"
                          },
                          "children": []
                        }
                      ]
                    },
                    {
                      "type": "text",
                      "value": "Add action"
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
              "value": "\n              "
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "vnote"
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
                },
                {
                  "type": "text",
                  "value": "Compiles cleanly · applied at revision 42"
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
            "class": "apop"
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
                "class": "po-t"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Rewrite"
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
                "class": "fi"
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
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "n"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Rewrite header"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "ex"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "name / value"
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
                "class": "fi"
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
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "n"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Rewrite query"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "ex"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "name / value"
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
                "class": "fi"
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
                        "href": "#i-file"
                      },
                      "children": []
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "n"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Rewrite body"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "ex"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "text / json"
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
                "class": "fi"
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
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "n"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Set status"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "ex"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "override"
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
                "class": "po-t"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Serve & reroute"
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
                "class": "fi dis"
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
                        "href": "#i-map"
                      },
                      "children": []
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "n"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Map Local"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "ex tag"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "added"
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
                "class": "fi dis"
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
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "n"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Map Remote"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "ex tag warn"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "conflict"
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
                "class": "fi dis"
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
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "n"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Synthetic"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "ex tag warn"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "conflict"
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
                "class": "po-t"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Traffic"
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
                "class": "fi"
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
                        "href": "#i-clock"
                      },
                      "children": []
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "n"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Delay"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "ex"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "latency"
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
                "class": "po-t"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Control"
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
                "class": "fi dis"
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
                        "href": "#i-slash"
                      },
                      "children": []
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "n"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Block"
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "ex tag warn"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "conflict"
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
                "class": "fi"
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
                        "href": "#i-pause"
                      },
                      "children": []
                    }
                  ]
                },
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "n"
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
                  "tag": "span",
                  "attributes": {
                    "class": "ex"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "pause & edit"
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
            "class": "rule-select-pop"
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
                "class": "rule-select-option"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Method"
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
                "class": "rule-select-option on"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Host"
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
                "class": "rule-select-option"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Path"
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
                "class": "rule-select-option"
              },
              "children": [
                {
                  "type": "text",
                  "value": "URL"
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
                "class": "rule-select-option"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Query"
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
                "class": "rule-select-option"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Header"
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
                "class": "rule-select-option"
              },
              "children": [
                {
                  "type": "text",
                  "value": "Status"
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
                "class": "rule-select-option"
              },
              "children": [
                {
                  "type": "text",
                  "value": "MIME"
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
};
