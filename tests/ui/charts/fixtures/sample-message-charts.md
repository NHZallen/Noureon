Here are twelve sample message charts for visual QA.

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
  "type": "heatmap",
  "title": "Weekly activity",
  "xLabel": "Time",
  "yLabel": "Day",
  "unit": "events",
  "data": [
    { "x": "Morning", "y": "Monday", "value": 24 },
    { "x": "Afternoon", "y": "Monday", "value": 42 },
    { "x": "Evening", "y": "Monday", "value": 65 },
    { "x": "Morning", "y": "Tuesday", "value": 31 },
    { "x": "Afternoon", "y": "Tuesday", "value": 58 },
    { "x": "Evening", "y": "Tuesday", "value": 47 }
  ]
}
```

```chart
{
  "type": "treemap",
  "title": "Product revenue mix",
  "unit": "USD",
  "data": [
    { "label": "Product A", "value": 520000, "group": "Core" },
    { "label": "Product B", "value": 310000, "group": "Core" },
    { "label": "Product C", "value": 180000, "group": "Growth" },
    { "label": "Product D", "value": 45000, "group": "Growth" }
  ]
}
```

```chart
{
  "type": "radar",
  "title": "Product capabilities",
  "unit": "points",
  "min": 0,
  "max": 100,
  "series": [
    { "key": "productA", "label": "Product A" },
    { "key": "productB", "label": "Product B" }
  ],
  "data": [
    { "label": "Speed", "productA": 82, "productB": 76 },
    { "label": "Stability", "productA": 74, "productB": 88 },
    { "label": "Usability", "productA": 90, "productB": 80 },
    { "label": "Cost", "productA": 68, "productB": 79 },
    { "label": "Extensibility", "productA": 76, "productB": 84 }
  ]
}
```

```chart
{
  "type": "funnel",
  "title": "Signup conversion funnel",
  "unit": "people",
  "data": [
    { "label": "Visits", "value": 10000 },
    { "label": "Signups", "value": 4200 },
    { "label": "Activated", "value": 2600 },
    { "label": "Paid", "value": 680 }
  ]
}
```

```chart
{
  "type": "waterfall",
  "title": "Profit bridge",
  "unit": "USD",
  "data": [
    { "label": "Revenue", "value": 1200000, "kind": "start" },
    { "label": "Cost", "value": -420000 },
    { "label": "Marketing", "value": -160000 },
    { "label": "Other income", "value": 80000 },
    { "label": "Net profit", "value": 700000, "kind": "end" }
  ]
}
```

```chart
{
  "type": "sankey",
  "title": "Traffic flow",
  "description": "A compact flow from acquisition sources into conversion.",
  "unit": "people",
  "nodes": [
    { "id": "search", "label": "Search" },
    { "id": "social", "label": "Social" },
    { "id": "signup", "label": "Signup" },
    { "id": "paid", "label": "Paid" }
  ],
  "links": [
    { "source": "search", "target": "signup", "value": 1200 },
    { "source": "social", "target": "signup", "value": 800 },
    { "source": "signup", "target": "paid", "value": 420 }
  ]
}
```

```chart
{
  "type": "boxplot",
  "title": "Score distribution by class",
  "xLabel": "Class",
  "yLabel": "Score",
  "unit": "points",
  "data": [
    { "label": "Class A", "min": 52, "q1": 68, "median": 76, "q3": 88, "max": 96, "outliers": [42, 99] },
    { "label": "Class B", "min": 48, "q1": 62, "median": 72, "q3": 84, "max": 93, "outliers": [35] },
    { "label": "Class C", "min": 58, "q1": 69, "median": 78, "q3": 88, "max": 95 }
  ]
}
```

```chart
{
  "type": "gantt",
  "title": "Project timeline",
  "description": "A lightweight schedule with progress and a milestone.",
  "xLabel": "Date",
  "yLabel": "Task",
  "data": [
    { "label": "Requirements", "start": "2026-07-01", "end": "2026-07-05", "progress": 100, "group": "Planning" },
    { "label": "UI design", "start": "2026-07-04", "end": "2026-07-12", "progress": 65, "group": "Design" },
    { "label": "Frontend build", "start": "2026-07-10", "end": "2026-07-24", "progress": 30, "group": "Build" },
    { "label": "Beta release", "date": "2026-07-18", "kind": "milestone" }
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
