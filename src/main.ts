import dotString from "./example.dot?raw";
import { instance } from "@viz-js/viz";
import * as d3 from "d3";

instance().then(viz => {
  document.getElementById("app")?.appendChild(viz.renderSVGElement(dotString, {
  }));

  // Red bounding boxes for each ellipse
  d3.selectAll<SVGEllipseElement, unknown>("ellipse").each(function(this, d, index, groups) {
    const bbox = this.getBBox();    
    d3.select(this.parentElement) // append rect to the same parent as ellipse
      .append("rect")
      .attr("x", bbox.x)
      .attr("y", bbox.y)
      .attr("width", bbox.width)
      .attr("height", bbox.height)
      .attr("fill", "none")
      .attr("stroke", "red")
      .attr("stroke-dasharray", "4 2");
  });
  const graph = d3.select<SVGGraphicsElement, unknown>(".graph");

  const gElement = graph.node()!;
  const gElementBBox = gElement.getBBox();

  const cx = gElementBBox.x + gElementBBox.width / 2; // centroid x coordinate of the whole graph 
  const cy = gElementBBox.y + gElementBBox.height / 2;  // centroid y 

  // plot the centroid
  graph.append("circle")
    .attr("id", "graph-centroid")
    .attr("cx", cx)
    .attr("cy", cy)
    .attr("r", 5)
    .attr("fill", "red")
  console.log("Centroid: ", cx, cy);

  const translation = gElement.transform.baseVal.getItem(2);
  if (translation.type !== SVGTransform.SVG_TRANSFORM_TRANSLATE) {
    throw new Error("Expected translation");
  }

  const tx = translation.matrix.e;
  const ty = translation.matrix.f;

  const svg = d3.select<SVGSVGElement, unknown>("svg");
  const svgElement = svg.node()!;

  // const toLocalTransform = gElement.getScreenCTM()!.inverse()

  const graphZoomBehavior = d3.zoom<SVGSVGElement, unknown>()
    .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
    // Create an SVGPoint to hold screen coordinates

    const worldToLocal = gElement.getScreenCTM()!.inverse();

    const pt = svgElement.createSVGPoint();
    pt.x = event.sourceEvent.clientX;
    pt.y = event.sourceEvent.clientY;
    const cursorpt =  pt.matrixTransform(worldToLocal);

    console.log("Zoom at", cursorpt);

    // plot zoomed point
  // graph.append("circle")
  // .attr("class", "zoomed-point")
  // .attr("cx", p.x)
  // .attr("cy",  p.y)
  // .attr("r", 5)
  // .attr("fill", "blue")

    graph.attr("transform", `translate(${tx} ${ty}) translate(${cursorpt.x} ${cursorpt.y}) scale(${event.transform.k}) translate(${-cursorpt.x} ${-cursorpt.y})`);
  });
  
  svg.call(graphZoomBehavior);

  svg.on("click", evt => {
    const worldToLocal = gElement.getScreenCTM()!.inverse();

    const pt = svgElement.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const cursorpt =  pt.matrixTransform(worldToLocal);
    graph.append("circle")
    .attr("class", "cursor-point")
    .attr("cx", cursorpt.x)
    .attr("cy", cursorpt.y)
    .attr("r", 5)
    .attr("fill", "blue");
  });
});