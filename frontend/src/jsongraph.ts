export type JSONGraphNodeTermConst = {
    jgnConst: string;
};

export type JSONGraphNodeTermFunct = {
    jgnFunct: string;
    jgnParams: JSONGraphNodeTerm[];
    jgnShow: string;
};

export type JSONGraphNodeTerm = JSONGraphNodeTermConst | JSONGraphNodeTermFunct;

export interface JsonGraphAbbrev {
    jgaTerm: JSONGraphNodeTerm;
    jgaAbbrev: JSONGraphNodeTerm;
    jgaExpansion: JSONGraphNodeTerm;
}

export interface JSONGraphCluster {
    jgcName: string;
    jgcNodes: JSONGraphNode[];
    jgcEdges: JSONGraphEdge[];
}

export interface JSONGraphEdge {
    jgeSource: string;
    jgeRelation: string;
    jgeTarget: string;
}

export type JSONGraphNodeType =
    "isIntruderRule"    |
    "isDestrRule"       |
    "isIEqualityRule"   |
    "isConstrRule"      |
    "isPubConstrRule"   |
    "isNatConstrRule"   |
    "isFreshRule"       |
    "isIRecvRule"       |
    "isISendRule"       |
    "isCoerceRule"      |
    "isProtocolRule"    |
    "unknown rule type" |
    "unsolvedActionAtom"|
    "lastAtom"          |
    "missingNodeConc"   |
    "missingNodePrem";

export interface JSONGraphNode {
    jgnId: string;
    jgnType: JSONGraphNodeType;
    jgnLabel: string;
    jgnMetadata?: JSONGraphNodeMetadata;
}

export interface JSONGraphNodeMetadata {
    jgnActs: JSONGraphNodeFact[];
    jgnConcs: JSONGraphNodeFact[];
    jgnPrems: JSONGraphNodeFact[];
}

export interface JSONGraphNodeFact {
    jgnFactId: string;
    jgnFactTag: string;
    jgnFactName: string;
    jgnFactMult: string;
    jgnFactTerms: JSONGraphNodeTerm[];
    jgnFactShow: string;
}

export interface JSONGraph {
    jgDirected: boolean;
    jgType: string;
    jgLabel: string;
    jgNodes: JSONGraphNode[];
    jgEdges: JSONGraphEdge[];
    jgClusters: JSONGraphCluster[];
    jgAbbrevs: JsonGraphAbbrev[];
}

export interface JSONGraphs {
    graphs: JSONGraph[];
}

/**
 * Whether term is a constant term
 */
function isConst(t: JSONGraphNodeTerm): t is JSONGraphNodeTermConst {
    return "jgnConst" in t;
}

/**
 * Whether term is a function term
 */
function isFunct(t: JSONGraphNodeTerm): t is JSONGraphNodeTermFunct {
    return "jgnFunct" in t;
}

/**
 * Compare if two terms are the same
 */
export function isEqual(t1: JSONGraphNodeTerm, t2: JSONGraphNodeTerm): boolean {
    if (isConst(t1) && isConst(t2)) {
        return t1.jgnConst === t2.jgnConst;
    }

    if (isFunct(t1) && isFunct(t2) &&
        t1.jgnFunct === t2.jgnFunct &&
        t1.jgnParams.length === t2.jgnParams.length) 
    {   
        // if two function terms have same function name and parameter length,
        // compare their parameters piecewise
        for (let i = 0; i < t1.jgnParams.length; i++) {
            if (!isEqual(t1.jgnParams[i], t2.jgnParams[i])) {
                return false;
            }
        }
        return true;
    }
    return false;
}

/**
 * Pretty print terms
 * @remarks 
 * Pair functions are shown as <flattened_parameters>, for details refer to the {@link flattenPairFuncTerm} function
 * 
 * @param t term
 * @returns pretty printed term string
 * 
 */
export function prettyPrintTerm(t: JSONGraphNodeTerm): string {
    if (isFunct(t)) {
        if (t.jgnFunct === "pair") {
            return `<${flattenPairFuncTerm(t).join(", ")}>`;
        }
        else {
            return `${t.jgnFunct}(${t.jgnParams?.map(n => prettyPrintTerm(n)).join()})`
        }
    }
    else if (isConst(t)) {
        return t.jgnConst;
    }
    else {
        throw new Error("Unrecognized node");
    }
}

/**
 * Flatten pair function term into a list of its own pretty printed parameters
 * @remark e.g. pair(a, b) will be flattened to [a, b] 
 * 
 * nested pairs i.e. pair(pair(a, b), pair(c, d)) as [a, b, c, d].
 * 
 * but pair(a, foo(pair(b, c), d)) only as [a, foo(<b, c>, d)].
 * @param t the pair function term to be flattened
 * @returns a list of pretty printed parameters
 */
export function flattenPairFuncTerm(t: JSONGraphNodeTerm): string[] {
    if (isFunct(t) && t.jgnFunct === "pair") {
        return [...flattenPairFuncTerm(t.jgnParams[0]), ...flattenPairFuncTerm(t.jgnParams[1])]
    }
    return [prettyPrintTerm(t)];
}