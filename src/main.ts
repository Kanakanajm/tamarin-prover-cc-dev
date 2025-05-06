import dotString from "./example.dot?raw";
import { instance } from "@viz-js/viz";
import * as d3 from "d3";
instance().then(viz => {
  document.getElementById("app")?.appendChild(viz.renderSVGElement(dotString));
  const initialTranslationMatrix = d3.select<SVGGElement, unknown>("g").node()?.transform.baseVal.getItem(2).matrix;

  d3.select<SVGSVGElement, unknown>("svg").call(d3.zoom<SVGSVGElement, unknown>()
    .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
      d3.select("#graph0").attr("transform", event.transform.toString() + ` translate(${initialTranslationMatrix?.e} ${initialTranslationMatrix?.f})`);
    }));
});