export interface ActionText {
    text: string | null;
    bb: DOMRect | null;
}

export function calculateEllipseRadii(sideLength: number, margin: number) {
    return sideLength / 2 + margin;
}

export function calculateCentroid(rect: DOMRect): DOMPoint {
    return new DOMPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
}

export type Vec2 = {
    x: number;
    y: number;
}

export interface Ray {
    o: Vec2;
    d: Vec2;
}

export interface CubicBezierCurve {
    start: Vec2,
    control1: Vec2,
    control2: Vec2,
    end: Vec2
};

export function getCubicBezierCurveGradients(curve: CubicBezierCurve): [Vec2, Vec2] {
    return [
        direction(curve.start, curve.control1),
        direction(curve.control2, curve.end)
    ]
}

// Parse the d attributes of a path into (control) points
// for example <path d="M 10 10 C 20 20, 40 20, 50 10" stroke="black" fill="transparent" />
// has (control) points: (10, 10), (20, 20), (40, 20), (50, 10)
// * Note that the number of (floating point) numbers must be even
export function getPathPoints(path: string): Vec2[] {
    // find all (floating point) numbers
    const numbers = Array.from(path.matchAll(/-?\d+\.?\d*/g), m => parseFloat(m[0]));

    if (numbers.length % 2 === 1)
        throw new Error("The number of (floating point) numbers in \"d\" attribute must be even");

    // pair numbers into Vec2[]
    const points: Vec2[] = Array.from({ length: numbers.length / 2 }, (_, i) => ({
        x: numbers[i * 2],
        y: numbers[i * 2 + 1],
    }));

    return points;
}

// Get the points which defines a cubic Bezier curve
// * Note in case of splines (multiple Bezier curves connected together),
//   only the points which defines the gradients of the start and the end are considered
export function getCubicBezierCurve(path: string): CubicBezierCurve {
    const points = getPathPoints(path);

    if (points.length < 4)
        throw new Error("A cubic Bezier curve needs at least 4 control points");

    return {
        start: points[0],
        control1: points[1],
        control2: points[points.length - 2],
        end: points[points.length - 1]
    };
}

export function parseEdgeTitle(title: string): [number, number] {
    const match = title.match(/^n(\d+)(?::[^->]*)?->n(\d+)(?::[^->]*)?$/);
    if (!match || match.length < 3)
        throw new Error("Invalid edge title format, edge title must contains two node names separated by '->'");

    const from = match[1];
    const to = match[2];
    return [Number(from), Number(to)]
}



export function toVec2(a: DOMPoint): Vec2 {
    return { x: a.x, y: a.y };
}

export function minus(a: Vec2): Vec2 {
    return mult(a, -1);
}

export function add(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x + b.x, y: a.y + b.y };
}

export function dot(a: Vec2, b: Vec2): number {
    return a.x * b.x + a.y * b.y;
}

export function length(a: Vec2): number {
    return Math.sqrt(lengthSqured(a));
}

export function lengthSqured(a: Vec2): number {
    return dot(a, a);
}

export function mult(a: Vec2, s: number): Vec2 {
    return { x: s * a.x, y: s * a.y };
}

// a - b
export function sub(a: Vec2, b: Vec2): Vec2 {
    return add(a, mult(b, -1));
}

// return (normalized) direction from point a to point b
export function direction(a: Vec2, b: Vec2) {
    return normalize(sub(b, a));
}

export function len(a: Vec2) {
    return Math.sqrt(a.x * a.x + a.y * a.y);
}

export function normalize(a: Vec2): Vec2 {
    return mult(a, 1 / len(a))
}

export function traverse(ray: Ray, t: number): Vec2 {
    return add(ray.o, mult(ray.d, t));
}

export interface Ellipse {
    c: Vec2;
    rx: number;
    ry: number;
}

const EPSILON = 1e-6;
// return first intersection position
export function intersect(ray: Ray, { c, rx: a, ry: b }: Ellipse): number | undefined {
    const dx = ray.d.x;
    const dy = ray.d.y;
    // o - c
    const px = ray.o.x - c.x;
    const py = ray.o.y - c.y;
    const A = dx * dx * b * b + dy * dy * a * a;
    const B = 2 * (dx * px * b * b + dy * py * a * a);
    const C = px * px * b * b + py * py * a * a - a * a * b * b;
    const D = B * B - 4 * A * C;
    if (D < 0) {
        return undefined;
    }
    const t1 = (-B + Math.sqrt(D)) / (2 * A);
    const t2 = (-B - Math.sqrt(D)) / (2 * A);

    const t = Math.min(t1, t2);
    if (t < EPSILON) {
        return undefined;
    }

    return t;
}

