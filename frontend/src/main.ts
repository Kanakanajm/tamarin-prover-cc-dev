import { instance } from "@viz-js/viz";
import { select, selectAll, zoom, create, D3ZoomEvent } from "d3";
import { extendCurvePath, getCubicBezierCurve, getCubicBezierCurveGradients } from "./path";
import { calculateCentroid, cross, direction, dot, Ellipse, intersect, inv, print2f, project, Ray, sub, traverse, Vec2 } from "./math";
import { VizGraph } from "./viz";
import { DiGraph, DiGraphConnections } from "./digraph";
import './style.css';
import { BroadcastMessage } from "./message";
import { JsonDiGraph } from "./digraph";
import exampleJson from "./example.json";
import { prettyPrintTerm } from "./jsongraph";

const ZOOM_LEVEL_THRESHOLD = 0.99;
const ARROW_HEAD_WIDTH = 7;
const ARROW_HEAD_HEIGHT = 10;
const ARROW_HEAD_HALF_WIDTH = ARROW_HEAD_WIDTH / 2;
const ABBREVIATION_TABLE_SCALE = 1.5;
const MAX_FONT = 30;

const LS_ISPOPUPOPEN = "popup_open";

const FETCH_CANCELED = "Fetch Canceled";

type ZoomLevel = "ZoomIn" | "ZoomOut";



export interface ActionText {
  text: string | null;
  bb: DOMRect | null;
  fontSize: string | null;
  fontFamily: string | null;
}

function asEllipse(ellipse: SVGEllipseElement): Ellipse {
  const selection = select(ellipse);
  return {
    c: {
      x: Number(selection.attr("cx")),
      y: Number(selection.attr("cy"))
    },
    rx: Number(selection.attr("rx")),
    ry: Number(selection.attr("ry"))
  }
}

function getActionText(g: SVGGElement): ActionText {
  const actionTextSelection = select<SVGGElement, unknown>(g)
    .selectChildren<SVGTextElement, unknown>("text")
    .filter(function (this) {
      return this.textContent?.startsWith("#") ?? false
    });

  if (actionTextSelection.size() !== 1)
    return {
      text: null,
      bb: null,
      fontSize: null,
      fontFamily: null
    };

  return {
    text: actionTextSelection.nodes()[0].textContent,
    bb: actionTextSelection.nodes()[0].getBBox(),
    fontSize: actionTextSelection.nodes()[0].getAttribute("font-size"),
    fontFamily: actionTextSelection.nodes()[0].getAttribute("font-family"),
  }
}

function getTitleText(g: SVGGElement): string {
  return select<SVGGElement, unknown>(g).selectChild<SVGTitleElement>("title").text();
}

function constructGraphOnlyUrl(url: string): string {
  return url + (url.includes('?') ? '&' : '?') + 'graph_only';
}

function getSimplificationFromCookie(): number {
  const k = "simplification=";
  const s = document.cookie.indexOf(k);
  // assume simpification level values from 0 to 9 (one digit)
  return s === -1 ? -1 : Number(document.cookie.charAt(s + k.length));
}

function constructDotSrcParamsFromCookie(): string {
  const param = new URLSearchParams();
  if (document.cookie.indexOf("abbreviate=") === -1) {
    param.append("unabbreviate", "");
  }
  if (document.cookie.indexOf("auto-sources=") === -1) {
    param.append("no-auto-sources", "");
  }
  const smpl = getSimplificationFromCookie();

  if (smpl !== -1) {
    if (smpl === 0) {
      param.append("uncompact", "");
      param.append("uncompress", "");
    }
    param.append("simplification", smpl.toString());
  }

  return param.toString();
}



/** A dictionary where uses zoom level as key 
 * and the raw <g> element that contains how the object should be rendered on screen as value */
type MinimizableObject = { [key in ZoomLevel]: SVGGElement | null };

export class DotGraphViz extends HTMLElement {
  static observedAttributes = ['dotsrc', 'popup', 'canpop',];

  isPopup: boolean = false;
  canPopup: boolean = false;

  isPopupOpen = () => localStorage.getItem(LS_ISPOPUPOPEN) === 'true';

  /** The broadcast channel which the component subscribed on  */
  channel: BroadcastChannel;

  /** The source URL of the dot graph definition 
   * 
   * Passed in as attribute `dotsrc`  which can be either:
   * - A path to the dot file in the public folder during development
   * - A location that serves the dot file during production */
  dotSrc?: string | null;

  jsonSrc?: string | null;

  json?: VizGraph;
  graph?: DiGraph;
  jsonGraph?: JsonDiGraph;
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

  highlightConnections: DiGraphConnections | null = {
    nodes: [],
    edges: []
  }

  /** Cancel previous fetch event
   * 
   * In case other fetch events are spawned by other renderSource(), 
   * to make sure that renders are also done in the order that they are called (although they are asynchronous),
   * we expose cancelFetch() to enable newer renderSource() to cancel the older ones before they are finished.
   */
  cancelFetch: () => void = () => { };

  constructor() {
    super();
    this.channel = new BroadcastChannel("dot-graph-viz-popup");
  }

  postMessage = (msg: BroadcastMessage) => this.channel.postMessage(msg);

  // attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
  // if (name === "dotsrc" && newValue !== oldValue) {
  //   this.dotSrc = newValue;
  //   console.debug(`Dot src changed from ${oldValue} to ${newValue}`);
  //   this.renderSource();
  //   // Notice the popup window that dotsrc has changed
  //   this.postMessage({ type: "response-dotsrc", payload: this.dotSrc });
  // }
  // }

  connectedCallback() {
    this.dotSrc = this.getAttribute("dotsrc");

    if (this.dotSrc?.includes('interactive-graph')) // ***WARNING*** backend api's url changed after feature-interactive-graph PR
    {
      this.jsonSrc = this.dotSrc.replace('interactive-graph', 'json');
    }


    this.dotSrc = this.dotSrc?.split("?").shift(); // element before ?
    this.dotSrc = this.dotSrc?.concat("?").concat(constructDotSrcParamsFromCookie());

    this.jsonSrc = this.jsonSrc?.split("?").shift(); // element before ?
    this.jsonSrc = this.jsonSrc?.concat("?").concat(constructDotSrcParamsFromCookie());


    this.isPopup = this.getAttribute("popup") === "true";
    this.canPopup = !this.isPopup && this.getAttribute("canpop") === "true";

    this.setupMessageHandler();

    // notify opened popup if dotsrc changed due to reload
    if (!this.isPopup && this.isPopupOpen()) {
      this.postMessage({ type: "host-dotsrc-changed", payload: this.dotSrc })
    }

    this.renderSource();
  }

  setupMessageHandler = () => {
    // if component is used in a normal page (theory overview)
    if (!this.isPopup) {
      this.channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
        switch (event.data.type) {
          case "popup-closed":
            // When popup is closed, refresh page.
            window.location.reload();
            break;
        }
      };
    }
    else {
      // If component is a popup, add popup css class.
      this.classList.add("popup");


      window.addEventListener("beforeunload", () => {
        // Notice host when a popup window is closed.
        localStorage.setItem('popup_open', 'false');
        this.postMessage({ type: "popup-closed" });
      });


      this.channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
        switch (event.data.type) {
          case "close-popup":
            window.close();
            break;
          case "host-dotsrc-changed":
            console.debug("Host sent a new dot src: " + event.data.payload)
            if (this.dotSrc !== event.data.payload) {
              this.dotSrc = event.data.payload;
              this.renderSource();
            }
            break;
        }
      };

    }
  }

  renderSource = async () => {
    if (import.meta.env.DEV) {
      // use example.json for development mode
      this.renderJson(exampleJson);
      return;
    }
    if (!this.dotSrc || !this.dotSrc.trim().length) {
      console.error("No dot graph source url provided.");
      return;
    }
    if (!this.jsonSrc || !this.jsonSrc.trim().length) {
      console.error("No json graph source url provided.");
      return;
    }
    // Cancel previous fetch event.
    this.cancelFetch();
    this.fetchJsonString(this.jsonSrc)
          .then((d) => {
            console.log("fetched json string");
            this.renderJson(d);
          }).catch(err => {
            if (err === FETCH_CANCELED) {
              // Output as trace only when fetch is rejected due to canceling.
              console.debug(FETCH_CANCELED);
            } else {
              // Other rejects.
              console.error(err);
            }
          });
    this.fetchDotString(this.dotSrc)
      .then((d) => {
        this.render(d);
      }).catch(err => {
        if (err === FETCH_CANCELED) {
          // Output as trace only when fetch is rejected due to canceling.
          console.debug(FETCH_CANCELED);
        } else {
          // Other rejects.
          console.error(err);
        }
      });
    
    try {
      // Fetch and render JSON first
      const jsonData = await this.fetchJsonString(this.jsonSrc);
      console.log("fetched json string");
      this.renderJson(jsonData);


    // Now fetch and render DOT
    // const dotData = await this.fetchDotString(this.dotSrc);
    // this.render(dotData);

    } catch (err) {
      if (err === FETCH_CANCELED) {
        console.debug(FETCH_CANCELED);
      } else {
        console.error(err);
      }
    }


  }

  // Render the graph using JSON string
  renderJson = (jsonString: any) => {
    console.debug("Received Json string");
    this.jsonGraph = new JsonDiGraph(jsonString);
    console.debug("jsonGraph: ", this.jsonGraph);
    const dot = this.jsonGraph.buildDotString();
    this.render(dot)
  }

  /**
   * Render legend box as a table on right bottom corner
   * @remark
   * If user click on the table row, it will highlight the clicked row and unhighlight the others.
   * 
   * Clicking on the other place of the document will unhighlight all row.
   * 
   * @todo
   * Highlight actual graph nodes need to be done.
   */
  renderLegend = () => {
    const abbrevs = this.jsonGraph?.jsonString.graphs[0].jgAbbrevs;
    if (abbrevs) {
      const lcontainer = document.createElement("div");
      lcontainer.setAttribute("class", "lgd-container");
      const ltable = document.createElement("table");
      lcontainer.appendChild(ltable);

      // clear all selection lambda
      const clearSelection = () => {
        for (const r of ltable.children) {
          r.setAttribute("class", "lgd-item");
        }
      }
      for (const abbrev of abbrevs) {
        const legend = document.createElement("tr");
        legend.setAttribute("class", "lgd-item");

        // toggle highlight when user click on legend row
        legend.addEventListener("click", function () {
          if (this.classList.contains("active")) {
            this.setAttribute("class", "lgd-item");
          }
          else {
            clearSelection();
            this.setAttribute("class", "lgd-item active");
          }
        });

        // the three columns of the legend row
        // the abbreviation
        const legendAbbrev = document.createElement("td");
        legendAbbrev.textContent = prettyPrintTerm(abbrev.jgaAbbrev);
        legend.appendChild(legendAbbrev);

        // the equal sign
        const legendEq = document.createElement("td");
        legendEq.textContent = "=";
        legend.appendChild(legendEq);

        // the expansion of the abbreviation
        const legendExpand = document.createElement("td");
        legendExpand.textContent = prettyPrintTerm(abbrev.jgaExpansion);
        legend.appendChild(legendExpand);

        ltable.appendChild(legend);
      }
      this.appendChild(lcontainer);
      document.addEventListener("click", function(ev) {
        if (ev.target instanceof Element && ev.target.tagName !== "TD" && ev.target.tagName !== "TR") {
          // clear legend highlight when clicking on other places on the document than <td> or <tr>
          clearSelection();
        }
      })
    }
  }

  render = (dotString: string) => {
    instance().then(viz => {
      /* Resetting all the components */
      this.innerHTML = "";
      this.svg = undefined;
      this.svgg = null;
      this.highlightConnections = { nodes: [], edges: [] };
      this.minimizableObjects = {
        edges: {},
        nodes: {}
      };

      if (!this.isPopup && this.isPopupOpen()) {
        const closePopupBtn = document.createElement("button");
        closePopupBtn.textContent = "Pop-in";
        closePopupBtn.id = "close-popup-btn";
        closePopupBtn.addEventListener("click", () => {
          this.channel.postMessage({ type: "close-popup" });
        });
        this.appendChild(closePopupBtn);
        return;
      }

      this.svg = viz.renderSVGElement(dotString);
      this.json = viz.renderJSON(dotString) as VizGraph;
      this.graph = new DiGraph(this.json, this.svg);

      // debug infos
      // console.debug("Received dot string:");
      console.debug('dot in dotrender: '+ dotString);
      // console.debug(this.svg);
      // console.debug(this.json);
      // console.debug(this.graph);

      // attach SVG to DOM
      this.append(this.svg);

      // console.log(this.canPopup);

      if (this.canPopup) {
        // Show pop-out (open popup) button.
        const popupBtn = document.createElement("button");
        popupBtn.textContent = "Pop-out";
        popupBtn.id = "popup-btn";
        popupBtn.addEventListener("click", this.handlePopupClick);
        this.appendChild(popupBtn);
      }

      // Allow selecting/copying text elements with the mouse 
      selectAll("text")
        .style("cursor", "text")
        .on("mousedown", function (event) {
          event.stopPropagation();
        })

      this.svgg = select(this.svg).selectChild<SVGGElement>("g").node();

      // extract and compute zoom level dependent shape for minimizable objects
      this.constructMinimizableObjects();

      // get initial translation transform
      const translate = this.svgg?.transform.baseVal.getItem(2);
      if (!translate || translate.type !== SVGTransform.SVG_TRANSFORM_TRANSLATE) {
        throw Error("Second Initial Transform on graph is not Translation");
      }
      this.initTransform = `translate(${translate.matrix.e} ${translate.matrix.f})`;

      // create zoom behavior
      const zoomBehavior = zoom<SVGSVGElement, unknown>().scaleExtent([0.5, 3]).on("zoom", this.handleZoom)
      // register zoom behavior
      select(this.svg).call(zoomBehavior);

      // register onclick highlight event
      for (const node of Object.values(this.graph.nodes)) {
        select(this.svgg).selectChild("#" + node.elementId)
          .classed("clickable", true).on("click", this.handleNodeClick)
      }

      // register clear highlight event
      document.addEventListener("click", (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        // only clear when click on area that is not a node
        if (!target.closest(this.getNodeSelector()) && !target.closest("text.abbrev")) {
          this.clearHighlight();
          this.highlightConnections = null;
          window.getSelection()?.removeAllRanges();
        }
      });

      // add abbreviation text click handler
      if (this.graph.abbrev.elementId) {
        const abbrevs = Object.keys(this.graph.abbrev.abbreviations);
        const abbrevTbl = select(this.svgg)
          .selectChild<SVGGElement>("#" + this.graph.abbrev.elementId)
          .classed("abbrev-table", true);

        abbrevTbl
          .selectChildren<SVGTextElement, unknown>("text")
          .filter(function () {
            return abbrevs.includes(this.textContent || "");
          })
          .classed("abbrev", true)
          .on("click", this.handleAbbreviationTextClick);

        const abbrevTblEl = abbrevTbl.node()!;
        const abbrevTblElBBox = abbrevTblEl.getBBox();
        const graphBBox = this.svgg!.getBBox();
        const marginX = 10;
        const marginY = 10;
        const dx = graphBBox.x + graphBBox.width - abbrevTblElBBox.width - abbrevTblElBBox.x - marginX;
        const dy = graphBBox.y + graphBBox.height - abbrevTblElBBox.height - abbrevTblElBBox.y - marginY;

        const abbrevTblBottomRightPoint: Vec2 = {
          x: abbrevTblElBBox.width + abbrevTblElBBox.x,
          y: abbrevTblElBBox.height + abbrevTblElBBox.y
        }

        // inserting a rectangle box before the text 
        abbrevTbl.insert("rect", "text")
          .attr("width", abbrevTblElBBox.width)
          .attr("height", abbrevTblElBBox.height)
          .attr("x", abbrevTblElBBox.x)
          .attr("y", abbrevTblElBBox.y)
          .attr("fill", "white");
        abbrevTbl
          .attr("transform", `${this.initTransform} translate(${dx} ${dy}) translate(${abbrevTblBottomRightPoint.x} ${abbrevTblBottomRightPoint.y}) scale(${ABBREVIATION_TABLE_SCALE}) translate(${-abbrevTblBottomRightPoint.x} ${-abbrevTblBottomRightPoint.y})`);

        this.svg.appendChild(abbrevTblEl);
      }

      this.renderLegend();
    });
  }

  handlePopupOpenContentChange = () => {
    this.innerHTML = "";

    // close popup button
    const closePopupBtn = document.createElement("button");
    closePopupBtn.textContent = "Pop-in";
    closePopupBtn.id = "close-popup-btn";
    closePopupBtn.addEventListener("click", () => {
      this.channel.postMessage({ type: "close-popup" });
    });
    this.appendChild(closePopupBtn);
  }

  handlePopupClick = () => {
    const popup = window.open(constructGraphOnlyUrl(window.location.href), undefined, "popup=true");
    if (popup) {
      // after popup open successfully,
      // remove all children (the whole graph)
      localStorage.setItem(LS_ISPOPUPOPEN, "true");
      this.renderSource();

    } else {
      console.error("Failed to open popup!");
    }
  }

  /*
    Fetchs the dot graph string  
  */
  fetchDotString = (url: string): Promise<string> => {
    const { promise, resolve, reject } = Promise.withResolvers<string>();

    this.cancelFetch = () => {
      reject(FETCH_CANCELED);
    }

    fetch(url).then((res) => {
      if (!res.ok) {
        reject("Failed to fetch dot graph definition.");
        return;
      }

      res.text().then((txt) => {
        if (!txt.includes("digraph")) {
          reject("Invalid dot graph string");
          return;
        }
        resolve(txt);
      }).catch(err => reject(err))
    }).catch(err => reject(err));

    return promise;
  };
  fetchJsonString = (url: string): Promise<any> => {
    const { promise, resolve, reject } = Promise.withResolvers<any>();

    this.cancelFetch = () => {
      reject(FETCH_CANCELED);
    }
    fetch(url).then((res) => {
      if (!res.ok) {
        reject("Failed to fetch json graph definition.");
        return;
      }
      return res.json();
    })
      .then((json) => {
        resolve(json);
      })
      .catch(err => reject(err));
    return promise;
  }

  constructMinimizableObjects = () => {
    if (!this.graph || !this.svgg)
      return;

    // minimizable nodes
    for (const [nodeId, node] of Object.entries(this.graph.nodes)) {
      if (node.minimizable) {
        const nodeEl = select(this.svgg).selectChild<SVGGElement>("#" + node.elementId).node();
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
  };

  minimizeNode = (g: SVGGElement): SVGGElement => {
    const center = calculateCentroid(g.getBBox());
    const actionText = getActionText(g);

    const minimized = create<SVGGElement>("svg:g")
      .attr("id", g.getAttribute("id"))
      .attr("class", "node clickable mini")
      .on("click", this.handleNodeClick);

    minimized.append("title")
      .text(getTitleText(g));

    const polygon = select(g).selectChild<SVGPolygonElement>("polygon");
    const polygonBBox = polygon.node()!.getBBox();

    minimized.append("polygon")
      .attr("points", polygon.attr("points"))
      .attr("fill", polygon.attr("fill"))
      .attr("stroke", polygon.attr("stroke"));

    // Shorten action text
    const actualText = actionText.text ?
      actionText.text.indexOf("[") >= 0 ?
        actionText.text.slice(0, actionText.text.indexOf("[")) + ""
        : actionText.text
      : "default";

    minimized.append("text")
      .attr("x", center.x)
      .attr("y", center.y)
      .attr("text-anchor", "middle")
      .attr("alignment-baseline", "middle")
      .attr("font-family", actionText.fontFamily) // *WARNING, hard-coded, pls adapt it to record font family
      .attr("font-size", `${Math.min(MAX_FONT, Math.min(polygonBBox.width / actualText.length / 0.54, polygonBBox.height * 0.8)).toFixed(0)}px`)
      .text(actualText);

    return minimized.node()!; // I just created it so its node() must be non-null
  };

  minimizeEdge = (g: SVGGElement, fromNode: SVGGElement | null, toNode: SVGGElement | null): SVGGElement => {
    const oldEdge = select(g);
    const oldEdgePath = oldEdge.selectChild<SVGPathElement>("path");
    const oldEdgePolygon = oldEdge.selectChild<SVGPathElement>("polygon");
    const edgeStrokeWidth = oldEdgePolygon.attr("stroke-width") === null ? 1 : Number(oldEdgePolygon.attr("stroke-width"));
    const arrowHeadTipOffset = Math.sqrt(ARROW_HEAD_HALF_WIDTH * ARROW_HEAD_HALF_WIDTH + ARROW_HEAD_HEIGHT * ARROW_HEAD_HEIGHT) / ARROW_HEAD_HALF_WIDTH * (edgeStrokeWidth / 2);
    const arrowHeadRealHeight = ARROW_HEAD_HEIGHT + arrowHeadTipOffset + edgeStrokeWidth / 2;

    const minimized = create<SVGGElement>("svg:g")
      .attr("id", oldEdge.attr("id"))
      .attr("class", "edge mini");

    minimized.append("title"); // need to be completed with same title as the old one

    let edgePath: string = oldEdgePath.attr("d");
    const oldCurve = getCubicBezierCurve(edgePath);
    const [oldTailGrad, oldHeadGrad] = getCubicBezierCurveGradients(oldCurve);

    // let isTailReprojected = false;

    if (fromNode) {
      // the node where the edge starts from
      const fromEllipse = asEllipse(select(fromNode)
        .selectChild<SVGEllipseElement>("ellipse").node()!); // WARNING* ! used

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
        // isTailReprojected = true;
        const tailProj = project(oldCurve.start, fromEllipse);
        edgePath = extendCurvePath(edgePath, tailProj);
      }
    }

    if (toNode) {
      // the node where the edge ends at
      const toEllipse = asEllipse(select(toNode)
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
        // from the projection point to the old curve end
        const projHeadRay: Ray = {
          o: headProj,
          d: direction(headProj, oldCurve.end)
        }
        headDirection = projHeadRay.d;
        edgePath = extendCurvePath(edgePath, undefined, traverse(projHeadRay, arrowHeadRealHeight));

        // if (isTailReprojected) {
        //   throw new Error("Not implemented yet")
        // } else {
        // const projHeadRay: Ray = {
        //   o: headProj,
        //   d: direction(headProj, oldCurve.start)
        // }
        //   edgePath = `M${print2f(oldCurve.start)}L${print2f(traverse(projHeadRay, arrowHeadRealHeight))}`;
        //   headDirection = projHeadRay.d;
        // }

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

  /*
    Responsible for handling zoom events for the graph
  */
  handleZoom = (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
    if (!this.svgg)
      return;

    // attach the zoom transform after the initial translation
    select(this.svgg).attr("transform", event.transform.toString() + " " + this.initTransform);

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
        select(edge[prevZoomLevel]).remove();
      }
      // add minimizable objects for the current zoom level
      if (edge[zoomLevel]) {
        this.svgg.appendChild(edge[zoomLevel]);
      }
    }

    for (const [_, node] of Object.entries(this.minimizableObjects.nodes)) {
      // remove minimizable objects rendered as the previous zoom level

      if (prevZoomLevel) {
        select(node[prevZoomLevel]).remove();
      }
      // add minimizable objects for the current zoom level
      if (node[zoomLevel]) {
        this.svgg.appendChild(node[zoomLevel]);
      }
    }

    // keep highlight state
    this.highlight();
  };

  /*
    When a node is clicked, all the downward connections (including the edges) of the node are highlighted.
  */
  handleNodeClick = (event: MouseEvent) => {
    if (!this.graph)
      return;

    const nodeElementId = select(event.currentTarget as HTMLElement).attr("id");
    this.highlightConnections = this.graph.getConnections(this.graph.reverseLookup.nodes[nodeElementId]);

    this.highlight();
  };

  /*
    When an abbreviation is clicked in the table, all graph nodes containing that abbreviation are highlighted. 
  */
  handleAbbreviationTextClick = (event: MouseEvent) => {
    if (!this.graph)
      return;
    const el = event.target as HTMLElement;
    const abbrev = el.textContent ?? "";
    console.debug(
      "this.graph.abbrev: " + this.graph.abbrev +
      "\nthis.graph.abbrev.abbreviations[abbrev]: " + this.graph.abbrev.abbreviations[abbrev] +
      "\nthis.graph.abbrev.abbreviations: " + this.graph.abbrev.abbreviations +
      "\ntabbrev: " + abbrev
    )
    this.highlightConnections = {
      nodes: this.graph.abbrev.abbreviations[abbrev],
      edges: []
    };

    this.highlight();
  }

  highlight = () => {
    if (!this.graph || !this.svgg || !this.highlightConnections || (this.highlightConnections.nodes.length === 0 && this.highlightConnections.edges.length === 0))
      return;

    // clear highlight
    this.clearHighlight();

    // add new highlight
    select(this.svgg).classed("highlighted", true);

    for (const nodeId of this.highlightConnections.nodes) {
      select(this.svgg).selectChild("#" + this.graph.nodes[nodeId].elementId)
        .classed("active", true);
    }

    for (const edgeId of this.highlightConnections.edges) {
      select(this.svgg).selectChild("#" + this.graph.edges[edgeId].elementId)
        .classed("active", true);
    }
  }

  /*
    Clear the highlighted edges and nodes of the graph
  */
  clearHighlight = () => {
    if (!this.svgg)
      return;

    const g = select(this.svgg).classed("highlighted", false);

    g.selectChildren("g.active")
      .classed("active", false);
  };

  getNodeSelector = () => {
    return Object.values(this.graph?.nodes ?? {}).map(n => "#" + n.elementId).join(",");
  }
}

customElements.define("dot-graph-viz", DotGraphViz);