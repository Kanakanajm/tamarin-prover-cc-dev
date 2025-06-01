import dotString from "./example.dot?raw";
import { instance } from "@viz-js/viz";
import * as d3 from "d3";
import { ActionText, calculateCentroid, calculateEllipseRadii, lengthSqured, Ellipse, getCubicBezierCurve, getCubicBezierCurveGradients, intersect, minus, normalize, parseEdgeTitle, Ray, sub, traverse, Vec2 } from "./helper";

const ZOOM_LEVEL_THRESHOLD = 0.99;
type ZoomLevel = "ZoomIn" | "ZoomOut";

// scale = 1 > 0.8 => ZoomIn
let lastZoomLevel: ZoomLevel = "ZoomIn";

let removedNodes: SVGGElement[] = [];

let removedEdges: SVGGElement[] = [];

let graphJson: any;
let edgesToReroute: any[] = [];

function popRecords() {
  return d3.selectAll<SVGGElement, unknown>(".node.record").remove().nodes();
}

function popMiniRecords() {
  return d3.selectAll<SVGGElement, unknown>(".node.mini-record").remove().nodes();
}

function popEdges() {
  return d3.selectAll<SVGGElement, unknown>(".edge").filter(function (this) {
    return edgesToReroute.find(edge => edge.title === d3.select(this).selectChild("title").text());
  }).remove().nodes();
}

function popNewEdges() {
  return d3.selectAll<SVGGElement, unknown>(".edge.new-edge").remove().nodes();
}

function restoreRemoved() {
  d3.select<SVGGElement, unknown>(".graph").node()?.append(...removedNodes);
  d3.select<SVGGElement, unknown>(".graph").node()?.append(...removedEdges);
}

function getEllipse(selection: d3.Selection<SVGEllipseElement, unknown, HTMLElement, any>): Ellipse {
  return {
    c: {
      x: Number(selection.attr("cx")),
      y: Number(selection.attr("cy"))
    },
    rx: Number(selection.attr("rx")),
    ry: Number(selection.attr("ry"))
  }
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

function getTitleText(g: SVGGElement): string {
  return d3.select<SVGGElement, unknown>(g).selectChild<SVGTitleElement>("title").text();
}

function constructNewPath(path: string, start: Vec2, end: Vec2): string {
  const cIndex = path.indexOf("C");
  if (cIndex === -1) {
    // no curve, return the original path
    console.error("No curve found in the path, cannot construct new path");
    return path;
  }
  return `M${start.x.toFixed(2)},${start.y.toFixed(2)}${path.slice(cIndex)}L${end.x.toFixed(2)},${end.y.toFixed(2)}`;
}

function getArrowHeadPoints(pointStr: string): Vec2[] {
  return pointStr.split(" ").map(pair => {
    const [xStr, yStr] = pair.split(",");
    return { x: parseFloat(xStr), y: parseFloat(yStr) };
  });
}

function getArrowHeadHeight(poiontStr: string): number {
  const points = getArrowHeadPoints(poiontStr);
  if (points.length < 3) {
    console.error("Not enough points to calculate arrow head height");
    return 0;
  }
  // calculate the height as the distance between the first and last point
  return Math.sqrt(lengthSqured(sub(points[0], points[1])) - 0.25 * lengthSqured(sub(points[0], points[2])));
}

function appendNewEdges() {
  const graph = d3.select<SVGGElement, unknown>(".graph");
  for (const edge of edgesToReroute) {

    const oldEdge = getGWithTitle(edge.title);

    const g = graph.append("g")
      .attr("id", oldEdge.attr("id"))
      .attr("class", "edge new-edge");

    g.append("title");

    const fromNode = getGWithTitle(edge.tailName);
    const toNode = getGWithTitle(edge.headName);
    if (fromNode.empty() || toNode.empty()) {
      console.error(`Node with title ${edge.tailName} or ${edge.headName} not found`);
      return;
    }

    const fromEllipseSelection = fromNode
      .selectChild<SVGEllipseElement>("ellipse");
    const toEllipseSelection = toNode
      .selectChild<SVGEllipseElement>("ellipse");

    const fromEllipse = getEllipse(fromEllipseSelection);
    const toEllipse = getEllipse(toEllipseSelection);


    const oldEdgePath = oldEdge.selectChild<SVGPathElement>("path");
    const oldEdgePolygon = oldEdge.selectChild<SVGPathElement>("polygon");
    const oldCurve = getCubicBezierCurve(oldEdgePath.attr("d"));
    const [oldStartGrad, oldEndGrad] = getCubicBezierCurveGradients(oldCurve);

    // start from the starting point of the curve and in direction of the negative gradient
    // opposite of the (arrow) path's direction
    const startRay: Ray = {
      o: oldCurve.start,
      d: minus(oldStartGrad)
    };

    const itsStart = intersect(startRay, fromEllipse);

    const endRay: Ray = {
      o: oldCurve.end,
      d: oldEndGrad
    };

    const itsEnd = intersect(endRay, toEllipse);

    if (!itsStart || !itsEnd) {
      console.error("The rays didn't intersect! What?");
      continue;
    }

    // const arrowHeadLength = getArrowHeadHeight(oldEdgePolygon.attr("points")); 
    const arrowHeadLength = 12.5;
    const newStart = traverse(startRay, itsStart);
    const newEnd = traverse(endRay, itsEnd - arrowHeadLength);

    // translation for the arrow head along the ray
    const delta = sub(newEnd, oldCurve.end);
    g.append("path")
      .attr("d", constructNewPath(oldEdgePath.attr("d"), newStart, newEnd))
      .attr("fill", oldEdgePath.attr("fill"))
      .attr("stroke", oldEdgePath.attr("stroke"))
      .attr("stroke-width", oldEdgePath.attr("stroke-width"))
      .attr("stroke-dasharray", oldEdgePath.attr("stroke-dasharray"))

    g.append("polygon")
      .attr("points", oldEdgePolygon.attr("points"))
      .attr("fill", oldEdgePolygon.attr("fill"))
      .attr("stroke", oldEdgePolygon.attr("stroke"))
      .attr("stroke-width", oldEdgePolygon.attr("stroke-width"))
      .attr("transform", `translate(${delta.x}, ${delta.y})`);

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
    g.append("title")
      .text(getTitleText(this));

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
  // restore previous removed record and pop the mini ones
  if (removedNodes.length > 0) {
    restoreRemoved();
    removedNodes = popMiniRecords();
    removedEdges = popNewEdges();
  }
  // user zoom in on screen load, do nothing
}

function handleZoomOut() {
  if (removedNodes.length > 0) {
    // restore the removed mini-records (ellipses)
    restoreRemoved();
    // remove records (rectangles)
    removedNodes = popRecords();
    removedEdges = popEdges();
    return;
  }

  // first time zoom out, removedNodes is empty
  appendMiniRecords();
  appendNewEdges();
  removedNodes = popRecords();
  removedEdges = popEdges();

}

function getGWithTitle(title: string) {
  return d3.selectAll<SVGTitleElement, unknown>("title").filter(function (this) {
    return d3.select(this).text() === title;
  }).select(function (this) {
    return this.parentElement;
  });
}


function getNode(id: number) {
  return graphJson.objects.find((obj: any) => obj._gvid === id)
}
function getNodeName(id: number) {
  return getNode(id)?.name ?? `n??`;
}


function isNodeRecord(id: number) {
  const node = getNode(id);
  return node && node.shape === "record";
}
function constructEdgeTitle(edge: any): string {
  return `${getNodeName(edge.tail)}${edge.tailport ? `:${edge.tailport}` : ""}->${getNodeName(edge.head)}${edge.headport ? `:${edge.headport}` : ""}`;
}
function getRerouteRequiredEdges() {
  return graphJson.edges.filter((edge: any) => {
    return edge.style !== "invis" && (isNodeRecord(edge.tail) || isNodeRecord(edge.head));
  }).map((edge: any) => ({
    ...edge,
    headName: getNodeName(edge.head),
    tailName: getNodeName(edge.tail),
    title: constructEdgeTitle(edge)
  }));
}
instance().then(viz => {
  // render the dot graph as svg
  document.getElementById("app")?.appendChild(
    viz.renderSVGElement(dotString));

  graphJson = viz.renderJSON(dotString);
  console.log(graphJson);
  edgesToReroute = getRerouteRequiredEdges();
  console.log(edgesToReroute);

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

function lengthSquredsub(arg0: Vec2, arg1: Vec2): number {
  throw new Error("Function not implemented.");
}
