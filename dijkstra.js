// dijkstra.js
// Runs Dijkstra's algorithm and returns a flat list of "events" describing
// every decision the algorithm makes. The renderer just plays this list back --
// none of the algorithm's logic lives in the 3D/UI code. This separation is
// deliberate: it makes the algorithm easy to verify/test on its own, and makes
// the animation just a "player" for a trace that is already known to be correct.

function buildAdjacency(graph) {
  const adj = {};
  graph.nodes.forEach((n) => (adj[n.id] = []));
  graph.edges.forEach(({ a, b, w }) => {
    adj[a].push({ to: b, w });
    adj[b].push({ to: a, w });
  });
  return adj;
}

/**
 * @param {object} graph - { nodes: [{id}], edges: [{a,b,w}] }
 * @param {string} sourceId
 * @returns {{events: object[], dist: object, prev: object}}
 */
function runDijkstra(graph, sourceId) {
  const adj = buildAdjacency(graph);
  const dist = {};
  const prev = {};
  const visited = new Set();
  const events = [];

  graph.nodes.forEach((n) => (dist[n.id] = Infinity));
  dist[sourceId] = 0;

  events.push({
    type: "init",
    source: sourceId,
    dist: { ...dist },
  });

  while (visited.size < graph.nodes.length) {
    // Pick the unvisited node with the smallest tentative distance.
    let u = null;
    let best = Infinity;
    for (const n of graph.nodes) {
      if (!visited.has(n.id) && dist[n.id] < best) {
        best = dist[n.id];
        u = n.id;
      }
    }

    // No reachable unvisited node left -> stop (disconnected remainder).
    if (u === null) {
      events.push({ type: "unreachable", remaining: graph.nodes.map(n => n.id).filter(id => !visited.has(id)) });
      break;
    }

    events.push({ type: "select", node: u, dist: dist[u] });

    for (const { to: v, w } of adj[u]) {
      if (visited.has(v)) continue;
      const candidate = dist[u] + w;
      const current = dist[v];
      const improved = candidate < current;

      events.push({
        type: "compare",
        from: u,
        to: v,
        weight: w,
        candidate,
        current,
        improved,
      });

      if (improved) {
        dist[v] = candidate;
        prev[v] = u;
        events.push({ type: "relax", node: v, newDist: candidate, via: u });
      }
    }

    visited.add(u);
    events.push({ type: "finalize", node: u, dist: dist[u] });
  }

  events.push({ type: "done", dist: { ...dist }, prev: { ...prev } });

  return { events, dist, prev };
}

/** Reconstructs the shortest path from source to target using `prev`. */
function reconstructPath(prev, sourceId, targetId) {
  if (sourceId === targetId) return [sourceId];
  const path = [targetId];
  let cur = targetId;
  while (cur !== sourceId) {
    cur = prev[cur];
    if (cur === undefined) return null; // unreachable
    path.push(cur);
  }
  return path.reverse();
}