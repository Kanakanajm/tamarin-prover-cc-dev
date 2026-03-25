import { isJSONGraphNodeTermConst, isJSONGraphNodeTermFunct, JSONGraphNodeFact, JSONGraphNodeTerm } from "./jsongraph";

type ConstantTerm = {
    const: string;
};

type FunctionTerm = {
    func: string;
    params: Term[];
};

type ListTerm = {
    elements: Term[];
}

type Term = ConstantTerm | FunctionTerm | ListTerm;

function isConst(t: Term): t is ConstantTerm {
    return "const" in t;
}

function isFunc(t: Term): t is FunctionTerm {
    return "func" in t;
}

function isList(t: Term): t is ListTerm {
    return "elements" in t;
}

function cons(c: string): ConstantTerm {
    return { const: c };
}

function func(f: string, ...ps: Term[]): FunctionTerm {
    return { func: f, params: ps };
}

function list(...els: Term[]): ListTerm {
    return { elements: els };
}

function map(t: JSONGraphNodeTerm): Term {
    if (isJSONGraphNodeTermConst(t)) {
        return { const: t.jgnConst } as ConstantTerm;
    }
    
    // json func term
    if (t.jgnFunct === "pair") {
        return { elements: flattenPair(t) } as ListTerm;
    }

    return {
        func: t.jgnFunct,
        params: t.jgnParams.map(p => map(p))
    } as FunctionTerm;
}

function flattenPair(t: JSONGraphNodeTerm): Term[] {
    if (isJSONGraphNodeTermFunct(t) && t.jgnFunct === "pair") {
        return [...flattenPair(t.jgnParams[0]), ...flattenPair(t.jgnParams[1])]
    }
    return [map(t)];
}

function replaceAt(str: string, index: number, char: string): string {
  return str.slice(0, index) + char + str.slice(index + 1);
}

type Options = {
    maxWidth: number;
    indent: string;
};

export function prettierJSONGraphNodeTerm(t: JSONGraphNodeTerm, opts?: Options) {
    return prettyPrint(map(t), opts);
}

export function prettierJSONGraphNodeFact(f: JSONGraphNodeFact, opts?: Options) {
    let terms = prettyPrint(list(...f.jgnFactTerms.map(map)), opts);
    terms = replaceAt(terms, 0, "( ");
    terms = replaceAt(terms, terms.length - 1, " )");

    return f.jgnFactName + terms;
}

function prettyPrint(
    node: Term,
    opts: Options = { maxWidth: 40, indent: "\\ \\ \\ \\ " }
): string {
    return render(node, 0, opts);
}

function render(
    node: Term,
    indentLevel: number,
    opts: Options
): string {

    const flat = renderFlat(node);

    if (flat.length + indentLevel <= opts.maxWidth) {
        return flat;
    }

    if (isConst(node)) {
        return node.const;
    }

    const indent = opts.indent.repeat(indentLevel + 1);

    if (isList(node)) {
        const els = node.elements
        .map(p => indent + render(p, indentLevel + 1, opts))
        .join(",\\l");

        return (
            "<\\l" +
            els +
            "\\l" +
            opts.indent.repeat(indentLevel) +
            ">"
        );
    }


    const params = node.params
        .map(p => indent + render(p, indentLevel + 1, opts))
        .join(",\\l");

    return (
        node.func +
        "(\\l" +
        params +
        "\\l" +
        opts.indent.repeat(indentLevel) +
        ")"
    );
}

function renderFlat(node: Term): string {
    if (isConst(node)) {
        return node.const;
    }

    if (isList(node)) {
        const els = node.elements
        .map(renderFlat)
        .join(", ");

        return `<${els}>`;
    }

    // func
    const params = node.params
        .map(renderFlat)
        .join(", ");

    return `${node.func}(${params})`;
}
