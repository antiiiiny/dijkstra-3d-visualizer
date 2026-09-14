// graph-data.js
// A small weighted, undirected graph laid out in 3D space.
// Positions are hand-placed (not a flat grid) so the 3D scene actually
// benefits from being 3D rather than looking like a 2D diagram tilted sideways.

const GRAPH = {
  nodes: [
    { id: "A", label: "A", pos: [-7, 2, -3] },
    { id: "B", label: "B", pos: [-2.5, 4.5, 2] },
    { id: "C", label: "C", pos: [2.5, 5, -2] },
    { id: "D", label: "D", pos: [7, 3, 3] },
    { id: "E", label: "E", pos: [-4.5, -2.5, 4] },
    { id: "F", label: "F", pos: [0, -3.5, -4] },
    { id: "G", label: "G", pos: [4.5, -1, 5] },
    { id: "H", label: "H", pos: [7.5, -4.5, -2] },
  ],
  edges: [
    { a: "A", b: "B", w: 4 },
    { a: "A", b: "E", w: 2 },
    { a: "B", b: "C", w: 5 },
    { a: "B", b: "E", w: 6 },
    { a: "B", b: "F", w: 9 },
    { a: "C", b: "D", w: 3 },
    { a: "C", b: "F", w: 7 },
    { a: "C", b: "G", w: 6 },
    { a: "D", b: "G", w: 4 },
    { a: "D", b: "H", w: 6 },
    { a: "E", b: "F", w: 3 },
    { a: "F", b: "G", w: 5 },
    { a: "F", b: "H", w: 8 },
    { a: "G", b: "H", w: 2 },
  ],
};