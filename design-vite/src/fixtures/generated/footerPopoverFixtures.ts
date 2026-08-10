import type { FixtureNode } from '../FixtureNode';

export const footerPopoverFixtures: readonly FixtureNode[] = [
  {
    "type": "element",
    "tag": "div",
    "attributes": {
      "class": "footpop theme"
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
          "class": "po-t"
        },
        "children": [
          {
            "type": "text",
            "value": "Theme"
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
          "class": "thi",
          "data-themeset": "warm"
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
                  "href": "#i-sunrise"
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
                "value": "Warm"
              }
            ]
          },
          {
            "type": "element",
            "tag": "svg",
            "attributes": {
              "class": "ck"
            },
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
            "type": "element",
            "tag": "div",
            "attributes": {
              "class": "art"
            },
            "children": [
              {
                "type": "element",
                "tag": "svg",
                "attributes": {
                  "viewBox": "0 0 240 48",
                  "preserveAspectRatio": "xMidYMid slice"
                },
                "children": [
                  {
                    "type": "element",
                    "tag": "defs",
                    "attributes": {},
                    "children": [
                      {
                        "type": "element",
                        "tag": "lineargradient",
                        "attributes": {
                          "id": "aw-sky",
                          "x1": "0",
                          "y1": "0",
                          "x2": "0",
                          "y2": "1"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "stop",
                            "attributes": {
                              "offset": "0",
                              "stop-color": "#ffe6d0"
                            },
                            "children": []
                          },
                          {
                            "type": "element",
                            "tag": "stop",
                            "attributes": {
                              "offset": "1",
                              "stop-color": "#fff6ee"
                            },
                            "children": []
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "radialgradient",
                        "attributes": {
                          "id": "aw-sun",
                          "cx": "50%",
                          "cy": "50%",
                          "r": "50%"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "stop",
                            "attributes": {
                              "offset": "0",
                              "stop-color": "#ffab5e"
                            },
                            "children": []
                          },
                          {
                            "type": "element",
                            "tag": "stop",
                            "attributes": {
                              "offset": ".55",
                              "stop-color": "#ffc987"
                            },
                            "children": []
                          },
                          {
                            "type": "element",
                            "tag": "stop",
                            "attributes": {
                              "offset": "1",
                              "stop-color": "#ffc987",
                              "stop-opacity": "0"
                            },
                            "children": []
                          }
                        ]
                      }
                    ]
                  },
                  {
                    "type": "element",
                    "tag": "rect",
                    "attributes": {
                      "width": "240",
                      "height": "48",
                      "fill": "url(#aw-sky)"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "circle",
                    "attributes": {
                      "cx": "130",
                      "cy": "33",
                      "r": "19",
                      "fill": "url(#aw-sun)"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "circle",
                    "attributes": {
                      "cx": "130",
                      "cy": "33",
                      "r": "8",
                      "fill": "#ff8a3a"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "path",
                    "attributes": {
                      "d": "M60 33 96 21 132 32 172 24 210 31 240 26 240 48 60 48Z",
                      "fill": "#a982a8",
                      "opacity": ".62"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "path",
                    "attributes": {
                      "d": "M60 40 104 29 150 38 196 30 240 36 240 48 60 48Z",
                      "fill": "#8a6690",
                      "opacity": ".78"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "ellipse",
                    "attributes": {
                      "cx": "150",
                      "cy": "36",
                      "rx": "70",
                      "ry": "3.5",
                      "fill": "#fff",
                      "opacity": ".5"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "rect",
                    "attributes": {
                      "y": "40",
                      "width": "240",
                      "height": "8",
                      "fill": "#ffeede",
                      "opacity": ".8"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "line",
                    "attributes": {
                      "x1": "70",
                      "y1": "44",
                      "x2": "120",
                      "y2": "44",
                      "stroke": "#ff9a5a",
                      "stroke-width": ".9",
                      "opacity": ".5"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "path",
                    "attributes": {
                      "d": "M198 43q6 4 12 0",
                      "fill": "none",
                      "stroke": "#6f5568",
                      "stroke-width": "1.5"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "line",
                    "attributes": {
                      "x1": "204",
                      "y1": "43",
                      "x2": "204",
                      "y2": "37.5",
                      "stroke": "#6f5568",
                      "stroke-width": "1"
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
        "value": "\n        "
      },
      {
        "type": "element",
        "tag": "div",
        "attributes": {
          "class": "thi",
          "data-themeset": "light"
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
                  "href": "#i-sun"
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
                "value": "Light"
              }
            ]
          },
          {
            "type": "element",
            "tag": "svg",
            "attributes": {
              "class": "ck"
            },
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
            "type": "element",
            "tag": "div",
            "attributes": {
              "class": "art"
            },
            "children": [
              {
                "type": "element",
                "tag": "svg",
                "attributes": {
                  "viewBox": "0 0 240 48",
                  "preserveAspectRatio": "xMidYMid slice"
                },
                "children": [
                  {
                    "type": "element",
                    "tag": "defs",
                    "attributes": {},
                    "children": [
                      {
                        "type": "element",
                        "tag": "lineargradient",
                        "attributes": {
                          "id": "al-sky",
                          "x1": "0",
                          "y1": "0",
                          "x2": "0",
                          "y2": "1"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "stop",
                            "attributes": {
                              "offset": "0",
                              "stop-color": "#a6d8f2"
                            },
                            "children": []
                          },
                          {
                            "type": "element",
                            "tag": "stop",
                            "attributes": {
                              "offset": "1",
                              "stop-color": "#e6f6ff"
                            },
                            "children": []
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "radialgradient",
                        "attributes": {
                          "id": "al-sun",
                          "cx": "50%",
                          "cy": "50%",
                          "r": "50%"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "stop",
                            "attributes": {
                              "offset": "0",
                              "stop-color": "#fff3c0"
                            },
                            "children": []
                          },
                          {
                            "type": "element",
                            "tag": "stop",
                            "attributes": {
                              "offset": ".55",
                              "stop-color": "#ffe066"
                            },
                            "children": []
                          },
                          {
                            "type": "element",
                            "tag": "stop",
                            "attributes": {
                              "offset": "1",
                              "stop-color": "#ffe066",
                              "stop-opacity": "0"
                            },
                            "children": []
                          }
                        ]
                      }
                    ]
                  },
                  {
                    "type": "element",
                    "tag": "rect",
                    "attributes": {
                      "width": "240",
                      "height": "48",
                      "fill": "url(#al-sky)"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "circle",
                    "attributes": {
                      "cx": "155",
                      "cy": "13",
                      "r": "16",
                      "fill": "url(#al-sun)"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "circle",
                    "attributes": {
                      "cx": "155",
                      "cy": "13",
                      "r": "6.5",
                      "fill": "#ffd84a"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "path",
                    "attributes": {
                      "d": "M58 36 98 22 138 34 178 21 218 33 240 28 240 48 58 48Z",
                      "fill": "#7bbf94",
                      "opacity": ".62"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "path",
                    "attributes": {
                      "d": "M58 42 102 30 150 40 198 30 240 37 240 48 58 48Z",
                      "fill": "#4f9d6e",
                      "opacity": ".82"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "rect",
                    "attributes": {
                      "y": "42",
                      "width": "240",
                      "height": "6",
                      "fill": "#c8ecff",
                      "opacity": ".82"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "line",
                    "attributes": {
                      "x1": "150",
                      "y1": "45",
                      "x2": "200",
                      "y2": "45",
                      "stroke": "#fff",
                      "stroke-width": ".8",
                      "opacity": ".65"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "path",
                    "attributes": {
                      "d": "M196 44q6 4 12 0",
                      "fill": "none",
                      "stroke": "#3f7a5a",
                      "stroke-width": "1.5"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "line",
                    "attributes": {
                      "x1": "202",
                      "y1": "44",
                      "x2": "202",
                      "y2": "38.5",
                      "stroke": "#3f7a5a",
                      "stroke-width": "1"
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
        "value": "\n        "
      },
      {
        "type": "element",
        "tag": "div",
        "attributes": {
          "class": "thi",
          "data-themeset": "ember"
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
                  "href": "#i-sunset"
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
                "value": "Ember"
              }
            ]
          },
          {
            "type": "element",
            "tag": "svg",
            "attributes": {
              "class": "ck"
            },
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
            "type": "element",
            "tag": "div",
            "attributes": {
              "class": "art"
            },
            "children": [
              {
                "type": "element",
                "tag": "svg",
                "attributes": {
                  "viewBox": "0 0 240 48",
                  "preserveAspectRatio": "xMidYMid slice"
                },
                "children": [
                  {
                    "type": "element",
                    "tag": "defs",
                    "attributes": {},
                    "children": [
                      {
                        "type": "element",
                        "tag": "lineargradient",
                        "attributes": {
                          "id": "ae-sky",
                          "x1": "0",
                          "y1": "0",
                          "x2": "0",
                          "y2": "1"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "stop",
                            "attributes": {
                              "offset": "0",
                              "stop-color": "#ff5a3a"
                            },
                            "children": []
                          },
                          {
                            "type": "element",
                            "tag": "stop",
                            "attributes": {
                              "offset": ".5",
                              "stop-color": "#ff8a52"
                            },
                            "children": []
                          },
                          {
                            "type": "element",
                            "tag": "stop",
                            "attributes": {
                              "offset": "1",
                              "stop-color": "#ffc07a"
                            },
                            "children": []
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "radialgradient",
                        "attributes": {
                          "id": "ae-sun",
                          "cx": "50%",
                          "cy": "50%",
                          "r": "50%"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "stop",
                            "attributes": {
                              "offset": "0",
                              "stop-color": "#ff3a1a"
                            },
                            "children": []
                          },
                          {
                            "type": "element",
                            "tag": "stop",
                            "attributes": {
                              "offset": ".55",
                              "stop-color": "#ff6a38"
                            },
                            "children": []
                          },
                          {
                            "type": "element",
                            "tag": "stop",
                            "attributes": {
                              "offset": "1",
                              "stop-color": "#ff6a38",
                              "stop-opacity": "0"
                            },
                            "children": []
                          }
                        ]
                      }
                    ]
                  },
                  {
                    "type": "element",
                    "tag": "rect",
                    "attributes": {
                      "width": "240",
                      "height": "48",
                      "fill": "url(#ae-sky)"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "circle",
                    "attributes": {
                      "cx": "178",
                      "cy": "30",
                      "r": "21",
                      "fill": "url(#ae-sun)"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "circle",
                    "attributes": {
                      "cx": "178",
                      "cy": "30",
                      "r": "9.5",
                      "fill": "#ff3818"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "path",
                    "attributes": {
                      "d": "M50 35 92 24 134 34 176 25 216 33 240 29 240 48 50 48Z",
                      "fill": "#7a3340",
                      "opacity": ".6"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "path",
                    "attributes": {
                      "d": "M50 41 96 30 146 39 196 29 240 36 240 48 50 48Z",
                      "fill": "#4a2030",
                      "opacity": ".82"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "rect",
                    "attributes": {
                      "y": "41",
                      "width": "240",
                      "height": "7",
                      "fill": "#ff9a5a",
                      "opacity": ".55"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "line",
                    "attributes": {
                      "x1": "150",
                      "y1": "45",
                      "x2": "200",
                      "y2": "45",
                      "stroke": "#ff5a2a",
                      "stroke-width": "1",
                      "opacity": ".6"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "path",
                    "attributes": {
                      "d": "M96 44q6 4 12 0",
                      "fill": "none",
                      "stroke": "#2a1420",
                      "stroke-width": "1.5"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "line",
                    "attributes": {
                      "x1": "102",
                      "y1": "44",
                      "x2": "102",
                      "y2": "38.5",
                      "stroke": "#2a1420",
                      "stroke-width": "1"
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
        "value": "\n        "
      },
      {
        "type": "element",
        "tag": "div",
        "attributes": {
          "class": "thi",
          "data-themeset": "dark"
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
                  "href": "#i-moon"
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
                "value": "Dark"
              }
            ]
          },
          {
            "type": "element",
            "tag": "svg",
            "attributes": {
              "class": "ck"
            },
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
            "type": "element",
            "tag": "div",
            "attributes": {
              "class": "art"
            },
            "children": [
              {
                "type": "element",
                "tag": "svg",
                "attributes": {
                  "viewBox": "0 0 240 48",
                  "preserveAspectRatio": "xMidYMid slice"
                },
                "children": [
                  {
                    "type": "element",
                    "tag": "defs",
                    "attributes": {},
                    "children": [
                      {
                        "type": "element",
                        "tag": "lineargradient",
                        "attributes": {
                          "id": "an-sky",
                          "x1": "0",
                          "y1": "0",
                          "x2": "0",
                          "y2": "1"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "stop",
                            "attributes": {
                              "offset": "0",
                              "stop-color": "#121a38"
                            },
                            "children": []
                          },
                          {
                            "type": "element",
                            "tag": "stop",
                            "attributes": {
                              "offset": "1",
                              "stop-color": "#34486e"
                            },
                            "children": []
                          }
                        ]
                      },
                      {
                        "type": "element",
                        "tag": "radialgradient",
                        "attributes": {
                          "id": "an-moon",
                          "cx": "50%",
                          "cy": "50%",
                          "r": "50%"
                        },
                        "children": [
                          {
                            "type": "element",
                            "tag": "stop",
                            "attributes": {
                              "offset": "0",
                              "stop-color": "#fff"
                            },
                            "children": []
                          },
                          {
                            "type": "element",
                            "tag": "stop",
                            "attributes": {
                              "offset": ".5",
                              "stop-color": "#eef4ff"
                            },
                            "children": []
                          },
                          {
                            "type": "element",
                            "tag": "stop",
                            "attributes": {
                              "offset": "1",
                              "stop-color": "#eef4ff",
                              "stop-opacity": "0"
                            },
                            "children": []
                          }
                        ]
                      }
                    ]
                  },
                  {
                    "type": "element",
                    "tag": "rect",
                    "attributes": {
                      "width": "240",
                      "height": "48",
                      "fill": "url(#an-sky)"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "circle",
                    "attributes": {
                      "cx": "155",
                      "cy": "14",
                      "r": "14",
                      "fill": "url(#an-moon)"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "circle",
                    "attributes": {
                      "cx": "155",
                      "cy": "14",
                      "r": "7",
                      "fill": "#f4f8ff"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "circle",
                    "attributes": {
                      "cx": "58",
                      "cy": "12",
                      "r": ".9",
                      "fill": "#fff",
                      "opacity": ".8"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "circle",
                    "attributes": {
                      "cx": "92",
                      "cy": "22",
                      "r": ".7",
                      "fill": "#fff",
                      "opacity": ".55"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "circle",
                    "attributes": {
                      "cx": "116",
                      "cy": "10",
                      "r": ".8",
                      "fill": "#fff",
                      "opacity": ".7"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "circle",
                    "attributes": {
                      "cx": "210",
                      "cy": "24",
                      "r": ".7",
                      "fill": "#fff",
                      "opacity": ".6"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "path",
                    "attributes": {
                      "d": "M50 35 92 23 134 34 176 24 216 32 240 28 240 48 50 48Z",
                      "fill": "#26355c",
                      "opacity": ".9"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "path",
                    "attributes": {
                      "d": "M50 41 96 30 146 39 196 29 240 36 240 48 50 48Z",
                      "fill": "#141e3a"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "rect",
                    "attributes": {
                      "y": "41",
                      "width": "240",
                      "height": "7",
                      "fill": "#2a3c60",
                      "opacity": ".7"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "line",
                    "attributes": {
                      "x1": "139",
                      "y1": "45",
                      "x2": "171",
                      "y2": "45",
                      "stroke": "#eef4ff",
                      "stroke-width": ".9",
                      "opacity": ".5"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "path",
                    "attributes": {
                      "d": "M182 44q6 4 12 0",
                      "fill": "none",
                      "stroke": "#0a1024",
                      "stroke-width": "1.5"
                    },
                    "children": []
                  },
                  {
                    "type": "element",
                    "tag": "line",
                    "attributes": {
                      "x1": "188",
                      "y1": "44",
                      "x2": "188",
                      "y2": "38.5",
                      "stroke": "#0a1024",
                      "stroke-width": "1"
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
        "value": "\n      "
      }
    ]
  },
  {
    "type": "element",
    "tag": "div",
    "attributes": {
      "class": "footpop lang"
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
          "class": "po-t"
        },
        "children": [
          {
            "type": "text",
            "value": "Language"
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
          "class": "thi",
          "data-langset": "en"
        },
        "children": [
          {
            "type": "element",
            "tag": "span",
            "attributes": {
              "class": "n"
            },
            "children": [
              {
                "type": "text",
                "value": "English"
              }
            ]
          },
          {
            "type": "element",
            "tag": "svg",
            "attributes": {
              "class": "ck"
            },
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
        "value": "\n        "
      },
      {
        "type": "element",
        "tag": "div",
        "attributes": {
          "class": "thi",
          "data-langset": "zh-CN"
        },
        "children": [
          {
            "type": "element",
            "tag": "span",
            "attributes": {
              "class": "n"
            },
            "children": [
              {
                "type": "text",
                "value": "简体中文"
              }
            ]
          },
          {
            "type": "element",
            "tag": "svg",
            "attributes": {
              "class": "ck"
            },
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
        "value": "\n        "
      },
      {
        "type": "element",
        "tag": "div",
        "attributes": {
          "class": "thi",
          "data-langset": "zh-TW"
        },
        "children": [
          {
            "type": "element",
            "tag": "span",
            "attributes": {
              "class": "n"
            },
            "children": [
              {
                "type": "text",
                "value": "繁體中文"
              }
            ]
          },
          {
            "type": "element",
            "tag": "svg",
            "attributes": {
              "class": "ck"
            },
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
        "value": "\n        "
      },
      {
        "type": "element",
        "tag": "div",
        "attributes": {
          "class": "thi",
          "data-langset": "ja"
        },
        "children": [
          {
            "type": "element",
            "tag": "span",
            "attributes": {
              "class": "n"
            },
            "children": [
              {
                "type": "text",
                "value": "日本語"
              }
            ]
          },
          {
            "type": "element",
            "tag": "svg",
            "attributes": {
              "class": "ck"
            },
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
        "value": "\n        "
      },
      {
        "type": "element",
        "tag": "div",
        "attributes": {
          "class": "thi",
          "data-langset": "ko"
        },
        "children": [
          {
            "type": "element",
            "tag": "span",
            "attributes": {
              "class": "n"
            },
            "children": [
              {
                "type": "text",
                "value": "한국어"
              }
            ]
          },
          {
            "type": "element",
            "tag": "svg",
            "attributes": {
              "class": "ck"
            },
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
        "value": "\n        "
      },
      {
        "type": "element",
        "tag": "div",
        "attributes": {
          "class": "thi",
          "data-langset": "de"
        },
        "children": [
          {
            "type": "element",
            "tag": "span",
            "attributes": {
              "class": "n"
            },
            "children": [
              {
                "type": "text",
                "value": "Deutsch"
              }
            ]
          },
          {
            "type": "element",
            "tag": "svg",
            "attributes": {
              "class": "ck"
            },
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
        "value": "\n        "
      },
      {
        "type": "element",
        "tag": "div",
        "attributes": {
          "class": "thi",
          "data-langset": "fr"
        },
        "children": [
          {
            "type": "element",
            "tag": "span",
            "attributes": {
              "class": "n"
            },
            "children": [
              {
                "type": "text",
                "value": "Français"
              }
            ]
          },
          {
            "type": "element",
            "tag": "svg",
            "attributes": {
              "class": "ck"
            },
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
        "value": "\n        "
      },
      {
        "type": "element",
        "tag": "div",
        "attributes": {
          "class": "thi",
          "data-langset": "es"
        },
        "children": [
          {
            "type": "element",
            "tag": "span",
            "attributes": {
              "class": "n"
            },
            "children": [
              {
                "type": "text",
                "value": "Español"
              }
            ]
          },
          {
            "type": "element",
            "tag": "svg",
            "attributes": {
              "class": "ck"
            },
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
        "value": "\n        "
      },
      {
        "type": "element",
        "tag": "div",
        "attributes": {
          "class": "thi",
          "data-langset": "it"
        },
        "children": [
          {
            "type": "element",
            "tag": "span",
            "attributes": {
              "class": "n"
            },
            "children": [
              {
                "type": "text",
                "value": "Italiano"
              }
            ]
          },
          {
            "type": "element",
            "tag": "svg",
            "attributes": {
              "class": "ck"
            },
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
        "value": "\n        "
      },
      {
        "type": "element",
        "tag": "div",
        "attributes": {
          "class": "thi",
          "data-langset": "pt-BR"
        },
        "children": [
          {
            "type": "element",
            "tag": "span",
            "attributes": {
              "class": "n"
            },
            "children": [
              {
                "type": "text",
                "value": "Português (Brasil)"
              }
            ]
          },
          {
            "type": "element",
            "tag": "svg",
            "attributes": {
              "class": "ck"
            },
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
        "value": "\n        "
      },
      {
        "type": "element",
        "tag": "div",
        "attributes": {
          "class": "thi",
          "data-langset": "ru"
        },
        "children": [
          {
            "type": "element",
            "tag": "span",
            "attributes": {
              "class": "n"
            },
            "children": [
              {
                "type": "text",
                "value": "Русский"
              }
            ]
          },
          {
            "type": "element",
            "tag": "svg",
            "attributes": {
              "class": "ck"
            },
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
        "value": "\n        "
      },
      {
        "type": "element",
        "tag": "div",
        "attributes": {
          "class": "thi",
          "data-langset": "nl"
        },
        "children": [
          {
            "type": "element",
            "tag": "span",
            "attributes": {
              "class": "n"
            },
            "children": [
              {
                "type": "text",
                "value": "Nederlands"
              }
            ]
          },
          {
            "type": "element",
            "tag": "svg",
            "attributes": {
              "class": "ck"
            },
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
        "value": "\n        "
      },
      {
        "type": "element",
        "tag": "div",
        "attributes": {
          "class": "thi",
          "data-langset": "pl"
        },
        "children": [
          {
            "type": "element",
            "tag": "span",
            "attributes": {
              "class": "n"
            },
            "children": [
              {
                "type": "text",
                "value": "Polski"
              }
            ]
          },
          {
            "type": "element",
            "tag": "svg",
            "attributes": {
              "class": "ck"
            },
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
        "value": "\n        "
      },
      {
        "type": "element",
        "tag": "div",
        "attributes": {
          "class": "thi",
          "data-langset": "tr"
        },
        "children": [
          {
            "type": "element",
            "tag": "span",
            "attributes": {
              "class": "n"
            },
            "children": [
              {
                "type": "text",
                "value": "Türkçe"
              }
            ]
          },
          {
            "type": "element",
            "tag": "svg",
            "attributes": {
              "class": "ck"
            },
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
        "value": "\n        "
      },
      {
        "type": "element",
        "tag": "div",
        "attributes": {
          "class": "thi",
          "data-langset": "uk"
        },
        "children": [
          {
            "type": "element",
            "tag": "span",
            "attributes": {
              "class": "n"
            },
            "children": [
              {
                "type": "text",
                "value": "Українська"
              }
            ]
          },
          {
            "type": "element",
            "tag": "svg",
            "attributes": {
              "class": "ck"
            },
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
        "value": "\n      "
      }
    ]
  }
];
