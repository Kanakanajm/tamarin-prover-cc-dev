import { 
    Graph as DotGraph, 
    Node as DotNode, 
    Edge as DotEdge, 
    Attributes 
} from "@viz-js/viz"

import { 
    depth,
    JSONGraph,
    JsonGraphAbbrev,
    JSONGraphEdge,
    JSONGraphNode, 
    JSONGraphNodeFact, 
    prettyPrintFact, 
    replace
} from "./jsongraph";
import { DotNodeLabelCell, DotNodeLabelContainer } from "./vizhtml";

interface NodeLocation {
    name: string;
    port?: string;
}

export class TamarinGraphBuildContext {
    nodeCount: number;
    edgeCount: number;
    portCount: number;

    nodeLocationMap: Record<string, NodeLocation> // json id -> node name;

    abbreviations: JsonGraphAbbrev[];

    abbrevMap: Record<number, Set<string>>; // abbreviation index -> list of node name

    constructor(abbv: JsonGraphAbbrev[]) {
        this.nodeCount = 0;
        this.edgeCount = 0;
        this.portCount = 0;
        this.nodeLocationMap = {};
        this.abbreviations = abbv;
        this.abbrevMap = {};
    }

    newNodeId() {
        return this.nodeCount++;
    }

    newEdgeId() {
        return this.edgeCount++;
    }

    newPortId() {
        return this.portCount++;
    }

    currentNodeCount() {
        return this.nodeCount;
    }

    currentEdgeCount() {
        return this.edgeCount;
    }

    currentPortcount() {
        return this.portCount;
    }

    recordNode(jgnId: string, loc: NodeLocation) {
        this.nodeLocationMap[jgnId] = loc;
    }

    nodeLocation(jgnId: string) {
        const n = this.nodeLocationMap[jgnId];
        if (!n) {
            console.warn(jgnId, " not found");
        }
        return n;
    }

    recordAbbrev(abbrevIdx: number, nodeName: string) {
        if (this.abbrevMap[abbrevIdx] === undefined) {
            this.abbrevMap[abbrevIdx] = new Set<string>();
        }
        this.abbrevMap[abbrevIdx].add(nodeName);
    }
}

// export type TamarinGraphSimplificationLevel = 0 | 1 | 2 | 3 ;

function abbreviate(
    nodeName: string, 
    fact: JSONGraphNodeFact, 
    ctx: TamarinGraphBuildContext): JSONGraphNodeFact {
    // TODO(J): fact is being mutated here, do we still need return?
    fact.jgnFactTerms = fact.jgnFactTerms.map(t => {
        // desc order
        for (const [index, abbrev] of ctx.abbreviations.sort((a, b) => depth(b.jgaTerm) - depth(a.jgaTerm)).entries()) {
            const result = replace(t, abbrev.jgaTerm, abbrev.jgaAbbrev);
            if (result.replaced) {
                ctx.recordAbbrev(index, nodeName);
                t = result.term;
            }
        }
        return t;
    });
    return fact;
}
export abstract class TamarinGraphEdge {
    jgEdge: JSONGraphEdge;
    ctx: TamarinGraphBuildContext;
    // edgeId: number;
    // edgeName = () => `edge${this.edgeId}`;
    constructor(jgEdge: JSONGraphEdge, ctx: TamarinGraphBuildContext) {
        this.jgEdge = jgEdge;
        this.ctx = ctx;
        // this.edgeId = ctx.newEdgeId();
    }
    abstract egdeAttributes(): Attributes;
    
    //  const tailLoc = this.ctx.nodeLocation(e.jgeSource);
    //         const headLoc = this.ctx.nodeLocation(e.jgeTarget);

    //         let dotEdgeAttr: Attributes = {};
    //         if (tailLoc.port) 
    //             dotEdgeAttr["tailport"] = tailLoc.port;
    //         if (headLoc.port)
    //             dotEdgeAttr["headport"] = headLoc.port;

    //         let dotEdge: DotEdge = {
    //             tail: tailLoc.name,
    //             head: headLoc.name,
    //             attributes: dotEdgeAttr
    //         };
            
    //         return dotEdge;
    dot = (): DotEdge => ({
        tail: this.ctx.nodeLocation(this.jgEdge.jgeSource).name,
        head: this.ctx.nodeLocation(this.jgEdge.jgeTarget).name,
        attributes: {
            id: `edge${this.ctx.newEdgeId()}`, // used as svg element's id
            ...this.egdeAttributes()
        }
    })

}
export abstract class TamarinGraphNode {
    jgNode: JSONGraphNode;
    ctx: TamarinGraphBuildContext;
    nodeId: number;
    nodeName = () => `node${this.nodeId}`;

    constructor(jgNode: JSONGraphNode, ctx: TamarinGraphBuildContext) {
        this.jgNode = jgNode;
        this.ctx = ctx;
        this.nodeId = ctx.newNodeId();

        // add node id/name map record, e.g. #vk1 -> n2
        ctx.recordNode(jgNode.jgnId, {
            name: this.nodeName()
        });

        // allocate ports for all facts
        if (this.jgNode.jgnMetadata) {
            this.jgNode.jgnMetadata.jgnPrems.forEach(f => this.recordPorts(f));
            this.jgNode.jgnMetadata.jgnActs.forEach(f => this.recordPorts(f));
            this.jgNode.jgnMetadata.jgnConcs.forEach(f => this.recordPorts(f));
        }
    }
    abstract nodeAttributes(): Attributes;

    // record node name map for fact ports
    recordPorts(fact: JSONGraphNodeFact): void {
        this.ctx.recordNode(fact.jgnFactId, {
            name: this.nodeName(),
            port: `port${this.ctx.newPortId()}`
        });
    }

    dot = (): DotNode => ({
        name: this.nodeName(),
        attributes: {
            id: this.nodeName(), // used as svg element's id
            ...this.nodeAttributes()
        }
    })

}

// MARK: Color

type TamarinGraphNodeColor = "green" | "blue" | "purple";
type TamarinGraphNodeColorMode = TamarinGraphNodeColor | TamarinGraphNodeVaryingColor;
type TamarinGraphNodeVaryingColor = { base: TamarinGraphNodeColor; };

interface HsvColor {
    hue: number;
    saturation: number;
    value: number;
}

function toString(hsv: HsvColor) {
    return `${hsv.hue.toFixed(3)},${hsv.saturation.toFixed(3)},${hsv.value.toFixed(3)}`
}

const color2hsv: Record<TamarinGraphNodeColor, HsvColor> = {
    green: {
        hue: 0.3,
        saturation: 0.4,
        value: 0.7
    },
    blue: {
        hue: 0.6,
        saturation: 0.4,
        value: 0.7
    },
    purple: {
        hue: 0.8,
        saturation: 0.4,
        value: 0.7
    }
};

function vary(c: HsvColor, scale: number = 0.4): HsvColor {
    return {
        ...c,
        value: c.value + (Math.random() - 0.5) * scale
    };
}

function isVaryingColor(c: TamarinGraphNodeColorMode): c is TamarinGraphNodeVaryingColor {
    return typeof c === "object" && "base" in c;
}

// MARK: Rect Node

export class TamarinGraphRectBoxNode extends TamarinGraphNode {
    color: HsvColor;
    constructor(jgNode: JSONGraphNode, ctx: TamarinGraphBuildContext, colorMode: TamarinGraphNodeColorMode) {
        super(jgNode, ctx);
        this.color = isVaryingColor(colorMode) ? vary(color2hsv[colorMode.base]) : color2hsv[colorMode];
    }

    factsToTblRow(facts: JSONGraphNodeFact[]): DotNodeLabelContainer {
        return new DotNodeLabelContainer(
            facts.map(fact => {
                const abbreviatedFact = abbreviate(this.nodeName(), fact, this.ctx);
                return new DotNodeLabelCell(prettyPrintFact(abbreviatedFact), this.ctx.nodeLocation(fact.jgnFactId).port);
            })
        );
    }

    middleRow(afacts: JSONGraphNodeFact[]): DotNodeLabelCell {
        let txt = this.jgNode.jgnId + " : " + this.jgNode.jgnLabel;
        if (afacts.length > 0) {
            txt += "[";
            txt += afacts.map(fact => {
                const abbreviatedFact = abbreviate(this.nodeName(), fact, this.ctx);
                return prettyPrintFact(abbreviatedFact);
            }).join(",\\n");
            txt += "]";
        }

        return new DotNodeLabelCell(txt)
    }
    
    label(): string {
        if (this.jgNode.jgnMetadata) {
            const tbl = new DotNodeLabelContainer([
                this.factsToTblRow(this.jgNode.jgnMetadata.jgnPrems), // top row (premises)
                this.middleRow(this.jgNode.jgnMetadata.jgnActs), // middle row (actions)
                this.factsToTblRow(this.jgNode.jgnMetadata.jgnConcs) // bottom row (conclusions)
            ]);

            return tbl.dot();
        }
        else {
            return this.jgNode.jgnId;
        }
    }

    nodeAttributes = (): Attributes => ({
        shape: "record",
        style: "filled",
        fillcolor: toString(this.color),
        label: this.label()
    })
}



export class TamarinGraphProtocolNode extends TamarinGraphRectBoxNode {
    constructor(jgNode: JSONGraphNode, ctx: TamarinGraphBuildContext) {
        super(jgNode, ctx, { base: "green" });
    }
}

export class TamarinGraphFreshNode extends TamarinGraphRectBoxNode {
    constructor(jgNode: JSONGraphNode, ctx: TamarinGraphBuildContext) {
        super(jgNode, ctx, "purple");
    }
}

export class TamarinGraphIntruderL0Node extends TamarinGraphRectBoxNode {
    constructor(jgNode: JSONGraphNode, ctx: TamarinGraphBuildContext) {
        super(jgNode, ctx, { base: "blue" });
    }
}

// MARK: Round Node

export class TamarinGraphRoundBoxNode extends TamarinGraphNode {
    borderColor: string;
    constructor(jgNode: JSONGraphNode, ctx: TamarinGraphBuildContext, borderColor: string = "black") {
        super(jgNode, ctx);
        this.borderColor = borderColor;
    }

    label(): string {
        let lbl = this.jgNode.jgnId + " : " + this.jgNode.jgnLabel;

        if (this.jgNode.jgnMetadata) {
             // TODO(J): redundant with the one in TamarinGraphRectBoxNode
            if (this.jgNode.jgnMetadata.jgnActs.length > 0) {
                lbl += "[";
                lbl += this.jgNode.jgnMetadata.jgnActs.map(fact => {
                    const abbreviatedFact = abbreviate(this.nodeName(), fact, this.ctx);
                    return prettyPrintFact(abbreviatedFact);
                }).join(",\\n");
                lbl += "]";
            }
        }
        return lbl;
    }

    nodeAttributes = (): Attributes => ({
        shape: "ellipse",
        color: this.borderColor,
        label: this.label()
    })
}

export class TamarinGraphUnknownNode extends TamarinGraphRoundBoxNode {
    constructor(jgNode: JSONGraphNode, ctx: TamarinGraphBuildContext) {
        super(jgNode, ctx, "red");
    }

    nodeAttributes = () => ({
        label: "?"
    });
}

export class TamarinGraphLastAtomNode extends TamarinGraphRoundBoxNode {
    constructor(jgNode: JSONGraphNode, ctx: TamarinGraphBuildContext) {
        super(jgNode, ctx);
    }

    nodeAttributes = () => ({
        label: this.jgNode.jgnId
    });
}

export class TamarinGraphIntruderNode extends TamarinGraphRoundBoxNode {
        constructor(jgNode: JSONGraphNode, ctx: TamarinGraphBuildContext) {
        super(jgNode, ctx);
    }
}

export class TamarinGraphUnsolvedActionNode extends TamarinGraphRoundBoxNode {
    constructor(jgNode: JSONGraphNode, ctx: TamarinGraphBuildContext) {
        if (jgNode.jgnMetadata?.jgnActs.at(0)?.jgnFactTag === "KUFact") {
            // KUFact
            super(jgNode, ctx, "gray");
        }
        else {
            // otherwise
            super(jgNode, ctx, "darkblue");
        }
    }
}

// MARK: Trapezium Node

export class TamarinGraphMissingNode extends TamarinGraphNode {
    prem: boolean; // true if missingNodePrem

    constructor(jgNode: JSONGraphNode, ctx: TamarinGraphBuildContext, prem: boolean) {
        super(jgNode, ctx);
        this.prem = prem;
    }

    label(): string {
        return `${this.jgNode.jgnId}`;
    }

    nodeAttributes = (): Attributes => ({
        shape: this.prem ? "invtrapezium" : "trapezium",
        label: this.label()
    });
}


export class TamarinGraphSolidEdge extends TamarinGraphEdge {
    edgeColor: string;
    weight: string;
    protoperStyle: string;
    constructor(jgEdge: JSONGraphEdge, ctx: TamarinGraphBuildContext, edgeColor: string, weight?: string, protoperStyle?: string) {
        super(jgEdge, ctx);
        this.edgeColor = edgeColor;
        this.weight = weight!;
        this.protoperStyle = protoperStyle!;
    }

    egdeAttributes(): Attributes {
        return {
            style: this.protoperStyle || "solid",
            weight: this.weight || "normal",
            color: this.edgeColor,
            tailport: this.ctx.nodeLocation(this.jgEdge.jgeSource).port!,
            headport: this.ctx.nodeLocation(this.jgEdge.jgeTarget).port!,
        };
    }
}
export class TamarinGraphProtoFactEdge extends TamarinGraphSolidEdge {
    constructor(jgEdge: JSONGraphEdge, ctx: TamarinGraphBuildContext) {
        super(jgEdge, ctx, "black","10.0","bold");
    }
}
export class TamarinGraphKFactEdge extends TamarinGraphSolidEdge {
    constructor(jgEdge: JSONGraphEdge, ctx: TamarinGraphBuildContext) {
        super(jgEdge, ctx, "orangered2");
    }
}   
export class TamarinGraphPersistentFactEdge extends TamarinGraphSolidEdge {
    constructor(jgEdge: JSONGraphEdge, ctx: TamarinGraphBuildContext) {
        super(jgEdge, ctx, "gray50","10.0","bold");
    }
}
export class TamarinGraphDottedEdge extends TamarinGraphEdge {
    
    edgeColor: string;

    constructor(jgEdge: JSONGraphEdge, ctx: TamarinGraphBuildContext, edgeColor: string) {
        super(jgEdge, ctx);
        this.edgeColor = edgeColor;
    }

   egdeAttributes(): Attributes {
        return {
            style: "dashed",
            color: this.edgeColor,
            tailport: this.ctx.nodeLocation(this.jgEdge.jgeSource).port!,
            headport: this.ctx.nodeLocation(this.jgEdge.jgeTarget).port!,
        };
    }
}

export class TamarinGraphLessAtomsEdge extends TamarinGraphDottedEdge {
    constructor(jgEdge: JSONGraphEdge, ctx: TamarinGraphBuildContext) {

        if(jgEdge.reason?.includes("Fresh")) {
        super(jgEdge, ctx, "blue3");
        }
        else if(jgEdge.reason?.includes("Formula")) {
        super(jgEdge, ctx, "black");
        }
        else if(jgEdge.reason?.includes("InjectiveFacts")) {
        super(jgEdge, ctx, "purple");
        }
        else if(jgEdge.reason?.includes("NormalForm")) {
        super(jgEdge, ctx, "darkorange3");
        }
        else if(jgEdge.reason?.includes("Adversary")) {
        super(jgEdge, ctx, "red");
        }
        else {
        super(jgEdge, ctx, "black");
        }
    }
    
}

export class TamarinGraphUnsolvedChainEdge extends TamarinGraphDottedEdge {
    constructor(jgEdge: JSONGraphEdge, ctx: TamarinGraphBuildContext) {
        super(jgEdge, ctx, "green");
    }
}

// default edge type if no specific relation is given
export class TamarinGraphDefaultEdge extends TamarinGraphSolidEdge {
    constructor(jgEdge: JSONGraphEdge, ctx: TamarinGraphBuildContext) {
        super(jgEdge, ctx, "gray30");
    }
}

// MARK: Node Factory

function createTamarinGraphNode(
    jgNode: JSONGraphNode, 
    ctx: TamarinGraphBuildContext,
    simplification: number): TamarinGraphNode {
    switch (jgNode.jgnType) {
        case "isDestrRule":
        case "isIEqualityRule":
        case "isConstrRule":
        case "isPubConstrRule":
        case "isNatConstrRule":
        case "isIRecvRule":
        case "isISendRule":
        case "isCoerceRule":
        case "isProtocolRule":
            return new TamarinGraphProtocolNode(jgNode, ctx);
        case "isIntruderRule":
            if (simplification === 0) {
                return new TamarinGraphIntruderL0Node(jgNode, ctx); // blue rect box
            }
            else {
                return new TamarinGraphIntruderNode(jgNode, ctx); // round box
            }
        case "missingNodeConc":
            return new TamarinGraphMissingNode(jgNode, ctx, false);
        case "missingNodePrem":
            return new TamarinGraphMissingNode(jgNode, ctx, true);
        case "unsolvedActionAtom":
            return new TamarinGraphUnsolvedActionNode(jgNode, ctx);
        case "isFreshRule":
            return new TamarinGraphFreshNode(jgNode, ctx);
        case "lastAtom":
            return new TamarinGraphLastAtomNode(jgNode, ctx);
        case "unknown rule type":
            return new TamarinGraphUnknownNode(jgNode, ctx);
    }
}

function createTamarinGraphEdge(
    jgEdge: JSONGraphEdge, 
    ctx: TamarinGraphBuildContext, 
    simplification: number): TamarinGraphEdge {
        console.debug(simplification);
        switch(jgEdge.jgeRelation) {
            case "KFact":
                return new TamarinGraphKFactEdge(jgEdge, ctx);
            case "PersistentFact":
                return new TamarinGraphPersistentFactEdge(jgEdge, ctx);
            case "ProtoFact":
                return new TamarinGraphProtoFactEdge(jgEdge, ctx);
            case "LessAtoms":
                return new TamarinGraphLessAtomsEdge(jgEdge, ctx);
            case "unsolvedChain":
                return new TamarinGraphUnsolvedChainEdge(jgEdge, ctx);
            case "default":
                return new TamarinGraphDefaultEdge(jgEdge, ctx);
        }
}
export class TamarinGraph {
    jsonGraph: JSONGraph;
    ctx: TamarinGraphBuildContext;

    nodes: TamarinGraphNode[];
    edges: DotEdge[];

    constructor(jg:JSONGraph, ctx: TamarinGraphBuildContext, simplification: number) {
        this.jsonGraph = jg;
        this.ctx = ctx;

        this.nodes = this.jsonGraph.jgNodes.map(n => createTamarinGraphNode(n, ctx, simplification));
        
        this.edges = this.jsonGraph.jgEdges.map(e => createTamarinGraphEdge(e, ctx, simplification).dot());
       
    }

    dot(): DotGraph {
        return {
            directed: this.jsonGraph.jgDirected,
            graphAttributes: {
                "nodesep": 0.3,
                "ranksep": 0.3
            },
            nodes: this.nodes.map(n => n.dot()),
            edges: this.edges
        };
    }
}