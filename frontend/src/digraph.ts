import { findGElementIdByTitle } from "./dom"
import { JsonGraph } from "./jsondigraph"
import { VizGraph } from "./viz"

interface DiEdge {
    elementId?: string,
    minimizable: boolean,
    title?: string,
    from: string,
    fromPort?: string,
    to: string
    toPort?: string
}

interface DiNode {
    title: string,
    elementId?: string,
    minimizable: boolean
}


type NodeDict = { [key: string]: DiNode };
type EdgeDict = { [key: string]: DiEdge };

// the value represents edge id
type AdjMatrix = { [key: string]: AdjMatrixRow };
type AdjMatrixRow = { [key: string]: string | null };


export interface DiGraphConnections {
    nodes: string[],
    edges: string[]
}

function composeEdgeTitle(edge: DiEdge, nodes: NodeDict) {
    return `${nodes[edge.from].title}${edge.fromPort ? `:${edge.fromPort}` : ""}->${nodes[edge.to].title}${edge.toPort ? `:${edge.toPort}` : ""}`;
}

let jsonGraphSrc: JsonGraph | undefined;
export class JsonDiGraph {

    nodeMap: any = {};
    factMap: any = {};
    combinedMap: any = {};
    counter = 0;
    jsonString: JsonGraph;
    dotstring: string = '';
    shape: string = '';
    label: string = '';
    constructor(json: JsonGraph) 
    {
        this.jsonString = json;
        jsonGraphSrc = json;
        //Fetched and mapped the JSON string recieved 
        jsonGraphSrc?.graphs?.forEach((graph) => {
        graph.jgNodes?.forEach((node) => {
            
                node.jgnMetadata?.jgnPrems?.forEach((prem) => {
                    this.factMap[prem.jgnFactId] = 'n' + this.counter++;
                });
                node.jgnMetadata?.jgnConcs?.forEach((conc) => {
                    this.factMap[conc.jgnFactId] = 'n' + this.counter++;
                });
                node.jgnMetadata?.jgnActs?.forEach((act) => {
                    this.factMap[act.jgnFactName!] = 'n' + this.counter++;
                });
                this.nodeMap[node.jgnId] = 'n' + this.counter++;
        });
    });
    this.buildDotString()
}
    public buildDotString() {

    this.dotstring = `
        digraph "G" { 
        nodesep="0.3";
        ranksep="0.3";
        node[fontsize="8",fontname="Helvetica",width="0.3",height="0.2"];
        edge[fontsize="8",fontname="Helvetica"];
        `
    jsonGraphSrc?.graphs?.forEach((graph) => {
        graph.jgNodes?.forEach((node) => {
        
        const prems = (node.jgnMetadata?.jgnPrems || [])
        .map(prem => `<${this.factMap[prem.jgnFactId]}> ${prem.jgnFactShow}`)
        .join("|");

        const acts = (node.jgnMetadata?.jgnActs || [])
        .map(act => `<${this.factMap[act.jgnFactName!]}> ${node.jgnId} : ${node.jgnLabel}[${act.jgnFactShow}]`)
        .join("|");

        const concs = (node.jgnMetadata?.jgnConcs || [])
        .map(conc => `<${this.factMap[conc.jgnFactId]}> ${conc.jgnFactShow}`)
        .join("|");

        if (node.jgnType === "unsolvedActionAtom") {
            this.label = `${node.jgnLabel} @ ${node.jgnId}`;
            this.shape = 'ellipse'
        }
        else 
        {
            this.label = `{{${prems}}|{${acts}}|{${concs}}}`;
            this.shape= `record`
        }
        
        this.dotstring += `${this.nodeMap[node.jgnId]}[shape="${this.shape}",label="${this.label}"];`;
        })
        
    });


        //     digraph "G" {
        // nodesep="0.3";
        // ranksep="0.3";
        // node[fontsize="8",fontname="Helvetica",width="0.3",height="0.2"];
        // edge[fontsize="8",fontname="Helvetica"];
        // n3[shape="record",label="{{<n0> Client_1( S, k )|<n1> In( h(k) )}|{<n2> #i : Client_2[SessKeyC( S, k )]}}",fillcolor="#d5d897",style="filled",fontcolor="black",role="Undefined"];
        // n7[shape="record",label="{{<n4> !KU( k )}|{<n5> #j : isend[K( k )]}|{<n6> In( k )}}",fillcolor="#caa6ee",style="filled",fontcolor="black",role="Undefined"];
        // n11[shape="record",label="{{<n8> !KU( h(k) )}|{<n9> #vf : isend[K( h(k) )]}|{<n10> In( h(k) )}}",fillcolor="#caa6ee",style="filled",fontcolor="black",role="Undefined"];
        // n12[label="!KU( h(k) ) @ #vk",shape="ellipse",color="gray"];
        // n13[label="!KU( k ) @ #vk.1",shape="ellipse",color="gray"];
        // n11:n10 -> n3:n1[color="gray30"];
        // n12 -> n11:n9[color="red",style="dashed"];
        // n13 -> n7:n5[color="red",style="dashed"];

        // }

        this.dotstring += '}';
        console.debug("nodeMap: ", this.nodeMap);
        console.debug("factMap: ", this.factMap);
        // console.debug("DotString: ", this.dotstring);
        // console.debug("inside constructor: jsonGraphSrc: ", jsonGraphSrc);
        return this.dotstring
    }
}

export class DiGraph {

    nodes: NodeDict;
    edges: EdgeDict;
    adj: AdjMatrix;
    abbrev: {
        elementId?: string,
        abbreviations: { [key: string]: string[] }
    } = {
            abbreviations: {}
        };

    // table uses elementId as key to lookup (node/edge)Id
    reverseLookup: {
        nodes: { [key: string]: string },
        edges: { [key: string]: string }
    } = {
            nodes: {},
            edges: {}
        }

    //extract abbreviations
    constructor(vizGraph: VizGraph, svg: SVGSVGElement) {
        const abbrevObj = (vizGraph.objects ?? []).find(n => n.shape === "plain");
        if (abbrevObj) {
            // find abbreviation table's element id
            this.abbrev.elementId = findGElementIdByTitle(svg, abbrevObj.name);
            // extract abbreviations
            abbrevObj._ldraw_?.filter(d => d.op === "T").forEach((d, i) => {
                if (i % 3 === 0 && d.text) {
                    this.abbrev.abbreviations[d.text] = [];
                }
            });
        }


        // extract nodes
        this.nodes = (vizGraph.objects ?? []).filter(n =>
            n.shape === "ellipse" ||
            n.shape === "record" ||
            n.shape === "invtrapezium" ||
            n.shape === "trapezium"
        ).reduce(
            (acc, cur) => {
                // check if node contains abbrevation
                Object.keys(this.abbrev.abbreviations).forEach(k => {
                    if (cur.label?.includes(k)) {
                        this.abbrev.abbreviations[k].push(cur._gvid.toString());
                    }
                });
                acc[cur._gvid] = {
                    title: cur.name,
                    minimizable: cur.shape === "record"
                }
                

                return acc
            }, {} as NodeDict
        );

        // extract edges
        this.edges = (vizGraph.edges ?? []).filter(e => e.style !== "invis")
            .reduce((acc, cur) => {
                const fromNodeId = cur.tail.toString();
                const toNodeId = cur.head.toString();
                acc[cur._gvid] = {
                    from: fromNodeId,
                    fromPort: cur.tailport,
                    to: toNodeId,
                    toPort: cur.headport,
                    minimizable: this.nodes[fromNodeId].minimizable || this.nodes[toNodeId].minimizable
                };
                return acc;

            }, {} as EdgeDict);

        // initialize adjacency matrix
        this.adj = Object.keys(this.nodes).reduce((accRow, curRow) => {
            accRow[curRow] = Object.keys(this.nodes).reduce((acc, cur) => {
                acc[cur] = null;
                return acc;
            }, {} as AdjMatrixRow);
            return accRow;
        }, {} as AdjMatrix);

        // construct adjacency matrix
        for (const [k, v] of Object.entries(this.edges)) {
            this.adj[v.from][v.to] = k;
        }

        // construct edge titles
        this.edges = Object.keys(this.edges).reduce(
            (acc, curKey) => {
                const e = this.edges[curKey];
                acc[curKey] = {
                    ...e,
                    title: composeEdgeTitle(e, this.nodes)
                };
                return acc;
            }, {} as EdgeDict
        );

        // find and assign element id
        this.nodes = Object.keys(this.nodes).reduce(
            (acc, curKey) => {
                const n = this.nodes[curKey];
                const elementId = findGElementIdByTitle(svg, n.title);
                acc[curKey] = {
                    ...n,
                    elementId
                };
                if (elementId) {
                    this.reverseLookup.nodes[elementId] = curKey
                }
                return acc;
            }, {} as NodeDict
        );

        this.edges = Object.keys(this.edges).reduce(
            (acc, curKey) => {
                const e = this.edges[curKey];
                const elementId = findGElementIdByTitle(svg, e.title);
                acc[curKey] = {
                    ...e,
                    elementId
                }
                if (elementId) {
                    this.reverseLookup.edges[elementId] = curKey
                }
                return acc;
            }, {} as EdgeDict
        );
    }

    getConnections(nodeId: string): DiGraphConnections {
        // downstream connections only
        const connections: DiGraphConnections = {
            nodes: [nodeId],
            edges: []
        };
        for (const [n, e] of Object.entries(this.adj[nodeId])) {
            if (e) {
                connections.edges.push(e); // Note* inplace/mutable change
                const downstreamConnnections = this.getConnections(n);
                connections.edges = connections.edges.concat(downstreamConnnections.edges); // Note* concat is immutable
                connections.nodes = connections.nodes.concat(downstreamConnnections.nodes);
            }
        }
        return connections;
    }
}


