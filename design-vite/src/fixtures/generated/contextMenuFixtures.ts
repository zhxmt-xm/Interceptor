import type { FixtureNode } from '../FixtureNode';

export const contextMenuFixtures: readonly FixtureNode[] = [
  {
    "type": "element",
    "tag": "div",
    "attributes": {
      "class": "ctxmenu",
      "data-ctx": "rules-folder"
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
          "class": "cmenu-i"
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
                  "href": "#i-pencil"
                },
                "children": []
              }
            ]
          },
          {
            "type": "text",
            "value": "Rename…"
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
          "class": "cmenu-i"
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
          },
          {
            "type": "text",
            "value": "New subfolder…"
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
          "class": "cmenu-i"
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
            "value": "New rule…"
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
          "class": "cmenu-sep"
        },
        "children": []
      },
      {
        "type": "text",
        "value": "\n          "
      },
      {
        "type": "element",
        "tag": "div",
        "attributes": {
          "class": "cmenu-i danger"
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
          },
          {
            "type": "text",
            "value": "Delete folder"
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
    "type": "element",
    "tag": "div",
    "attributes": {
      "class": "ctxmenu",
      "data-ctx": "rules-rule"
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
          "class": "cmenu-i"
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
                  "href": "#i-pencil"
                },
                "children": []
              }
            ]
          },
          {
            "type": "text",
            "value": "Rename…"
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
          "class": "cmenu-i"
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
          },
          {
            "type": "text",
            "value": "Show matching requests"
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
          "class": "cmenu-sep"
        },
        "children": []
      },
      {
        "type": "text",
        "value": "\n          "
      },
      {
        "type": "element",
        "tag": "div",
        "attributes": {
          "class": "cmenu-i danger"
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
          },
          {
            "type": "text",
            "value": "Delete rule"
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
    "type": "element",
    "tag": "div",
    "attributes": {
      "class": "ctxmenu",
      "data-ctx": "composer-item"
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
          "class": "cmenu-i"
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
                  "href": "#i-pencil"
                },
                "children": []
              }
            ]
          },
          {
            "type": "text",
            "value": "Rename…"
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
          "class": "cmenu-sep"
        },
        "children": []
      },
      {
        "type": "text",
        "value": "\n          "
      },
      {
        "type": "element",
        "tag": "div",
        "attributes": {
          "class": "cmenu-i danger"
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
          },
          {
            "type": "text",
            "value": "Delete request"
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
    "type": "element",
    "tag": "div",
    "attributes": {
      "class": "ctxmenu",
      "data-ctx": "composer-folder"
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
          "class": "cmenu-i"
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
                  "href": "#i-pencil"
                },
                "children": []
              }
            ]
          },
          {
            "type": "text",
            "value": "Rename…"
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
          "class": "cmenu-i"
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
          },
          {
            "type": "text",
            "value": "New subfolder…"
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
          "class": "cmenu-i"
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
                  "href": "#i-file-plus"
                },
                "children": []
              }
            ]
          },
          {
            "type": "text",
            "value": "New request…"
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
          "class": "cmenu-sep"
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
          "class": "cmenu-i danger"
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
          },
          {
            "type": "text",
            "value": "Delete folder"
          }
        ]
      },
      {
        "type": "text",
        "value": "\n            "
      }
    ]
  }
];
