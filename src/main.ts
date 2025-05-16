import dotString from "./example.dot?raw";
import { instance } from "@viz-js/viz";
import * as d3 from "d3";
import { ActionText, calculateCentroid, calculateEllipseRadii } from "./helper";

const ZOOM_LEVEL_THRESHOLD = 0.9;
type ZoomLevel = "ZoomIn" | "ZoomOut";

// scale = 1 > 0.8 => ZoomIn
let lastZoomLevel: ZoomLevel = "ZoomIn";

let removedNodes: SVGGElement[] = [];

function popRecords() {
  return d3.selectAll<SVGGElement, unknown>(".node.record").remove().nodes();
}

function popMiniRecords() {
  return d3.selectAll<SVGGElement, unknown>(".node.mini-record").remove().nodes();
}

function restoreRemoved() {
  d3.select<SVGGElement, unknown>(".graph").node()?.append(...removedNodes);
}

function getPolygonFillColor(g: SVGGElement): string {
  return d3.select(g).selectChild("polygon").attr("fill");
}

function getActionText(g: SVGGElement): ActionText {
  const actionTextSelection = d3.select<SVGGElement, unknown>(g)
    .selectChildren<SVGTextElement, unknown>("text")
    .filter(function (this) {
      return this.textContent?.startsWith("#") ?? false
    });

  if (actionTextSelection.size() !== 1)
    return {
      text: null,
      bb: null
    };

  return {
    text: actionTextSelection.nodes()[0].textContent,
    bb: actionTextSelection.nodes()[0].getBBox(),
  }
}

function appendMiniRecords() {
  const graph = d3.select<SVGGElement, unknown>(".graph");
  d3.selectAll<SVGGElement, unknown>(".node.record").each(function (this) {
    const center = calculateCentroid(this.getBBox());
    const actionText = getActionText(this);

    const g = graph.append("g")
      .attr("id", this.getAttribute("id"))
      .attr("class", "node mini-record");

    g.append("ellipse")
      .attr("cx", center.x)
      .attr("cy", center.y)
      .attr("rx", calculateEllipseRadii(actionText.bb?.width ?? 50, 15)) // 15 = margin x
      .attr("ry", calculateEllipseRadii(actionText.bb?.height ?? 50, 8)) // 8 = margin y
      .attr("stroke", "black")
      .attr("fill", getPolygonFillColor(this));

    g.append("text")
      .attr("x", center.x)
      .attr("y", center.y)
      .attr("text-anchor", "middle")
      .attr("alignment-baseline", "middle")
      .attr("font-family", "Helvetica,sans-Serif") // *WARNING, hard-coded, pls adapt it to record font family
      .attr("font-size", "8") // *WARNING, hard-coded, pls adapt it to record font size
      .text(actionText.text ?? "default");
  })
}

function handleZoomIn() {
  // user zoom in on screen load, do nothing
  if (removedNodes.length > 0) {
    restoreRemoved();
    removedNodes = popMiniRecords();
  }
}

function handleZoomOut() {
  if (removedNodes.length > 0) {
    // restore the removed mini-records (ellipses)
    restoreRemoved();
    // remove records (rectangles)
    removedNodes = popRecords();
    return;
  }

  // first time zoom out, removedNodes is empty
  appendMiniRecords();
  removedNodes = popRecords();
}

instance().then(viz => {
  // render the dot graph as svg
  document.getElementById("app")?.appendChild(
    viz.renderSVGElement(dotString));

  // the initial translation matrix of 
  const translate = d3.select<SVGGElement, unknown>("g")
    .node()?.transform.baseVal
    .getItem(2);
  if (!translate || translate.type !== SVGTransform.SVG_TRANSFORM_TRANSLATE) {
    throw Error("Second Initial Transform Element is not Translation");
  }

  d3.select<SVGSVGElement, unknown>("svg").call(d3.zoom<SVGSVGElement, unknown>()
    .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
      // attach the zoom transform after the initial translation
      d3.select(".graph").attr("transform", event.transform.toString() + ` translate(${translate.matrix.e} ${translate.matrix.f})`);

      const currentZoomLevel = event.transform.k > ZOOM_LEVEL_THRESHOLD ? "ZoomIn" : "ZoomOut";

      // do nothing when zoom level didn't change
      if (currentZoomLevel === lastZoomLevel)
        return;

      // zoom level changed
      lastZoomLevel = currentZoomLevel;

      if (currentZoomLevel === "ZoomIn")
        handleZoomIn();
      else
        handleZoomOut();

    }));
});