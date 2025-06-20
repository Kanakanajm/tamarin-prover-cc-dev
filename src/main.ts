import dotString from "./example.dot?raw";
import { instance } from "@viz-js/viz";
import * as d3 from "d3";
import { extendCurvePath, getCubicBezierCurve, getCubicBezierCurveGradients } from "./path";
import { calculateCentroid, calculateEllipseRadii, cross, direction, dot, Ellipse, intersect, inv, print2f, project, Ray, sub, traverse, Vec2 } from "./math";

const ZOOM_LEVEL_THRESHOLD = 0.99;
const ARROW_HEAD_WIDTH = 7;
const ARROW_HEAD_HEIGHT = 10;
const ARROW_HEAD_HALF_WIDTH = ARROW_HEAD_WIDTH / 2;
type ZoomLevel = "ZoomIn" | "ZoomOut";

// scale = 1 > 0.8 => ZoomIn
let lastZoomLevel: ZoomLevel = "ZoomIn";

let removedNodes: SVGGElement[] = [];

let removedEdges: SVGGElement[] = [];

let graphJson: any;
let edgesToReroute: any[] = [];

export interface ActionText {
  text: string | null;
  bb: DOMRect | null;
}

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

/**
 * 
 * @param selection the d3 selection of an \<ellipse\> element
 * @returns an Ellipse object constructed from the selection
 */
export function asEllipse(selection: d3.Selection<SVGEllipseElement, any, HTMLElement, any>): Ellipse {
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

function appendNewEdges() {
  const graph = d3.select<SVGGElement, unknown>(".graph");
  for (const edge of edgesToReroute) {
    const oldEdge = getGWithTitle(edge.title);
    const oldEdgePath = oldEdge.selectChild<SVGPathElement>("path");
    const oldEdgePolygon = oldEdge.selectChild<SVGPathElement>("polygon");
    const edgeStrokeWidth = oldEdgePolygon.attr("stroke-width") === null ? 1 : Number(oldEdgePolygon.attr("stroke-width"));
    const arrowHeadTipOffset = Math.sqrt(ARROW_HEAD_HALF_WIDTH * ARROW_HEAD_HALF_WIDTH + ARROW_HEAD_HEIGHT * ARROW_HEAD_HEIGHT) / ARROW_HEAD_HALF_WIDTH * (edgeStrokeWidth / 2);
    const arrowHeadRealHeight = ARROW_HEAD_HEIGHT + arrowHeadTipOffset + edgeStrokeWidth / 2;

    // the node where the edge starts from
    // Note that the nodes on the DOM right now are either mini-record or ellipse, since we've removed record
    const fromNode = getGWithTitle<SVGGElement>(edge.tailName);
    const fromEllipse = asEllipse(fromNode
      .selectChild<SVGEllipseElement>("ellipse"));

    // the node where the edge ends at
    const toNode = getGWithTitle<SVGGElement>(edge.headName);
    const toEllipse = asEllipse(toNode
      .selectChild<SVGEllipseElement>("ellipse"));

    if (fromNode.empty() || toNode.empty()) {
      console.error(`Can't find terminal nodes for edge ${edge.title} that starts at ${edge.tailName} and ends at ${edge.headName}`);
      throw new Error("Edge's start/end node missing");
    }

    const g = graph.append("g")
      .attr("id", oldEdge.attr("id"))
      .attr("class", "edge new-edge");

    g.append("title"); // need to be completed with same title as the old one
    console.log(fromNode.node());
    const shouldRerouteTail = Boolean(fromNode.attr("class")?.includes("mini-record"));
    const shouldRerouteHead = Boolean(toNode.attr("class")?.includes("mini-record"));

    let edgePath: string = oldEdgePath.attr("d");
    const oldCurve = getCubicBezierCurve(edgePath);
    const [oldTailGrad, oldHeadGrad] = getCubicBezierCurveGradients(oldCurve);
    let isTailReprojected = false;
    if (shouldRerouteTail) {
      // start from the starting point of the curve and in direction of the negative gradient
      // opposite of the (arrow) path's direction
      const tailRay: Ray = {
        o: oldCurve.start,
        d: inv(oldTailGrad)
      };

      // intersection to the from-ellipse by extending the tail ray
      const tailIts = intersect(tailRay, fromEllipse);

      if (tailIts) {
        edgePath = extendCurvePath(edgePath, traverse(tailRay, tailIts));
      }
      else {
        isTailReprojected = true;
        const tailProj = project(oldCurve.start, fromEllipse);
        edgePath = `M${print2f(tailProj)}L${print2f(oldCurve.end)}`;
      }
    }

    if (shouldRerouteHead) {
      const headRay: Ray = {
        o: oldCurve.end,
        d: oldHeadGrad
      };

      const headIts = intersect(headRay, toEllipse);
      let headItsPoint: Vec2;
      let headDirection: Vec2;
      if (headIts) {
        // has to consider the offset of the arrow head
        edgePath = extendCurvePath(edgePath, undefined, traverse(headRay, headIts - arrowHeadRealHeight));
        headItsPoint = traverse(headRay, headIts);
        headDirection = inv(headRay.d);

      }
      else {
        const headProj = project(oldCurve.end, toEllipse);
        headItsPoint = headProj;

        if (isTailReprojected) {
          throw new Error("Not implemented yet")
        } else {
          const projHeadRay: Ray = {
            o: headProj,
            d: direction(headProj, oldCurve.start)
          }
          edgePath = `M${print2f(oldCurve.start)}L${print2f(traverse(projHeadRay, arrowHeadRealHeight))}`;
          headDirection = projHeadRay.d;
          console.log(headDirection, cross({ x: 0, y: -1 }, headDirection));
        }

      }
      // add new arrow head

      // We obtain the angle between the end segment and vector (0, -1) (since SVG's rotation transform is defined as an angle of the angle from direction (0, -1) in clockwise manner) by taking the dot product of the inverse of the end ray's direction and vector (0, -1). The inversion (-endRay.d) is because we want the end segment's direction to point out so that it is comparable with the vector (0, -1) which is also pointing out. Math.acos(x) gives the result in radian so we have to convert it back to degree. Finally, the angle we calculated needed to be inverted (counter-clockwise) 

      const rotation = (cross({ x: 0, y: -1 }, headDirection) > 0 ? 1 : -1) * Math.acos(dot(headDirection, { x: 0, y: -1 })) * 180 / Math.PI;
      /**
      * Arrow Head Creation
      * Arrow heads created by graphviz have a width of 7 and a height of 10.
      * After edge re-route i.e. the start and end points get extended to their from and to-nodes respectively, the arrow heads (which are typically at the end points of the edges) must be re-created as well.
      * The arrow head triangle is first created as an upside down triangle with the tip pointing down and the base paralleling with the x-axis i.e. as ▼
      * The arrow head is then rotated to be aligned with the end point's gradient direction i.e. to be aligned with the last / end segment of the edge.
      */
      const arrowHeadTipPoint = sub(headItsPoint, { x: 0, y: arrowHeadTipOffset });
      const arrowHeadRightPoint = sub(arrowHeadTipPoint, { x: -ARROW_HEAD_HALF_WIDTH, y: ARROW_HEAD_HEIGHT });
      const arrowHeadLeftPoint = sub(arrowHeadTipPoint, { x: ARROW_HEAD_HALF_WIDTH, y: ARROW_HEAD_HEIGHT });
      g.append("path")
        .attr("d", `M${print2f(arrowHeadLeftPoint)}L${print2f(arrowHeadTipPoint)}L${print2f(arrowHeadRightPoint)}Z`)
        .attr("fill", oldEdgePolygon.attr("fill"))
        .attr("stroke", oldEdgePolygon.attr("stroke"))
        .attr("stroke-width", oldEdgePolygon.attr("stroke-width"))
        .attr("transform", `rotate(${rotation},${print2f(headItsPoint)})`);
    }
    else {
      // keep the old arrow head
      g.append("polygon")
        .attr("points", oldEdgePolygon.attr("points"))
        .attr("fill", oldEdgePolygon.attr("fill"))
        .attr("stroke", oldEdgePolygon.attr("stroke"))
        .attr("stroke-width", oldEdgePolygon.attr("stroke-width"));
    }

    g.append("path")
      .attr("d", edgePath)
      .attr("fill", oldEdgePath.attr("fill"))
      .attr("stroke", oldEdgePath.attr("stroke"))
      .attr("stroke-width", oldEdgePath.attr("stroke-width"))
      .attr("stroke-dasharray", oldEdgePath.attr("stroke-dasharray"));
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
  removedNodes = popRecords();

  appendNewEdges();
  removedEdges = popEdges();


}

function getGWithTitle<PElement extends d3.BaseType>(title: string) {
  return d3.selectAll<SVGTitleElement, unknown>("title").filter(function (this) {
    return d3.select(this).text() === title;
  }).select<PElement>(function (this: SVGTitleElement) {
    return this.parentElement as PElement;
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
  console.debug(graphJson);
  edgesToReroute = getRerouteRequiredEdges();
  console.debug(edgesToReroute);

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
