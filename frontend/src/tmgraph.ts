import { 
    JSONGraph,
    JSONGraphEdge,
    JSONGraphNode, 
    JSONGraphNodeFact, 
    JSONGraphNodeTerm, 
    prettyPrintTerm 
} from "./jsongraph";

export class TamarinGraphBuildContext {
    nodeCount: number; // includes both node and record node field (port)
    edgeCount: number;

    nodeIdMap: Record<string, string> // json id to tg id;

    constructor() {
        this.nodeCount = 0;
        this.edgeCount = 0;
        this.nodeIdMap = {};
    }

    newNodeId() {
        return this.nodeCount++;
    }

    newEdgeId() {
        return this.edgeCount++;
    }

    currentNodeCount() {
        return this.nodeCount;
    }

    currentEdgeCount() {
        return this.edgeCount;
    }

    recordNode(jid: string, tid: string) {
        this.nodeIdMap[jid] = tid;
    }

    nodeId(jsonId: string) {
        return this.nodeIdMap[jsonId];
    }
}



export abstract class TamarinGraphDrawObject {
    context: TamarinGraphBuildContext
    // TODO: abstract class shouldn't have instance, is it fine to have a constructor?
    constructor(c: TamarinGraphBuildContext) {
        this.context = c;
    } 
    abstract dotstr(): string;
}

export class TamarinGraph extends TamarinGraphDrawObject {
    nodes: TamarinGraphNode[];
    edges: TamarinGraphEdge[];

    constructor(g: JSONGraph, c: TamarinGraphBuildContext) {
        super(c);
        this.nodes = g.jgNodes.map(n => new TamarinGraphNode(n, c));
        this.edges = g.jgEdges.map(e => new TamarinGraphEdge(e, c));
    }

    dotstr() {
        return "digraph \"G\" {\n" + 
        "nodesep=\"0.3\";\n" + 
        "ranksep=\"0.3\";\n" + 
        "node[fontsize=\"8\",fontname=\"Helvetica\",width=\"0.3\",height=\"0.2\"];\n" +
        "edge[fontsize=\"8\",fontname=\"Helvetica\"];\n" +
        this.nodes.map(n => n.dotstr()).join("\n") +
        this.edges.map(e => e.dotstr()).join("\n") +
        "}";
    }

    
}

export class TamarinGraphEdge extends TamarinGraphDrawObject {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;

    constructor(e: JSONGraphEdge, c: TamarinGraphBuildContext) {
        super(c);
        this.id = `e${this.context.newEdgeId()}`;
        this.sourceNodeId = this.context.nodeId(e.jgeSource);
        this.targetNodeId = this.context.nodeId(e.jgeTarget);
    }

    dotstr() {
        return `${this.sourceNodeId} -> ${this.targetNodeId};`;
    }
}


export class TamarinGraphNodeFact extends TamarinGraphDrawObject {
    fact: JSONGraphNodeFact;
    id: string;
    constructor(f: JSONGraphNodeFact, parentId: string, c: TamarinGraphBuildContext) {
        super(c);
        this.fact = f;
        // fieldId see https://graphviz.org/doc/info/shapes.html#record
        this.id = `n${this.context.newNodeId()}`;
        this.context.recordNode(this.fact.jgnFactId, `${parentId}:${this.id}`);
    }

    dotstr() {
        return `<${this.id}> ${this.fact.jgnFactName}(${this.fact.jgnFactTerms.map(t => escapeHtml(prettyPrintTerm(t))).join(", ")})`;
    }
}

export class TamarinGraphNode extends TamarinGraphDrawObject {
    jgnId: string;
    jgnLabel: string;

    premises: TamarinGraphNodeFact[] = [];
    actions: TamarinGraphNodeFact[] = [];
    conclusions: TamarinGraphNodeFact[] = [];
    id: string;

    constructor(n: JSONGraphNode, c: TamarinGraphBuildContext) {
        super(c);

        this.jgnId = n.jgnId;
        this.jgnLabel = n.jgnLabel;
        this.id = `n${this.context.newNodeId()}`;
        this.context.recordNode(this.jgnId, this.id);


        if (n.jgnMetadata) {
            this.premises = n.jgnMetadata.jgnPrems.map(f => new TamarinGraphNodeFact(f, this.id, c));
            this.actions = n.jgnMetadata.jgnActs.map(f => new TamarinGraphNodeFact(f, this.id, c));
            this.conclusions = n.jgnMetadata.jgnConcs.map(f => new TamarinGraphNodeFact(f, this.id, c));
        }
    }

    dotstr() {
        const label = `{{${this.premises.map(p => p.dotstr()).join("|")}}|${this.jgnId} : ${this.jgnLabel}|{${this.conclusions.map(p => p.dotstr()).join("|")}}}`;

        return `${this.id}[shape="record",label="${label}"];`;
    }
}

function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}