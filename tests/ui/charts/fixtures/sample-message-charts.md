Here are four sample message charts for visual QA.

```chart
{
  "type": "scatter",
  "title": "Height and weight",
  "description": "A compact scatter plot for checking spacing, grid, and active guides.",
  "xLabel": "Height",
  "yLabel": "Weight",
  "unit": "kg",
  "data": [
    { "label": "A", "x": 160, "y": 52 },
    { "label": "B", "x": 165, "y": 58 },
    { "label": "C", "x": 170, "y": 65 },
    { "label": "D", "x": 175, "y": 72 },
    { "label": "E", "x": 180, "y": 80 }
  ]
}
```

```chart
{
  "type": "bar",
  "title": "Product sales",
  "description": "Rounded bars with clear value labels.",
  "xLabel": "Product",
  "yLabel": "Sales",
  "unit": "items",
  "data": [
    { "label": "A", "value": 120 },
    { "label": "B", "value": 95 },
    { "label": "C", "value": 150 },
    { "label": "D", "value": 80 }
  ]
}
```

```chart
{
  "type": "line",
  "title": "Monthly revenue",
  "description": "A six-month trend for checking line weight and snapping.",
  "xLabel": "Month",
  "yLabel": "Revenue",
  "unit": "k",
  "data": [
    { "label": "Jan", "value": 12 },
    { "label": "Feb", "value": 13.5 },
    { "label": "Mar", "value": 12.8 },
    { "label": "Apr", "value": 15.1 },
    { "label": "May", "value": 16.2 },
    { "label": "Jun", "value": 17.5 }
  ]
}
```

```chart
{
  "type": "donut",
  "title": "Market share",
  "description": "A donut chart with a two-column legend.",
  "unit": "%",
  "data": [
    { "label": "A", "value": 40 },
    { "label": "B", "value": 30 },
    { "label": "C", "value": 20 },
    { "label": "D", "value": 10 }
  ]
}
```
