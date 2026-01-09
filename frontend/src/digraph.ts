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
    ruleMap: any = {};
    combinedMap: any = {};
    counter = 0;
    factcounter = 0;
    jsonString: JsonGraph;
    dotstring: string = '';
    shape: string = '';
    label: string = '';
    edges: string = '';
    srcFactIds: (string|undefined)[] = [];
    constructor(json: JsonGraph) 
    {
        this.jsonString = json;
        jsonGraphSrc = json;
        //Fetched and mapped the JSON string recieved 
        jsonGraphSrc?.graphs?.forEach((graph) => {
        graph.jgNodes?.forEach((node) => {
            
                node.jgnMetadata?.jgnPrems?.forEach((prem) => {
                    this.factMap[prem.jgnFactId] = 'n' + this.factcounter++;
                });
                node.jgnMetadata?.jgnActs?.forEach((act) => {
                    this.factMap[act.jgnFactShow!] = 'n' + this.factcounter++;
                });
                node.jgnMetadata?.jgnConcs?.forEach((conc) => {
                    this.factMap[conc.jgnFactId] = 'n' + this.factcounter++;
                });
                if(node.jgnType === "isProtocolRule" || node.jgnType === "isIntruderRule" || node.jgnType === "isFreshRule")
                    this.ruleMap[node.jgnId] = 'n' + this.counter++;
                // this.factMap[node.jgnLabel!] = 'n' + this.factcounter++;
                
                this.nodeMap[node.jgnId] = 'n' + this.counter++;
        });
    });
    this.buildDotString()
}
    public buildDotString() {

    this.edges = "";
    this.dotstring = `
        digraph "G" { 
        nodesep="0.3";
        ranksep="0.3";
        node[fontsize="8",fontname="Helvetica",width="0.3",height="0.2"];
        edge[fontsize="8",fontname="Helvetica"];
        `
    jsonGraphSrc?.graphs?.forEach((graph) => {
        graph.jgNodes?.forEach((node) => {

        const prems = node.jgnMetadata?.jgnPrems ? node.jgnMetadata?.jgnPrems.map(prem => { 
            return `<${this.factMap[prem.jgnFactId]}> ${prem.jgnFactShow}`; 
        }).join("|") : null;

        const rules = node.jgnId ? `<${this.ruleMap[node.jgnId]}> ${node.jgnId} : ${node.jgnLabel}` : null;
        const acts = node.jgnMetadata?.jgnActs ? node.jgnMetadata?.jgnActs.map(act => `<${this.factMap[act.jgnFactShow!]}> ${node.jgnId} : ${node.jgnLabel}[${act.jgnFactShow}]`).join("|") : null;

        const concs = node.jgnMetadata?.jgnConcs ? node.jgnMetadata?.jgnConcs.map(conc => { 
            // if(node.jgnType === 'isFreshRule') {
            //     const id = conc.jgnFactId?.split(':') || '';
            //     return `<${this.nodeMap[id[0]]}> ${node.jgnId} : ${node.jgnLabel}}|{<${this.factMap[conc.jgnFactId]}> ${conc.jgnFactShow}` 
            // }
            return `<${this.factMap[conc.jgnFactId]}> ${conc.jgnFactShow}`; 
        }).join("|") : null;

        if (node.jgnType === "unsolvedActionAtom") {
            this.label = `${node.jgnLabel} @ ${node.jgnId}`;
            this.shape = 'ellipse'
        }
        else 
        {
            let rec: any[] = []
            if(acts) {
                rec = [prems, acts, concs].filter(Boolean);
            }
            else {
                if(node.jgnType === "isProtocolRule" || node.jgnType === "isIntruderRule" || node.jgnType === "isFreshRule") {
                rec = [prems, rules, concs].filter(Boolean);
                }  
            }
            this.label = '{' + rec.map(r => `{${r}}`).join('|') + '}';
            
            // this.label = `{${prems? `{${prems}}`:''}${acts? `|{${acts}}`:''}${concs? `|{${concs}}`:''}}`;
            this.shape= `record`
        }

        this.dotstring += `${this.nodeMap[node.jgnId]}[shape="${this.shape}",label="${this.label}"];\n`;
        })
        
    });
    jsonGraphSrc?.graphs?.forEach((graph) => {
        graph.jgEdges?.forEach((edge) => {
            if(edge.jgeRelation!='LessAtoms') {
                const arrsrc = edge.jgeSource?.split(':') || '';
                const arrtar = edge.jgeTarget?.split(':') || '';
                this.edges += `${this.nodeMap[arrsrc[0]]}:${this.factMap[edge.jgeSource!]} -> ${this.nodeMap[arrtar[0]]}:${this.factMap[edge.jgeTarget!]};\n`;
            }
            else {
               
                const srcNode = graph.jgNodes?.find((node)=>node.jgnId==edge.jgeSource);
                const targetNode = graph.jgNodes?.find((node)=> node.jgnId==edge.jgeTarget);
                console.debug('srcNode = ', srcNode);
                
                 srcNode?.jgnMetadata?.jgnActs?.forEach(act=>{
                    const factId = targetNode?.jgnMetadata?.jgnPrems?.find(prem=>
                        prem.jgnFactName == act.jgnFactName
                    )
                    if(factId){
                        this.edges += `${this.nodeMap[srcNode.jgnId]} -> ${this.nodeMap[targetNode?.jgnId!]}:${this.factMap[factId.jgnFactId]};\n`;
                    }
                })

            }
        })
    })

        this.dotstring += `${this.edges}`
        this.dotstring += '}';
        console.debug("nodeMap: ", this.nodeMap);
        console.debug("factMap: ", this.factMap);

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


