import dotString from "./example.dot?raw";
import { instance } from "@viz-js/viz";
import * as d3 from "d3";

const ZOOM_LEVEL_THRESHOLD = 0.8;
type ZoomLevel = "ZoomIn" | "ZoomOut";

// scale = 1 > 0.8 => ZoomIn
let lastZoomLevel: ZoomLevel = "ZoomIn";

instance().then(viz => {
  document.getElementById("app")?.appendChild(
    viz.renderSVGElement(dotString));

  const initialTranslationMatrix = d3.select<SVGGElement, unknown>("g")
    .node()?.transform.baseVal
    .getItem(2).matrix;

  d3.select<SVGSVGElement, unknown>("svg").call(d3.zoom<SVGSVGElement, unknown>()
    .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
      // attach the zoom transform after the initial translation
      d3.select("#graph0").attr("transform", event.transform.toString() + ` translate(${initialTranslationMatrix?.e} ${initialTranslationMatrix?.f})`);

      // determine whether zoom level has changed
      const scale = event.transform.k;
      const currentZoomLevel = scale > ZOOM_LEVEL_THRESHOLD ? "ZoomIn" : "ZoomOut";
      if (currentZoomLevel !== lastZoomLevel) {
        lastZoomLevel = currentZoomLevel;

        // handle zoom level change
        if (currentZoomLevel === "ZoomIn") {
          d3.selectAll("ellipse").attr("stroke", "black");
        } else {
          d3.selectAll("ellipse").attr("stroke", "red");
        }
      }
    }));
});