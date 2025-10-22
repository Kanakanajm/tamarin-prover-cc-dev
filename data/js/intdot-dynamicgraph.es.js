var p = Object.defineProperty;
var d = (s, e, t) => e in s ? p(s, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : s[e] = t;
var r = (s, e, t) => d(s, typeof e != "symbol" ? e + "" : e, t);
const i = "DYN_GRP_HASPOPPED";
class a extends HTMLElement {
  constructor() {
    super();
    r(this, "popoutWindow");
    r(this, "detectPopoutClosedInterval");
  }
  isPopoutWindowClosed() {
    return !this.popoutWindow || this.popoutWindow.closed;
  }
  render() {
    this.innerHTML = "", this.detectPopoutClosedInterval !== void 0 && clearInterval(this.detectPopoutClosedInterval);
    const t = this.getAttribute("graphSrc");
    if (!t) {
      console.error("[DynamicGraphWrapper]: Empty dotsrc");
      return;
    }
    if (sessionStorage.getItem(i) === "true") {
      this.popoutWindow = window.open(t, "dynamicGraphPopout", "popup");
      const o = document.createElement("button");
      o.innerText = "Pop In", o.addEventListener("click", (n) => {
        this.isPopoutWindowClosed() || (this.popoutWindow.close(), sessionStorage.setItem(i, "false")), this.render();
      }), this.append(o), this.detectPopoutClosedInterval = setInterval(() => {
        this.isPopoutWindowClosed() && (sessionStorage.setItem(i, "false"), this.render());
      }, 1e3);
    } else {
      const o = document.createElement("iframe");
      o.setAttribute("src", t), o.setAttribute("width", "100%"), o.setAttribute("height", "400"), this.append(o);
      const n = document.createElement("button");
      n.innerText = "Pop Out", n.addEventListener("click", (u) => {
        this.popoutWindow = window.open(t, "dynamicGraphPopout", "popup"), this.popoutWindow && !this.popoutWindow.closed && (sessionStorage.setItem(i, "true"), this.render());
      }), this.append(n);
    }
  }
  connectedCallback() {
    this.render();
  }
}
customElements.define("dynamic-graph", a);
export {
  a as DynamicGraphWrapper
};
