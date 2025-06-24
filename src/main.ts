import dotString from "./example.dot?raw";
import { instance } from "@viz-js/viz";
import * as d3 from "d3";
import { extendCurvePath, getCubicBezierCurve, getCubicBezierCurveGradients } from "./path";
import { calculateCentroid, calculateEllipseRadii, cross, direction, dot, Ellipse, intersect, inv, print2f, project, Ray, sub, traverse, Vec2 } from "./math";
import { VizGraph } from "./viz";
import { DiGraph, DiGraphConnections } from "./digraph";
import './style.css';

const ZOOM_LEVEL_THRESHOLD = 0.99;
const ARROW_HEAD_WIDTH = 7;
const ARROW_HEAD_HEIGHT = 10;
const ARROW_HEAD_HALF_WIDTH = ARROW_HEAD_WIDTH / 2;
const GRAPH_NODE_SELECTOR = "g.node.record,g.node.ellipse";

type ZoomLevel = "ZoomIn" | "ZoomOut";

export interface ActionText {
  text: string | null;
  bb: DOMRect | null;
}

function asEllipse(ellipse: SVGEllipseElement): Ellipse {
  const selection = d3.select(ellipse);
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




/** A dictionary where uses zoom level as key 
 * and the raw <g> element that contains how the object should be rendered on screen as value */
type MinimizableObject = { [key in ZoomLevel]: SVGGElement | null };

export class DotGraphViz extends HTMLElement {
  json?: VizGraph;
  graph?: DiGraph;
  /** Root <svg> element */
  svg?: SVGSVGElement;
  /** The direct descendant <g> element of <svg> element, container of the whole graph*/
  svgg?: SVGGElement | null;

  initTransform?: string;
  zoomLevel: ZoomLevel = "ZoomIn"; // the graph always starts with most detailed zoom

  // here stores nodes and edges that should be rendered based on current zoom level
  minimizableObjects: {
    edges: { [key: string]: MinimizableObject },
    nodes: { [key: string]: MinimizableObject }
  } = {
      edges: {},
      nodes: {}
    }

  highlightConnections?: DiGraphConnections;

  constructor() {
    super();
  }

  connectedCallback() {
    instance().then(viz => {
      this.svg = viz.renderSVGElement(dotString);
      this.json = viz.renderJSON(dotString) as VizGraph;
      this.graph = new DiGraph(this.json, this.svg);
      // attach SVG to DOM
      this.append(this.svg);

      // extract and compute zoom level dependent shape for minimizable objects
      this.constructMinimizableObjects();

      this.svgg = d3.select(this.svg).selectChild<SVGGElement>("g").node();
      // get initial translation transform
      const translate = this.svgg?.transform.baseVal.getItem(2);
      if (!translate || translate.type !== SVGTransform.SVG_TRANSFORM_TRANSLATE) {
        throw Error("Second Initial Transform on graph is not Translation");
      }
      this.initTransform = `translate(${translate.matrix.e} ${translate.matrix.f})`;

      // create zoom behavior
      const zoomBehavior = d3.zoom<SVGSVGElement, unknown>().on("zoom", this.handleZoom)
      // register zoom behavior
      d3.select(this.svg).call(zoomBehavior);

      // register onclick highlight event
      d3.select(this.svgg).selectAll<SVGGElement, unknown>(GRAPH_NODE_SELECTOR).on("click", this.handleNodeClick)

      // register clear highlight event
      document.addEventListener("click", (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        // only clear when click on area that is not a node
        if (!target.closest(GRAPH_NODE_SELECTOR)) {
          this.clearHighlight();
          this.highlightConnections = undefined;
        }
      });
    });
  }

  constructMinimizableObjects = () => {
    if (!this.graph)
      return;

    // minimizable nodes
    for (const [nodeId, node] of Object.entries(this.graph.nodes)) {
      if (node.minimizable) {
        const nodeEl = d3.select<SVGGElement, unknown>("#" + node.elementId).node();
        if (nodeEl) {
          this.minimizableObjects.nodes[nodeId] = {
            "ZoomIn": null,
            "ZoomOut": null
          }
          this.minimizableObjects.nodes[nodeId]["ZoomIn"] = nodeEl;
          this.minimizableObjects.nodes[nodeId]["ZoomOut"] = this.minimizeNode(nodeEl);
        }
      }
    }

    // minimizable edges
    for (const [edgeId, edge] of Object.entries(this.graph.edges)) {
      if (edge.minimizable) {
        const edgeEl = d3.select<SVGGElement, unknown>("#" + edge.elementId).node();
        if (edgeEl) {
          this.minimizableObjects.edges[edgeId] = {
            "ZoomIn": null,
            "ZoomOut": null
          }
          this.minimizableObjects.edges[edgeId]["ZoomIn"] = edgeEl;
          // minimize edges requires information about the from- and to- node
          const minimizedFromNode = this.minimizableObjects.nodes[edge.from] ? this.minimizableObjects.nodes[edge.from]["ZoomOut"] : null;
          const minimizedToNode = this.minimizableObjects.nodes[edge.to] ? this.minimizableObjects.nodes[edge.to]["ZoomOut"] : null;
          this.minimizableObjects.edges[edgeId]["ZoomOut"] = this.minimizeEdge(
            edgeEl,
            minimizedFromNode,
            minimizedToNode,
          );
        }
      }
    }

  };

  minimizeNode = (g: SVGGElement): SVGGElement => {
    const center = calculateCentroid(g.getBBox());
    const actionText = getActionText(g);

    const minimized = d3.create<SVGGElement>("svg:g")
      .attr("id", g.getAttribute("id"))
      .attr("class", "node record mini")
      .on("click", this.handleNodeClick);

    minimized.append("title")
      .text(getTitleText(g));

    minimized.append("ellipse")
      .attr("cx", center.x)
      .attr("cy", center.y)
      .attr("rx", calculateEllipseRadii(actionText.bb?.width ?? 50, 15)) // 15 = margin x
      .attr("ry", calculateEllipseRadii(actionText.bb?.height ?? 50, 8)) // 8 = margin y
      .attr("stroke", "black")
      .attr("fill", getPolygonFillColor(g));

    minimized.append("text")
      .attr("x", center.x)
      .attr("y", center.y)
      .attr("text-anchor", "middle")
      .attr("alignment-baseline", "middle")
      .attr("font-family", "Helvetica,sans-Serif") // *WARNING, hard-coded, pls adapt it to record font family
      .attr("font-size", "8") // *WARNING, hard-coded, pls adapt it to record font size
      .text(actionText.text ?? "default");

    return minimized.node()!; // I just created it so its node() must be non-null
  };

  minimizeEdge = (g: SVGGElement, fromNode: SVGGElement | null, toNode: SVGGElement | null): SVGGElement => {
    const oldEdge = d3.select(g);
    const oldEdgePath = oldEdge.selectChild<SVGPathElement>("path");
    const oldEdgePolygon = oldEdge.selectChild<SVGPathElement>("polygon");
    const edgeStrokeWidth = oldEdgePolygon.attr("stroke-width") === null ? 1 : Number(oldEdgePolygon.attr("stroke-width"));
    const arrowHeadTipOffset = Math.sqrt(ARROW_HEAD_HALF_WIDTH * ARROW_HEAD_HALF_WIDTH + ARROW_HEAD_HEIGHT * ARROW_HEAD_HEIGHT) / ARROW_HEAD_HALF_WIDTH * (edgeStrokeWidth / 2);
    const arrowHeadRealHeight = ARROW_HEAD_HEIGHT + arrowHeadTipOffset + edgeStrokeWidth / 2;

    const minimized = d3.create<SVGGElement>("svg:g")
      .attr("id", oldEdge.attr("id"))
      .attr("class", "edge mini");

    minimized.append("title"); // need to be completed with same title as the old one

    let edgePath: string = oldEdgePath.attr("d");
    const oldCurve = getCubicBezierCurve(edgePath);
    const [oldTailGrad, oldHeadGrad] = getCubicBezierCurveGradients(oldCurve);

    let isTailReprojected = false;

    if (fromNode) {
      // the node where the edge starts from
      const fromEllipse = asEllipse(d3.select(fromNode)
        .select<SVGEllipseElement>("ellipse").node()!); // WARNING* ! used

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

    if (toNode) {
      // the node where the edge ends at
      const toEllipse = asEllipse(d3.select(toNode)
        .selectChild<SVGEllipseElement>("ellipse").node()!);

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
      minimized.append("path")
        .attr("d", `M${print2f(arrowHeadLeftPoint)}L${print2f(arrowHeadTipPoint)}L${print2f(arrowHeadRightPoint)}Z`)
        .attr("fill", oldEdgePolygon.attr("fill"))
        .attr("stroke", oldEdgePolygon.attr("stroke"))
        .attr("stroke-width", oldEdgePolygon.attr("stroke-width"))
        .attr("transform", `rotate(${rotation},${print2f(headItsPoint)})`);
    }
    else {
      // keep the old arrow head
      minimized.append("polygon")
        .attr("points", oldEdgePolygon.attr("points"))
        .attr("fill", oldEdgePolygon.attr("fill"))
        .attr("stroke", oldEdgePolygon.attr("stroke"))
        .attr("stroke-width", oldEdgePolygon.attr("stroke-width"));
    }

    minimized.append("path")
      .attr("d", edgePath)
      .attr("fill", oldEdgePath.attr("fill"))
      .attr("stroke", oldEdgePath.attr("stroke"))
      .attr("stroke-width", oldEdgePath.attr("stroke-width"))
      .attr("stroke-dasharray", oldEdgePath.attr("stroke-dasharray"));

    return minimized.node()!; // I just created it so its node() must be non-null
  }

  handleZoom = (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
    if (!this.svgg)
      return;

    // attach the zoom transform after the initial translation
    d3.select(this.svgg).attr("transform", event.transform.toString() + " " + this.initTransform);

    const zoomLevel = event.transform.k > ZOOM_LEVEL_THRESHOLD ? "ZoomIn" : "ZoomOut";

    // do nothing when zoom level didn't change
    if (zoomLevel === this.zoomLevel)
      return;

    // zoom level changed
    const prevZoomLevel = this.zoomLevel;
    this.zoomLevel = zoomLevel;

    for (const [_, edge] of Object.entries(this.minimizableObjects.edges)) {
      // remove minimizable objects rendered as the previous zoom level

      if (prevZoomLevel) {
        d3.select(edge[prevZoomLevel]).remove();
      }
      // add minimizable objects for the current zoom level
      if (edge[zoomLevel]) {
        this.svgg.appendChild(edge[zoomLevel]);
      }
    }

    for (const [_, node] of Object.entries(this.minimizableObjects.nodes)) {
      // remove minimizable objects rendered as the previous zoom level

      if (prevZoomLevel) {
        d3.select(node[prevZoomLevel]).remove();
      }
      // add minimizable objects for the current zoom level
      if (node[zoomLevel]) {
        this.svgg.appendChild(node[zoomLevel]);
      }
    }

    // keep highlight state
    this.highlight();
  };

  handleNodeClick = (event: MouseEvent) => {
    if (!this.graph)
      return;

    const nodeElementId = d3.select(event.currentTarget as HTMLElement).attr("id");
    this.highlightConnections = this.graph.getConnections(this.graph.reverseLookup.nodes[nodeElementId]);

    this.highlight();
  };

  handleAbbrevationTextClick = (event: MouseEvent) => {
    // this doesn't work here, use event.target/event.currentTarget
    // this.highlightConnections.nodes = this.graph.getAbbrevationNodes()
    // this.highlightConnections.edges = {};
    // this.highlight();
  }

  highlight = () => {
    if (!this.graph || !this.svgg || !this.highlightConnections)
      return;
    // clear highlight
    this.clearHighlight();

    // add new highlight
    d3.select(this.svgg).classed("highlighted", true);

    for (const nodeId of this.highlightConnections.nodes) {
      d3.select("#" + this.graph.nodes[nodeId].elementId)
        .classed("active", true);
    }

    for (const edgeId of this.highlightConnections.edges) {
      d3.select("#" + this.graph.edges[edgeId].elementId)
        .classed("active", true);
    }
  }

  clearHighlight = () => {
    if (!this.svgg)
      return;

    const g = d3.select(this.svgg).classed("highlighted", false);

    g.selectChildren(GRAPH_NODE_SELECTOR)
      .classed("active", false);

    g.selectChildren("g.edge")
      .classed("active", false);
  }
}

customElements.define("dot-graph-viz", DotGraphViz);