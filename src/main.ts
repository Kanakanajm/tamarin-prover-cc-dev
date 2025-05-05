import dotString from "./example.dot?raw";
import { instance } from "@viz-js/viz";
import * as d3 from "d3";

function transform(matrix: SVGMatrix, point: { x: number; y: number }) {
  const x = matrix.a * point.x + matrix.c * point.y + matrix.e;
  const y = matrix.b * point.x + matrix.d * point.y + matrix.f;
  return { x, y };
}


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

  const translation = gElement.transform.baseVal.getItem(2);
  if (translation.type !== SVGTransform.SVG_TRANSFORM_TRANSLATE) {
    throw new Error("Expected translation");
  }

  const tx = translation.matrix.e;
  const ty = translation.matrix.f;

  const graphZoomBehavior = d3.zoom<SVGSVGElement, unknown>().on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
    graph.attr("transform", `translate(${tx} ${ty}) translate(${cx} ${cy}) scale(${event.transform.k}) translate(${-cx} ${-cy})`);
  });
  
  d3.select<SVGSVGElement, unknown>("svg").call(graphZoomBehavior);
});