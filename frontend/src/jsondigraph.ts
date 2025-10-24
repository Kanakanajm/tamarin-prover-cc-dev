export interface JgnNode {
    jgnConst?: string; 
    jgnFunct?: string; 
    jgnParams?: JgnNode[]; 
    jgnShow?: string; 
}

export interface Abbrev {
    jgaAbbrev: {
        jgnConst: string; 
    };
    jgaExpansion: JgnNode; 
    jgaTerm: JgnNode; 
}

export interface Clusters {

}
export interface Edges {

    jgeRelation: string;
    jgeSource: string;
    jgeTarget: string;

}
export interface Nodes {
    jgnId: string;
    jgnLabel: string;
	jgnMetadata: Metadata[];
    jgnType	: string;
}
export interface Metadata {
    jgnActs: Actions[];
	jgnConcs: Actions[];
	jgnPrems: Actions[];
    jgnType	:	string;
}

export interface Actions {
jgnFactId	:	string;
jgnFactMult	:	string;
jgnFactName	:	string;
jgnFactShow	:	string;
jgnFactTag	:	string;
jgnFactTerms:	JgnNode[];
}

export interface Graph {
    jgAbbrevs: Abbrev[];
    jgClusters: Clusters[];
    jgDirected: boolean;
    jgEdges: Edges[];
    jgLabel: string;
    jgNodes: Nodes[];
    jgType: string;
}

export interface JsonGraph {
    graphs: Graph[];
}