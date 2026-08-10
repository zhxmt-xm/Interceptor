import type { FixtureNode } from '../FixtureNode';

export const updateNoticeFixture: FixtureNode = {
  "type": "element",
  "tag": "div",
  "attributes": {
    "class": "unotice",
    "role": "status"
  },
  "children": [
    {
      "type": "text",
      "value": "\n        "
    },
    {
      "type": "element",
      "tag": "span",
      "attributes": {
        "class": "unicon"
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
      "value": "\n        "
    },
    {
      "type": "element",
      "tag": "span",
      "attributes": {
        "class": "uncap update-notice-available"
      },
      "children": [
        {
          "type": "element",
          "tag": "b",
          "attributes": {},
          "children": [
            {
              "type": "text",
              "value": "Update available"
            }
          ]
        },
        {
          "type": "element",
          "tag": "small",
          "attributes": {},
          "children": [
            {
              "type": "text",
              "value": "0.1.1 · changelog ready"
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
      "tag": "span",
      "attributes": {
        "class": "uncap update-notice-downloaded"
      },
      "children": [
        {
          "type": "element",
          "tag": "b",
          "attributes": {},
          "children": [
            {
              "type": "text",
              "value": "Installer downloaded"
            }
          ]
        },
        {
          "type": "element",
          "tag": "small",
          "attributes": {},
          "children": [
            {
              "type": "text",
              "value": "0.1.1 · ready to open"
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
      "tag": "button",
      "attributes": {
        "class": "btn pri update-notice-download"
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
          "value": "Download"
        }
      ]
    },
    {
      "type": "text",
      "value": "\n        "
    },
    {
      "type": "element",
      "tag": "button",
      "attributes": {
        "class": "btn pri update-notice-open"
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
                "href": "#i-external"
              },
              "children": []
            }
          ]
        },
        {
          "type": "text",
          "value": "Open"
        }
      ]
    },
    {
      "type": "text",
      "value": "\n        "
    },
    {
      "type": "element",
      "tag": "button",
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
      "value": "\n      "
    }
  ]
};
