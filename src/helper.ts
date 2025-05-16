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