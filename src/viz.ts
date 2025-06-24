export interface VizEdge {
    _gvid: number,
    tail: number,
    tailport?: string,
    head: number,
    headport?: string,
    style?: VizEdgeStyle
}

export interface VizObject {
    _gvid: number,
    name: string,
    shape: VizNodeShape,
}

export interface VizGraph {
    edges: VizEdge[]
    objects: VizObject[]
}

export type VizEdgeStyle = "invis" | "bold"
export type VizNodeShape = "plain" | "ellipse" | "record"