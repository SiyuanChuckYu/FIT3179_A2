window.renderGVASunburst = async function renderGVASunburst(
  containerSelector,
  dataUrl
) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  // Clear previous content if any
  container.innerHTML = "";

  // Fetch data
  const data = await d3.json(dataUrl);

  // Ensure tooltip positioning works by making container relative
  container.style.position = "relative";

  // Dimensions: bump size up a bit more
  const width = Math.min(760, Math.max(520, container.clientWidth || 760));
  const height = width;
  const margin = { top: 22, right: 22, bottom: 22, left: 22 };
  const radius = width / 6.3;

  // Colour scale assigns distinct hues to each top-level industry.
  const color = d3.scaleOrdinal(
    d3.quantize(d3.interpolateRainbow, (data.children?.length || 6) + 1)
  );

  // Hierarchy aggregates values so upper nodes know the sum of their children.
  const hierarchy = d3
    .hierarchy(data)
    .sum((d) => d.value)
    .sort((a, b) => (b.value || 0) - (a.value || 0));

  // Partition converts the hierarchy into polar coordinates for the sunburst.
  const root = d3.partition().size([2 * Math.PI, hierarchy.height + 1])(
    hierarchy
  );

  root.each((d) => (d.current = d));

  // Shared arc generator used for both initial render and zoom transitions.
  const arc = d3
    .arc()
    .startAngle((d) => d.x0)
    .endAngle((d) => d.x1)
    .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.005))
    .padRadius(radius * 1.5)
    .innerRadius((d) => d.y0 * radius)
    .outerRadius((d) => Math.max(d.y0 * radius, d.y1 * radius - 1));

  const svg = d3
    .create("svg")
    // Add padding around the chart via an expanded viewBox
    .attr("viewBox", [
      -width / 2 - margin.left,
      -height / 2 - margin.top,
      width + margin.left + margin.right,
      width + margin.top + margin.bottom,
    ])
    .style("display", "block")
    .style("width", "min(820px, 100%)")
    .style("height", "auto")
    .style(
      "font",
      "10px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial"
    )
    .style("overflow", "visible");

  const g = svg.append("g");

  // Visible slices; we toggle opacity/pointer events as the view zooms.
  const path = g
    .append("g")
    .selectAll("path")
    .data(root.descendants().slice(1))
    .join("path")
    .attr("fill", (d) => {
      while (d.depth > 1) d = d.parent;
      return color(d.data.name);
    })
    .attr("fill-opacity", (d) =>
      arcVisible(d.current) ? (d.children ? 0.6 : 0.4) : 0
    )
    .attr("pointer-events", (d) => (arcVisible(d.current) ? "auto" : "none"))
    .attr("d", (d) => arc(d.current));

  // Tooltip container
  const tooltip = d3
    .select(container)
    .append("div")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("background", "#ffffff")
    .style("color", "#111827")
    .style("padding", "8px 10px")
    .style("border-radius", "8px")
    .style(
      "font",
      "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial"
    )
    .style("border", "1px solid rgba(148, 163, 184, 0.45)")
    .style("box-shadow", "0 10px 28px rgba(15, 23, 42, 0.18)")
    .style("max-width", "280px")
    .style("visibility", "hidden")
    .style("z-index", "20");

  const format = d3.format(",.0f");

  // Interactivity (hover + click)
  path
    .on("mousemove", (event, d) => {
      if (!arcVisible(d.current)) return tooltip.style("visibility", "hidden");
      const rect = container.getBoundingClientRect();
      const trail = d
        .ancestors()
        .map((x) => shortName(x.data.name))
        .reverse()
        .join(" / ");
      tooltip
        .html(
          `
        <div style="display:flex; gap:6px; align-items:flex-start; margin-bottom:4px;">
          <span style="color:#6b7280; min-width:86px;">Industry:</span>
          <span style="font-weight:600; color:#111827;">${trail}</span>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <span style="color:#6b7280; min-width:86px;">GVA (millions):</span>
          <span style="font-weight:600; color:#111827;">${format(
            d.value
          )}</span>
        </div>
      `
        )
        .style("left", `${event.clientX - rect.left + 12}px`)
        .style("top", `${event.clientY - rect.top + 12}px`)
        .style("visibility", "visible");
    })
    .on("mouseleave", () => tooltip.style("visibility", "hidden"));

  path
    .filter((d) => d.children)
    .style("cursor", "pointer")
    .on("click", clicked);

  // Text labels sit within arcs and fade when slices become too small.
  const label = g
    .append("g")
    .attr("pointer-events", "none")
    .attr("text-anchor", "middle")
    .style("user-select", "none")
    .selectAll("text")
    .data(root.descendants().slice(1))
    .join("text")
    .attr("dy", "0.35em")
    .attr("fill-opacity", (d) => +labelVisible(d.current))
    .attr("transform", (d) => labelTransform(d.current, radius))
    .text((d) => shortName(d.data.name));

  // Invisible circle captures clicks on the centre to zoom out.
  const parent = g
    .append("circle")
    .datum(root)
    .attr("r", radius)
    .attr("fill", "rgba(255,255,255,0.12)")
    .attr("stroke", "#d1d5db")
    .attr("stroke-width", 0.6)
    .attr("pointer-events", "all")
    .on("click", clicked);

  // Helper text reminding the user how to navigate the zoom.
  const centreHint = g
    .append("g")
    .attr("text-anchor", "middle")
    .style("pointer-events", "none")
    .style(
      "font",
      "11px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial"
    )
    .style("fill", "#6b7280");

  const hintLine1 = centreHint
    .append("text")
    .attr("dy", "-0.1em")
    .text("Click arcs to zoom");

  const hintLine2 = centreHint
    .append("text")
    .attr("dy", "1.2em")
    .text("Click centre to reset");

  // Total value readout for current focus (in millions)
  const hintValue = centreHint
    .append("text")
    .attr("dy", "2.6em")
    .style("font-weight", 700)
    .style("fill", "#334155")
    .text("");

  function updateCentreHint(node) {
    const focus = node || root;
    if (!node || node === root) {
      hintLine1.text("Click arcs to zoom");
      hintLine2.text("Click centre to reset");
    } else {
      hintLine1.text("Zoomed into:");
      hintLine2.text(shortName(node.data.name));
    }
    const val = format(focus.value || 0);
    hintValue.text(`Total (millions): ${val}`);
  }
  updateCentreHint(root);

  // Handle zoom transitions when a slice or the centre circle is clicked.
  function clicked(event, p) {
    parent.datum(p.parent || root);
    updateCentreHint(p.depth ? p : null);

    root.each(
      (d) =>
        (d.target = {
          x0:
            Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) *
            2 *
            Math.PI,
          x1:
            Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) *
            2 *
            Math.PI,
          y0: Math.max(0, d.y0 - p.depth),
          y1: Math.max(0, d.y1 - p.depth),
        })
    );

    const t = svg.transition().duration(event && event.altKey ? 7500 : 750);

    path
      .transition(t)
      .tween("data", (d) => {
        const i = d3.interpolate(d.current, d.target);
        return (t) => (d.current = i(t));
      })
      .filter(function (d) {
        return +this.getAttribute("fill-opacity") || arcVisible(d.target);
      })
      .attr("fill-opacity", (d) =>
        arcVisible(d.target) ? (d.children ? 0.6 : 0.4) : 0
      )
      .attr("pointer-events", (d) => (arcVisible(d.target) ? "auto" : "none"))
      .attrTween("d", (d) => () => arc(d.current));

    label
      .filter(function (d) {
        return +this.getAttribute("fill-opacity") || labelVisible(d.target);
      })
      .transition(t)
      .attr("fill-opacity", (d) => +labelVisible(d.target))
      .attrTween("transform", (d) => () => labelTransform(d.current, radius));
  }

  function arcVisible(d) {
    return d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
  }
  function labelVisible(d) {
    return d.y1 <= 3 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.035;
  }
  function labelTransform(d, radius) {
    const x = (((d.x0 + d.x1) / 2) * 180) / Math.PI;
    const y = ((d.y0 + d.y1) / 2) * radius;
    return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
  }
  function shortName(name) {
    if (!name) return name;
    // Remove trailing one-letter code in parentheses, e.g., " (A)"
    let s = name.replace(/\s*\([A-Z]\)$/, "");
    // Specific replacements
    const map = {
      "Forestry and fishing": "Forestry & fishing",
      "Agriculture, forestry and fishing": "Agriculture, forestry & fishing",
      "Transport, postal and warehousing": "Transport, postal & warehousing",
      "Transport, postal and storage services": "Transport & storage services",
      "Information media and telecommunications": "Info media & telecoms",
      "Professional, scientific and technical services":
        "Prof., sci. & technical",
      "Administrative and support services": "Admin & support services",
      "Public administration and safety": "Public admin & safety",
      "Rental, hiring and real estate services": "Rental, hiring & real estate",
      "Electricity, gas, water and waste services":
        "Electricity, gas, water & waste",
      "Other information and media services": "Other info & media",
      "Computer system design and related services": "Computer system design",
      "Mining (excluding exploration and mining support services)":
        "Mining (excl. support)",
      "Exploration and mining support services": "Mining support services",
    };
    if (map[s]) return map[s];
    // Light squeeze: replace " and " with " & "
    s = s.replace(/\band\b/g, "&");
    return s;
  }

  // Mount SVG
  container.appendChild(svg.node());

  // Resize handler (simple): re-render on container resize
  const ro = new ResizeObserver(() => {
    // Debounce basic: if width changed significantly, re-render
    const newW = Math.min(760, Math.max(520, container.clientWidth || 760));
    if (Math.abs(newW - width) > 20) {
      ro.disconnect();
      renderGVASunburst(containerSelector, dataUrl);
    }
  });
  ro.observe(container);
};
