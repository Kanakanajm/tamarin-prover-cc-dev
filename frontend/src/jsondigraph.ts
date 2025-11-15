export type ConstNode = {
    jgnConst: string;
    jgnFunct?: undefined;
    jgnParams?: undefined;
    jgnShow?: string; 
};

export type FunctNode = {
    jgnConst?: undefined;
    jgnFunct: string;
    jgnParams?: JgnNode[];
    jgnShow?: string; 
};

export type PairFunctNode = {
    jgnConst?: undefined;
    jgnFunct: string;
    jgnParams: JgnNode[];
    jgnShow?: string; 
};

type JgnNode = ConstNode | FunctNode | PairFunctNode;

// Whether node is a constant
export function isConst(node: JgnNode): node is ConstNode {
    return node.jgnConst !== undefined && node.jgnFunct === undefined;
}

// Whether node is a function
export function isFunct(node: JgnNode): node is FunctNode {
    return node.jgnConst === undefined && node.jgnFunct !== undefined;
}

// Whether node is a pair function, note it takes exact two parameters
export function isPairFunct(node: JgnNode): node is PairFunctNode {
    return isFunct(node) && node.jgnFunct === "pair" && Boolean(node.jgnParams && node.jgnParams.length === 2);
}

/**
 * Stringify expression nodes (constants or functions)
 * @remarks 
 * - Constants themself are strings thus they are returned straight away i.e. `JgnNode::jgnConst`
 * - Functions are shown as function_name(...) where function_name is `JgnNode::jgnFunct`
 * - Pair functions are shown as <flattened_parameters>, for details refer to the {@link flattenPair} function
 * 
 * @param node the expression object 
 * @returns the string representation of the node
 * 
 */
export function showNode(node: JgnNode): string {
    if (isFunct(node)) {
        if (isPairFunct(node)) {
            return `<${flattenPair(node).join(", ")}>`;
        }
        else {
            return `${node.jgnFunct}(${node.jgnParams?.map(n => showNode(n)).join()})`
        }
    }
    else if (isConst(node)) {
        return node.jgnConst;
    }
    else {
        throw new Error("Unrecognized node");
    }
}

/**
 * Flatten pair function parameters in case of recursive pairs
 * @remark pair(a, b) will be flattened to [a, b] 
 * 
 * while nested pairs i.e. pair(pair(a, b), pair(c, d)) will be flattened as [a, b, c, d].
 * 
 * In case of pair(a, foo(pair(b, c), d)), it is [a, foo(<b, c>, d)].
 * @param node the pair function node to be flattened
 * @returns a list of flattened pair parameters
 */
export function flattenPair(node: JgnNode): string[] {
    if (isPairFunct(node)) {
        return [...flattenPair(node.jgnParams[0]), ...flattenPair(node.jgnParams[1])]
    }
    return [showNode(node)];
}

export interface Abbrev {
    jgaAbbrev?: {
        jgnConst: string; 
    };
    jgaExpansion?: JgnNode; 
    jgaTerm?: JgnNode; 
}

export interface Clusters {

}
export interface Edges {

    jgeRelation?: string;
    jgeSource?: string;
    jgeTarget?: string;

}
export interface Nodes {
    jgnId: string;
    jgnLabel?: string;
	jgnMetadata?: Metadata;
    jgnType?: string;
}
export interface Metadata {
    jgnActs?: Actions[];
	jgnConcs?: Actions[];
	jgnPrems?: Actions[];
    jgnType?: string;
}

export interface Actions {
jgnFactId: string;
jgnFactMult?: string;
jgnFactName?: string;
jgnFactShow?: string;
jgnFactTag?: string;
jgnFactTerms?: JgnNode[];
}

export interface Graph {
    jgAbbrevs?: Abbrev[];
    jgClusters?: Clusters[];
    jgDirected?: boolean;
    jgEdges?: Edges[];
    jgLabel?: string;
    jgNodes?: Nodes[];
    jgType?: string;
}

export interface JsonGraph {
    graphs: Graph[];
}