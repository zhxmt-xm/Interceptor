import type { FixtureNode } from '../FixtureNode';

export const composerFixture: FixtureNode = {
  "type": "element",
  "tag": "div",
  "attributes": {
    "class": "mv cmain v-composer",
    "data-v": "composer"
  },
  "children": [
    {
      "type": "text",
      "value": "\n          "
    },
    {
      "type": "text",
      "value": "\n          "
    },
    {
      "type": "element",
      "tag": "aside",
      "attributes": {
        "class": "ccol",
        "data-parity": "composer-collection"
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
            "class": "ccol-bar"
          },
          "children": [
            {
              "type": "text",
              "value": "\n          "
            },
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
                    "placeholder": "Search requests…",
                    "aria-label": "Search requests",
                    "value": ""
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
                "class": "icon-actions"
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
                    "class": "ib sm",
                    "aria-label": "New request",
                    "title": "New request"
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
                  "type": "text",
                  "value": "\n            "
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "class": "ib sm",
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
                  "type": "text",
                  "value": "\n            "
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "class": "ib sm",
                    "data-collection-import": "",
                    "aria-label": "Import collection",
                    "title": "Import collection"
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
                  "tag": "button",
                  "attributes": {
                    "class": "ib sm",
                    "aria-label": "Export collection",
                    "title": "Export collection"
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
          "value": "\n            "
        },
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "ccol-scroll"
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
                  "value": "No requests match"
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
                "class": "cgrp on",
                "data-grp": "github"
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
                    "class": "cgrp-h",
                    "draggable": "true"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "cgrp-chevbtn",
                        "aria-label": "Collapse folder"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "svg",
                          "attributes": {
                            "class": "cgrp-chev"
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
                        "class": "cgrp-namebtn"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "cgrp-n"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "GitHub API"
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "cgrp-c"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "5"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "cgrp-more",
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
                    "class": "cgrp-b"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "\n                  "
                    },
                    {
                      "type": "element",
                      "tag": "section",
                      "attributes": {
                        "class": "cgrp on",
                        "data-grp": "github-repos"
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
                            "class": "cgrp-h",
                            "draggable": "true"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "button",
                              "attributes": {
                                "class": "cgrp-chevbtn",
                                "aria-label": "Collapse folder"
                              },
                              "children": [
                                {
                                  "type": "element",
                                  "tag": "svg",
                                  "attributes": {
                                    "class": "cgrp-chev"
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
                                "class": "cgrp-namebtn"
                              },
                              "children": [
                                {
                                  "type": "element",
                                  "tag": "span",
                                  "attributes": {
                                    "class": "cgrp-n"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": "Repositories"
                                    }
                                  ]
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "cgrp-c"
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
                              "tag": "button",
                              "attributes": {
                                "class": "cgrp-more",
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
                            "class": "cgrp-b"
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
                                "class": "citem",
                                "draggable": "true"
                              },
                              "children": [
                                {
                                  "type": "element",
                                  "tag": "span",
                                  "attributes": {
                                    "class": "m get"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": "GET"
                                    }
                                  ]
                                },
                                {
                                  "type": "element",
                                  "tag": "span",
                                  "attributes": {
                                    "class": "citem-n"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": "List repos"
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
                              "tag": "div",
                              "attributes": {
                                "class": "citem on open",
                                "draggable": "true"
                              },
                              "children": [
                                {
                                  "type": "element",
                                  "tag": "span",
                                  "attributes": {
                                    "class": "m post"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": "POST"
                                    }
                                  ]
                                },
                                {
                                  "type": "element",
                                  "tag": "span",
                                  "attributes": {
                                    "class": "citem-n"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": "Create repo"
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
                              "tag": "div",
                              "attributes": {
                                "class": "citem",
                                "draggable": "true"
                              },
                              "children": [
                                {
                                  "type": "element",
                                  "tag": "span",
                                  "attributes": {
                                    "class": "m put"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": "PATCH"
                                    }
                                  ]
                                },
                                {
                                  "type": "element",
                                  "tag": "span",
                                  "attributes": {
                                    "class": "citem-n"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": "Update repo"
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
                        "class": "crename"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "svg",
                          "attributes": {
                            "class": "cgrp-chev"
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
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "cname"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Pull requests"
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
                        "class": "cgrp",
                        "data-grp": "github-users"
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
                            "class": "cgrp-h",
                            "draggable": "true"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "button",
                              "attributes": {
                                "class": "cgrp-chevbtn",
                                "aria-label": "Expand folder"
                              },
                              "children": [
                                {
                                  "type": "element",
                                  "tag": "svg",
                                  "attributes": {
                                    "class": "cgrp-chev"
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
                                "class": "cgrp-namebtn"
                              },
                              "children": [
                                {
                                  "type": "element",
                                  "tag": "span",
                                  "attributes": {
                                    "class": "cgrp-n"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": "Users"
                                    }
                                  ]
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "cgrp-c"
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
                              "tag": "button",
                              "attributes": {
                                "class": "cgrp-more",
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
                            "class": "cgrp-b"
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
                                "class": "citem",
                                "draggable": "true"
                              },
                              "children": [
                                {
                                  "type": "element",
                                  "tag": "span",
                                  "attributes": {
                                    "class": "m get"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": "GET"
                                    }
                                  ]
                                },
                                {
                                  "type": "element",
                                  "tag": "span",
                                  "attributes": {
                                    "class": "citem-n"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": "Get user"
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
                              "tag": "div",
                              "attributes": {
                                "class": "citem",
                                "draggable": "true"
                              },
                              "children": [
                                {
                                  "type": "element",
                                  "tag": "span",
                                  "attributes": {
                                    "class": "m get"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": "GET"
                                    }
                                  ]
                                },
                                {
                                  "type": "element",
                                  "tag": "span",
                                  "attributes": {
                                    "class": "citem-n"
                                  },
                                  "children": [
                                    {
                                      "type": "text",
                                      "value": "List followers"
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
                "class": "cgrp on",
                "data-grp": "checkout"
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
                    "class": "cgrp-h",
                    "draggable": "true"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "cgrp-chevbtn",
                        "aria-label": "Collapse folder"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "svg",
                          "attributes": {
                            "class": "cgrp-chev"
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
                        "class": "cgrp-namebtn"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "cgrp-n"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Checkout service"
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "cgrp-c"
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
                      "tag": "button",
                      "attributes": {
                        "class": "cgrp-more",
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
                    "class": "cgrp-b"
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
                        "class": "citem",
                        "draggable": "true"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "m post"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "POST"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "citem-n"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Create order"
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
                        "class": "citem",
                        "draggable": "true"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "m get"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "GET"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "citem-n"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Order status"
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
                        "class": "citem",
                        "draggable": "true"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "m del"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "DEL"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "citem-n"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Cancel order"
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
                "class": "cgrp",
                "data-grp": "scratch"
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
                    "class": "cgrp-h",
                    "draggable": "true"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "cgrp-chevbtn",
                        "aria-label": "Expand folder"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "svg",
                          "attributes": {
                            "class": "cgrp-chev"
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
                        "class": "cgrp-namebtn"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "cgrp-n"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Scratch"
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "cgrp-c"
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
                      "tag": "button",
                      "attributes": {
                        "class": "cgrp-more",
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
                    "class": "cgrp-b"
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
                        "class": "citem",
                        "draggable": "true"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "m post"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "POST"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "citem-n"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "GraphQL probe"
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
                        "class": "citem",
                        "draggable": "true"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "m get"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "GET"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "citem-n"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Healthz"
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
      "value": "\n\n          "
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
      "value": "\n\n          "
    },
    {
      "type": "element",
      "tag": "div",
      "attributes": {
        "class": "cwork"
      },
      "children": [
        {
          "type": "text",
          "value": "\n          "
        },
        {
          "type": "text",
          "value": "\n          "
        },
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "cdocs"
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
                "class": "ib sm ccol-toggle",
                "aria-label": "Toggle collection",
                "title": "Collection"
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
                        "href": "#i-panel-left"
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
              "tag": "div",
              "attributes": {
                "class": "cdoc-list"
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
                    "class": "cdoc on",
                    "data-parity": "composer-doc"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "m post"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "POST"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "cdoc-n"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "Create repo"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "cdoc-x",
                        "aria-label": "Close request",
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
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "div",
                  "attributes": {
                    "class": "cdoc"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "m get"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "GET"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "cdoc-n"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "List repos"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "cdoc-x",
                        "aria-label": "Close request",
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
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "div",
                  "attributes": {
                    "class": "cdoc"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "m get"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "GET"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "cdoc-n"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "Untitled"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "cdoc-x",
                        "aria-label": "Close request",
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
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "class": "ib sm cdoc-add",
                    "aria-label": "New request",
                    "title": "New request"
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
          "value": "\n\n          "
        },
        {
          "type": "text",
          "value": "\n          "
        },
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "urlrow"
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
                "class": "sel2 method"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "m post"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "POST"
                    }
                  ]
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
              "type": "text",
              "value": "\n            "
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "inp url",
                "data-parity": "composer-url"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "sc"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "https://"
                    }
                  ]
                },
                {
                  "type": "text",
                  "value": "api.github.com/user/repos"
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
                "class": "btn pri csend",
                "data-parity": "composer-send"
              },
              "children": [
                {
                  "type": "element",
                  "tag": "span",
                  "attributes": {
                    "class": "csend-spinner"
                  },
                  "children": []
                },
                {
                  "type": "element",
                  "tag": "svg",
                  "attributes": {},
                  "children": [
                    {
                      "type": "element",
                      "tag": "use",
                      "attributes": {
                        "href": "#i-send"
                      },
                      "children": []
                    }
                  ]
                },
                {
                  "type": "text",
                  "value": "Send"
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
                "class": "icon-actions"
              },
              "children": [
                {
                  "type": "text",
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "button",
                  "attributes": {
                    "class": "ib sm chist-trigger",
                    "data-parity": "composer-history",
                    "aria-label": "Recent sends",
                    "title": "Recent sends"
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
                "class": "chist"
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
                    "class": "chist-h"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Recent sends"
                    },
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "chist-clear",
                        "aria-label": "Clear history",
                        "title": "Clear history"
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
                                "href": "#i-trash"
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
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "div",
                  "attributes": {
                    "class": "chist-i"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "m post"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "POST"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "chist-u"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "api.github.com/user/repos"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "chist-s ok"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "201"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "chist-t"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "2m ago"
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
                    "class": "chist-i"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "m get"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "GET"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "chist-u"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "api.github.com/users/octocat"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "chist-s ok"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "200"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "chist-t"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "14m ago"
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
                    "class": "chist-i"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "m post"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "POST"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "chist-u"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "api.github.com/graphql"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "chist-s warn"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "422"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "chist-t"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "31m ago"
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
                    "class": "chist-i"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "m del"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "DEL"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "chist-u"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "checkout.internal/orders/8412"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "chist-s err"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "500"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "chist-t"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "1h ago"
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
          "value": "\n\n          "
        },
        {
          "type": "text",
          "value": "\n          "
        },
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "creq"
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
                "class": "ctabbar",
                "data-parity": "composer-request-tabs"
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
                    "class": "tabs",
                    "data-tabs": "creq"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "\n                "
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "data-ctab": "query"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "i",
                          "attributes": {
                            "class": "tlabel"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Query"
                            },
                            {
                              "type": "element",
                              "tag": "b",
                              "attributes": {
                                "class": "tct"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "2"
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
                      "tag": "span",
                      "attributes": {
                        "class": "on",
                        "data-ctab": "headers"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "i",
                          "attributes": {
                            "class": "tlabel"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Headers"
                            },
                            {
                              "type": "element",
                              "tag": "b",
                              "attributes": {
                                "class": "tct"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "4"
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
                      "tag": "span",
                      "attributes": {
                        "data-ctab": "body"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "i",
                          "attributes": {
                            "class": "tlabel"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Body"
                            },
                            {
                              "type": "element",
                              "tag": "b",
                              "attributes": {
                                "class": "tdot"
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
                      "tag": "span",
                      "attributes": {
                        "data-ctab": "auth"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "i",
                          "attributes": {
                            "class": "tlabel"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Auth"
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
                  "value": "\n              "
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
                  "type": "text",
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "div",
                  "attributes": {
                    "class": "seg protocol-switch"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "on"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "Auto"
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
                          "value": "HTTP/1.1"
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
                          "value": "HTTP/2"
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
              "value": "\n\n            "
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "cpane kvpane",
                "data-ctab": "query"
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
                    "class": "kvhead"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {},
                      "children": []
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {},
                      "children": [
                        {
                          "type": "text",
                          "value": "Name"
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
                          "value": "Value"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {},
                      "children": []
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
                    "class": "kvrow"
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
                      "tag": "span",
                      "attributes": {
                        "class": "kvk"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "visibility"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "kvv"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "all"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "kvx",
                        "aria-label": "Remove"
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
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "div",
                  "attributes": {
                    "class": "kvrow"
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
                      "tag": "span",
                      "attributes": {
                        "class": "kvk"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "per_page"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "kvv"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "100"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "kvx",
                        "aria-label": "Remove"
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
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "div",
                  "attributes": {
                    "class": "kvrow add"
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
                      "tag": "span",
                      "attributes": {
                        "class": "kvk"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "x-trace-id"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "kvv"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "9f2c1a84"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "kvok",
                        "aria-label": "Add parameter",
                        "title": "Add"
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
                "class": "cpane kvpane on",
                "data-ctab": "headers",
                "data-parity": "composer-header-table"
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
                    "class": "kvhead"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {},
                      "children": []
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {},
                      "children": [
                        {
                          "type": "text",
                          "value": "Name"
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
                          "value": "Value"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {},
                      "children": []
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
                    "class": "kvrow"
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
                      "tag": "span",
                      "attributes": {
                        "class": "kvk",
                        "data-parity": "composer-header-name-0"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "authorization"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "kvv"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "Bearer github_pat_11A…"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "kvx",
                        "aria-label": "Remove"
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
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "div",
                  "attributes": {
                    "class": "kvrow"
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
                      "tag": "span",
                      "attributes": {
                        "class": "kvk",
                        "data-parity": "composer-header-name-1"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "content-type"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "kvv"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "application/json"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "kvx",
                        "aria-label": "Remove"
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
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "div",
                  "attributes": {
                    "class": "kvrow"
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
                      "tag": "span",
                      "attributes": {
                        "class": "kvk",
                        "data-parity": "composer-header-name-2"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "accept"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "kvv"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "application/vnd.github+json"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "kvx",
                        "aria-label": "Remove"
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
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "div",
                  "attributes": {
                    "class": "kvrow"
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
                      "tag": "span",
                      "attributes": {
                        "class": "kvk"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "user-agent"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "kvv"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "Interceptor/1.0.0"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "kvx",
                        "aria-label": "Remove"
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
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "div",
                  "attributes": {
                    "class": "kvrow add"
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
                      "tag": "span",
                      "attributes": {
                        "class": "kvk ph"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "Name"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "kvv ph"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "Value"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "button",
                      "attributes": {
                        "class": "kvok",
                        "aria-label": "Add header",
                        "title": "Enter a name and value first",
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
                                "href": "#i-check"
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
                "class": "cpane bodypane",
                "data-ctab": "body"
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
                    "class": "cbar"
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
                        "class": "seg bodytype"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "data-bt": "none"
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
                          "tag": "span",
                          "attributes": {
                            "class": "on",
                            "data-bt": "json"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "JSON"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "data-bt": "text"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Text"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "data-bt": "form"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Form"
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
                      "tag": "span",
                      "attributes": {
                        "class": "sp",
                        "style": "flex:1"
                      },
                      "children": []
                    },
                    {
                      "type": "text",
                      "value": "\n                "
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "cnt bodymeta"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "168 B · application/json"
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
                        "class": "icon-actions bodytools"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "button",
                          "attributes": {
                            "class": "ib sm",
                            "data-body-full": "",
                            "aria-label": "Open fullscreen",
                            "title": "Fullscreen"
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
                          "value": "\n                  "
                        },
                        {
                          "type": "element",
                          "tag": "button",
                          "attributes": {
                            "class": "ib sm",
                            "aria-label": "Format JSON",
                            "title": "Format JSON"
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
                          "type": "text",
                          "value": "\n                  "
                        },
                        {
                          "type": "element",
                          "tag": "button",
                          "attributes": {
                            "class": "ib sm",
                            "aria-label": "Copy",
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
                    "class": "cedit mono",
                    "data-monaco": "edit",
                    "data-lang": "json",
                    "data-parity": "composer-body-editor"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "\n{\n  \"name\": \"interceptor\",\n  \"description\": \"Desktop network debugging proxy\",\n  \"private\": true,\n  \"auto_init\": true,\n  \"gitignore_template\": \"Node\"\n}\n              "
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
                    "class": "bodyform"
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
                        "class": "kvhead"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {},
                          "children": []
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {},
                          "children": [
                            {
                              "type": "text",
                              "value": "Name"
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
                              "value": "Value"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {},
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
                      "tag": "div",
                      "attributes": {
                        "class": "kvrow"
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
                          "tag": "span",
                          "attributes": {
                            "class": "kvk"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "grant_type"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "kvv"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "client_credentials"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "button",
                          "attributes": {
                            "class": "kvx",
                            "aria-label": "Remove"
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
                    },
                    {
                      "type": "element",
                      "tag": "div",
                      "attributes": {
                        "class": "kvrow"
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
                          "tag": "span",
                          "attributes": {
                            "class": "kvk"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "scope"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "kvv"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "repo read:user"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "button",
                          "attributes": {
                            "class": "kvx",
                            "aria-label": "Remove"
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
                    },
                    {
                      "type": "element",
                      "tag": "div",
                      "attributes": {
                        "class": "kvrow add"
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
                          "tag": "span",
                          "attributes": {
                            "class": "kvk ph"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Name"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "kvv ph"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Value"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "button",
                          "attributes": {
                            "class": "kvok",
                            "aria-label": "Add field",
                            "title": "Enter a name and value first",
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
                                    "href": "#i-check"
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
                    "class": "bodynone"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "No body is sent with this request."
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
                "class": "cpane authpane",
                "data-ctab": "auth"
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
                    "class": "arow"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "alab"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "Type"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "div",
                      "attributes": {
                        "class": "sel2 actl"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "Bearer token"
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
                    "class": "arow"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "alab"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "Token"
                        }
                      ]
                    },
                    {
                      "type": "element",
                      "tag": "div",
                      "attributes": {
                        "class": "inp actl"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "github_pat_11ABCDEFGHIJKLMNOPQRSTU…"
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
          "value": "\n\n          "
        },
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "split h"
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
          "value": "\n\n          "
        },
        {
          "type": "text",
          "value": "\n          "
        },
        {
          "type": "element",
          "tag": "div",
          "attributes": {
            "class": "cresp"
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
                "class": "ctabbar crbar",
                "data-parity": "composer-response-tabs"
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
                    "class": "tabs",
                    "data-tabs": "cresp"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "\n                "
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "on",
                        "data-crtab": "body"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "i",
                          "attributes": {
                            "class": "tlabel"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Body"
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
                      "tag": "span",
                      "attributes": {
                        "data-crtab": "headers"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "i",
                          "attributes": {
                            "class": "tlabel"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Headers"
                            },
                            {
                              "type": "element",
                              "tag": "b",
                              "attributes": {
                                "class": "tct"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "18"
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
                      "tag": "span",
                      "attributes": {
                        "data-crtab": "cookies"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "i",
                          "attributes": {
                            "class": "tlabel"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Cookies"
                            },
                            {
                              "type": "element",
                              "tag": "b",
                              "attributes": {
                                "class": "tct"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "1"
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
                      "tag": "span",
                      "attributes": {
                        "data-crtab": "timing"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "i",
                          "attributes": {
                            "class": "tlabel"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Timing"
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
                  "value": "\n              "
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
                  "type": "text",
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "div",
                  "attributes": {
                    "class": "rstate"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "\n                "
                    },
                    {
                      "type": "element",
                      "tag": "span",
                      "attributes": {
                        "class": "rstat",
                        "data-parity": "composer-status"
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
                          "value": "201"
                        },
                        {
                          "type": "text",
                          "value": " "
                        },
                        {
                          "type": "text",
                          "value": "Created"
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
                        "class": "rmetric"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "142 ms"
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
                        "class": "rmetric"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "1.2 KB"
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
                        "class": "chip proto"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "h2"
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
              "value": "\n\n            "
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "cpane bodypane on",
                "data-crtab": "body"
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
                    "class": "cbar"
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
                        "class": "seg respmode"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "on"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Pretty"
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
                              "value": "Tree"
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
                              "value": "Raw"
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
                              "value": "Hex"
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
                      "tag": "span",
                      "attributes": {
                        "class": "sp",
                        "style": "flex:1"
                      },
                      "children": []
                    },
                    {
                      "type": "text",
                      "value": "\n                "
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
                          "value": "application/json"
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
                        "class": "icon-actions"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "button",
                          "attributes": {
                            "class": "ib sm",
                            "data-body-full": "",
                            "aria-label": "Open fullscreen",
                            "title": "Fullscreen"
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
                          "value": "\n                  "
                        },
                        {
                          "type": "element",
                          "tag": "button",
                          "attributes": {
                            "class": "ib sm",
                            "aria-label": "Copy response body",
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
                    "class": "jsonv mono",
                    "data-monaco": "fill",
                    "data-lang": "json"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "\n{\n  \"id\": 843102775,\n  \"name\": \"interceptor\",\n  \"full_name\": \"acme/interceptor\",\n  \"private\": true,\n  \"owner\": { \"login\": \"acme\", \"id\": 55 },\n  \"html_url\": \"https://github.com/acme/interceptor\",\n  \"default_branch\": \"main\",\n  \"visibility\": \"private\",\n  \"created_at\": \"2026-08-03T09:12:44Z\"\n}\n              "
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
                "class": "cpane cscroll",
                "data-crtab": "headers"
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
                    "class": "sec"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "div",
                      "attributes": {
                        "class": "sh"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "Response Headers "
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
                              "value": "18"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "svg",
                          "attributes": {
                            "class": "sh-chev"
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
                      "tag": "div",
                      "attributes": {
                        "class": "kv"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "k"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "status"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "v g"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "kv-value-text"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "201 Created"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "k"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "content-type"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "v"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "kv-value-text"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "application/json; charset=utf-8"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "k"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "content-length"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "v"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "kv-value-text"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "1243"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "k"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "location"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "v"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "kv-value-text"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "https://api.github.com/repos/acme/interceptor"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "k"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "x-ratelimit-remaining"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "v"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "kv-value-text"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "4993"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "k"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "x-github-request-id"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "v"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "kv-value-text"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "C4A2:1F0B:9D31A2"
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
                    "class": "sec"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "div",
                      "attributes": {
                        "class": "sh"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "Request Headers "
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
                              "value": "4"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "svg",
                          "attributes": {
                            "class": "sh-chev"
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
                      "tag": "div",
                      "attributes": {
                        "class": "kv"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "k"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "authorization"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "v"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "kv-value-text"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "Bearer github_pat_11A…"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "k"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "content-type"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "v"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "kv-value-text"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "application/json"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "k"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "accept"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "v"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "kv-value-text"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "application/vnd.github+json"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "k"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "host"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "v"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "kv-value-text"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "api.github.com"
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
              "value": "\n\n            "
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "cpane cscroll",
                "data-crtab": "cookies"
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
                    "class": "sec"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "div",
                      "attributes": {
                        "class": "sh"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "Response Cookies "
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
                              "value": "1"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "svg",
                          "attributes": {
                            "class": "sh-chev"
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
                      "tag": "div",
                      "attributes": {
                        "class": "kv"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "k"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "_gh_sess"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "v"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "kv-value-text"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "VszN7pQ…9Qb2"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "k"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Domain"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "v"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "kv-value-text"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": ".github.com"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "k"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Path"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "v"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "kv-value-text"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "/"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "k"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Expires"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "v"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "kv-value-text"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "Session"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "k"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Flags"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "v a"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "kv-value-text"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "HttpOnly · Secure · SameSite=Lax"
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
              "value": "\n\n            "
            },
            {
              "type": "element",
              "tag": "div",
              "attributes": {
                "class": "cpane cscroll",
                "data-crtab": "timing"
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
                    "class": "sec"
                  },
                  "children": [
                    {
                      "type": "element",
                      "tag": "div",
                      "attributes": {
                        "class": "sh"
                      },
                      "children": [
                        {
                          "type": "text",
                          "value": "Timing "
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
                              "value": "142 ms total"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "svg",
                          "attributes": {
                            "class": "sh-chev"
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
                      "type": "text",
                      "value": "\n                "
                    },
                    {
                      "type": "element",
                      "tag": "div",
                      "attributes": {
                        "class": "tl"
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
                            "class": "tlrow"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "tlp"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "DNS"
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "tlt"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "6 ms"
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "tlbar"
                              },
                              "children": [
                                {
                                  "type": "element",
                                  "tag": "i",
                                  "attributes": {
                                    "style": "left:0;width:4.2%"
                                  },
                                  "children": []
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
                            "class": "tlrow"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "tlp"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "Connect"
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "tlt"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "21 ms"
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "tlbar"
                              },
                              "children": [
                                {
                                  "type": "element",
                                  "tag": "i",
                                  "attributes": {
                                    "style": "left:4.2%;width:14.8%"
                                  },
                                  "children": []
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
                            "class": "tlrow"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "tlp"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "TLS handshake"
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "tlt"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "33 ms"
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "tlbar"
                              },
                              "children": [
                                {
                                  "type": "element",
                                  "tag": "i",
                                  "attributes": {
                                    "style": "left:19%;width:23.2%"
                                  },
                                  "children": []
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
                            "class": "tlrow"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "tlp"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "Waiting (TTFB)"
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "tlt"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "71 ms"
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "tlbar"
                              },
                              "children": [
                                {
                                  "type": "element",
                                  "tag": "i",
                                  "attributes": {
                                    "style": "left:42.2%;width:50%"
                                  },
                                  "children": []
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
                            "class": "tlrow"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "tlp"
                              },
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
                                "class": "tlt"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "11 ms"
                                }
                              ]
                            },
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "tlbar"
                              },
                              "children": [
                                {
                                  "type": "element",
                                  "tag": "i",
                                  "attributes": {
                                    "style": "left:92.2%;width:7.8%"
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
                        "class": "kv",
                        "style": "margin-top:12px"
                      },
                      "children": [
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "k"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Remote address"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "v"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "kv-value-text"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "140.82.121.6:443"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "k"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Protocol"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "v g"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "kv-value-text"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "TLS 1.3 · h2"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "k"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Cipher suite"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "v"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "kv-value-text"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "TLS_AES_128_GCM_SHA256"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "k"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Request bytes"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "v"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "kv-value-text"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "168 B"
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "k"
                          },
                          "children": [
                            {
                              "type": "text",
                              "value": "Response bytes"
                            }
                          ]
                        },
                        {
                          "type": "element",
                          "tag": "span",
                          "attributes": {
                            "class": "v"
                          },
                          "children": [
                            {
                              "type": "element",
                              "tag": "span",
                              "attributes": {
                                "class": "kv-value-text"
                              },
                              "children": [
                                {
                                  "type": "text",
                                  "value": "1.2 KB"
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
                "class": "cplace"
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
                    "class": "cplace-icon"
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
                            "href": "#i-send"
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
                  "tag": "b",
                  "attributes": {
                    "class": "cplace-idle"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "No response yet"
                    }
                  ]
                },
                {
                  "type": "text",
                  "value": "\n              "
                },
                {
                  "type": "element",
                  "tag": "b",
                  "attributes": {
                    "class": "cplace-busy"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Waiting for response…"
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
                    "class": "cplace-idle"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "Send the request to inspect its response here. Composer requests are sent directly and never pass through the proxy."
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
                    "class": "cplace-busy"
                  },
                  "children": [
                    {
                      "type": "text",
                      "value": "api.github.com · connected, waiting for response headers."
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
        }
      ]
    },
    {
      "type": "text",
      "value": "\n        "
    }
  ]
};
