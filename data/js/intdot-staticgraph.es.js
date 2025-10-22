class a extends HTMLElement {
  constructor() {
    super();
  }
  connectedCallback() {
    const r = this.getAttribute("graphSrc");
    if (!r) {
      console.error("[StaticGraphWrapper]: Empty dotsrc");
      return;
    }
    const t = document.createElement("iframe");
    t.setAttribute("src", r), t.setAttribute("width", "100%"), t.setAttribute("height", "400");
    const e = document.createElement("a");
    e.setAttribute("href", r), e.setAttribute("target", "_blank"), e.innerText = "Open Graph in New Tab", this.append(t), this.append(e);
  }
}
customElements.define("static-graph", a);
export {
  a as StaticGraphWrapper
};
