// app.js
// Wires together graph-data.js (data), dijkstra.js (algorithm trace) and
// three.js (rendering). Also owns the camera "director", the step player,
// and the Web Speech narration.

/* ------------------------------------------------------------------ */
/*  Colors                                                              */
/* ------------------------------------------------------------------ */

const COLOR = {
  idle: 0x6b7280,
  source: 0xe63946,
  frontier: 0xffb703,
  finalized: 0x2a9d8f,
  edgeIdle: 0x3a4658,
  edgeCompare: 0xffd166,
  edgeRelax: 0x06d6a0,
  edgeReject: 0x5a3a3a,
  edgePath: 0x4cc9f0,
};

/* ------------------------------------------------------------------ */
/*  Text sprite helper (canvas-based labels that face the camera)      */
/* ------------------------------------------------------------------ */

class Label {
  constructor(text, { fontSize = 48, color = "#dbe2ef", scale = 1.6 } = {}) {
    this.fontSize = fontSize;
    this.color = color;
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.texture = new THREE.CanvasTexture(this.canvas);
    const material = new THREE.SpriteMaterial({
      map: this.texture,
      depthTest: false,
      transparent: true,
    });
    this.sprite = new THREE.Sprite(material);
    this.baseScale = scale;
    this.setText(text);
  }

  setText(text, color = this.color) {
    this.color = color;
    const ctx = this.ctx;
    const padding = 16;
    ctx.font = `600 ${this.fontSize}px 'IBM Plex Mono', monospace`;
    const width = Math.ceil(ctx.measureText(text).width) + padding * 2;
    const height = this.fontSize + padding * 2;
    this.canvas.width = width;
    this.canvas.height = height;
    // re-set font after resizing canvas (resizing clears context state)
    ctx.font = `600 ${this.fontSize}px 'IBM Plex Mono', monospace`;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(10, 13, 20, 0.72)";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(0, 0, width, height, 6) : ctx.rect(0, 0, width, height);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.fillText(text, padding, height / 2);
    this.texture.needsUpdate = true;
    const aspect = width / height;
    this.sprite.scale.set(this.baseScale * aspect, this.baseScale, 1);
  }
}

/* ------------------------------------------------------------------ */
/*  Scene setup                                                        */
/* ------------------------------------------------------------------ */

const viewport = document.getElementById("viewport");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d14);
scene.fog = new THREE.FogExp2(0x0a0d14, 0.012);

const camera = new THREE.PerspectiveCamera(
  55,
  viewport.clientWidth / viewport.clientHeight,
  0.1,
  1000
);
camera.position.set(6, 8, 22);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
viewport.insertBefore(renderer.domElement, viewport.firstChild);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;
controls.minDistance = 4;
controls.maxDistance = 60;

scene.add(new THREE.AmbientLight(0x8899aa, 0.7));
const key = new THREE.DirectionalLight(0xffffff, 0.8);
key.position.set(10, 20, 10);
scene.add(key);
const rim = new THREE.PointLight(0x4cc9f0, 0.6, 100);
rim.position.set(-15, -10, -10);
scene.add(rim);

// subtle starfield backdrop for depth cues
{
  const starGeo = new THREE.BufferGeometry();
  const starCount = 600;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount * 3; i++) positions[i] = (Math.random() - 0.5) * 200;
  starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const starMat = new THREE.PointsMaterial({ color: 0x2a3548, size: 0.6, transparent: true, opacity: 0.6 });
  scene.add(new THREE.Points(starGeo, starMat));
}

/* ------------------------------------------------------------------ */
/*  Build graph geometry                                               */
/* ------------------------------------------------------------------ */

const nodeMeshes = {};   // id -> THREE.Mesh
const nodeLabels = {};   // id -> Label (letter, static)
const distLabels = {};   // id -> Label (live distance readout)
const edgeLines = {};    // "A-B" -> { line, material, weightLabel }
const nodeGroup = new THREE.Group();
scene.add(nodeGroup);

function edgeKey(a, b) {
  return [a, b].sort().join("-");
}

function vecFor(id) {
  const n = GRAPH.nodes.find((n) => n.id === id);
  return new THREE.Vector3(...n.pos);
}

GRAPH.edges.forEach(({ a, b, w }) => {
  const pa = vecFor(a);
  const pb = vecFor(b);
  const geometry = new THREE.BufferGeometry().setFromPoints([pa, pb]);
  const material = new THREE.LineBasicMaterial({ color: COLOR.edgeIdle, transparent: true, opacity: 0.7 });
  const line = new THREE.Line(geometry, material);
  nodeGroup.add(line);

  const mid = pa.clone().lerp(pb, 0.5);
  const weightLabel = new Label(String(w), { fontSize: 34, color: "#77869c", scale: 0.9 });
  weightLabel.sprite.position.copy(mid);
  nodeGroup.add(weightLabel.sprite);

  edgeLines[edgeKey(a, b)] = { line, material, weightLabel };
});

GRAPH.nodes.forEach((n) => {
  const geometry = new THREE.SphereGeometry(0.55, 32, 32);
  const material = new THREE.MeshStandardMaterial({
    color: COLOR.idle,
    emissive: 0x000000,
    roughness: 0.4,
    metalness: 0.2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...n.pos);
  mesh.userData.id = n.id;
  nodeGroup.add(mesh);
  nodeMeshes[n.id] = mesh;

  const label = new Label(n.label, { fontSize: 40, color: "#dbe2ef", scale: 1.1 });
  label.sprite.position.set(n.pos[0], n.pos[1] + 1.0, n.pos[2]);
  nodeGroup.add(label.sprite);
  nodeLabels[n.id] = label;

  const distLabel = new Label("\u221E", { fontSize: 34, color: "#77869c", scale: 0.95 });
  distLabel.sprite.position.set(n.pos[0], n.pos[1] - 1.0, n.pos[2]);
  nodeGroup.add(distLabel.sprite);
  distLabels[n.id] = distLabel;
});

function setNodeColor(id, hex) {
  nodeMeshes[id].material.color.setHex(hex);
  nodeMeshes[id].material.emissive.setHex(hex);
  nodeMeshes[id].material.emissiveIntensity = 0.35;
}

function setEdgeColor(a, b, hex, opacity = 0.9) {
  const e = edgeLines[edgeKey(a, b)];
  e.material.color.setHex(hex);
  e.material.opacity = opacity;
}

function resetVisuals() {
  GRAPH.nodes.forEach((n) => {
    setNodeColor(n.id, COLOR.idle);
    nodeMeshes[n.id].scale.setScalar(1);
    distLabels[n.id].setText("\u221E", "#77869c");
  });
  GRAPH.edges.forEach(({ a, b }) => setEdgeColor(a, b, COLOR.edgeIdle, 0.7));
}

/* ------------------------------------------------------------------ */
/*  Camera director -- smooth focus moves, doesn't fight manual orbit  */
/* ------------------------------------------------------------------ */

const cameraDirector = {
  active: false,
  target: new THREE.Vector3(),
  lookAt: new THREE.Vector3(),
  focus(nodeId, distance = 6) {
    if (!document.getElementById("auto-camera").checked) return;
    const p = vecFor(nodeId);
    const dir = p.clone().normalize().multiplyScalar(distance);
    // offset so the camera doesn't sit exactly on top of the node
    this.target.copy(p).add(dir).add(new THREE.Vector3(2, 1.5, 2));
    this.lookAt.copy(p);
    this.active = true;
    controls.autoRotate = false;
  },
  release() {
    this.active = false;
    if (document.getElementById("auto-camera").checked) controls.autoRotate = true;
  },
  update() {
    if (!this.active) return;
    camera.position.lerp(this.target, 0.04);
    controls.target.lerp(this.lookAt, 0.06);
    if (camera.position.distanceTo(this.target) < 0.15) this.active = false;
  },
};

/* ------------------------------------------------------------------ */
/*  Narration (Web Speech API)                                         */
/* ------------------------------------------------------------------ */

const synth = window.speechSynthesis;

function speak(text) {
  return new Promise((resolve) => {
    const muted = document.getElementById("mute-narration").checked;
    document.getElementById("caption-bar").textContent = text;
    if (muted || !synth) {
      const fallbackMs = Math.max(900, text.length * 35) / speedMultiplier();
      setTimeout(resolve, fallbackMs);
      return;
    }
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = speedMultiplier();
    utter.pitch = 1.0;
    utter.onend = resolve;
    utter.onerror = resolve;
    synth.speak(utter);
  });
}

function speedMultiplier() {
  return parseFloat(document.getElementById("speed").value);
}

/* ------------------------------------------------------------------ */
/*  Narration text generation per event                                */
/* ------------------------------------------------------------------ */

function narrate(ev) {
  switch (ev.type) {
    case "init":
      return `Starting Dijkstra's algorithm from node ${ev.source}. Every distance is set to infinity except the source, which is zero.`;
    case "select":
      return `Node ${ev.node} has the smallest tentative distance among unvisited nodes, ${fmt(ev.dist)}. Selecting it for processing.`;
    case "compare": {
      const base = `Checking the edge from ${ev.from} to ${ev.to}, weight ${ev.weight}. That's ${fmt(ev.candidate - ev.weight)} plus ${ev.weight}, equals ${fmt(ev.candidate)}.`;
      if (ev.improved) {
        return `${base} Current best to ${ev.to} is ${fmt(ev.current)}, so this is an improvement.`;
      }
      return `${base} Current best to ${ev.to} is already ${fmt(ev.current)}, so this path doesn't help.`;
    }
    case "relax":
      return `Updating the distance to ${ev.node} to ${fmt(ev.newDist)}, reached through ${ev.via}.`;
    case "finalize":
      return `Node ${ev.node} is finalized. Its shortest distance from the source is ${fmt(ev.dist)}.`;
    case "unreachable":
      return `The remaining nodes are not reachable from the source, so the algorithm stops here.`;
    case "done":
      return `All reachable nodes are finalized. The shortest path tree is complete.`;
    default:
      return "";
  }
}

function fmt(v) {
  return v === Infinity ? "infinity" : String(v);
}

/* ------------------------------------------------------------------ */
/*  Step player                                                        */
/* ------------------------------------------------------------------ */

let playState = { events: [], index: 0, playing: false, prevMap: {} };
const comparePanel = document.getElementById("compare-panel");

function updateDistTable(distMap) {
  const rows = GRAPH.nodes
    .map((n) => {
      const v = distMap[n.id];
      const cls = v === Infinity ? "dist-inf" : v === 0 ? "" : "dist-final";
      return `<tr><td>${n.id}</td><td class="${cls}">${fmt(v)}</td></tr>`;
    })
    .join("");
  document.getElementById("dist-table").innerHTML = rows;
}

function showCompare(ev) {
  comparePanel.style.display = "block";
  const verdict = ev.improved
    ? `<span class="cmp-yes">&#10003; improves ${fmt(ev.current)} &rarr; ${fmt(ev.candidate)}</span>`
    : `<span class="cmp-no">&#10005; no improvement (${fmt(ev.current)} stays)</span>`;
  comparePanel.innerHTML = `
    <div class="title">RELAXATION CHECK</div>
    <div class="line">dist[${ev.from}] + w(${ev.from},${ev.to})</div>
    <div class="line">= ${fmt(ev.candidate - ev.weight)} + ${ev.weight} = ${fmt(ev.candidate)}</div>
    <div class="line">vs dist[${ev.to}] = ${fmt(ev.current)}</div>
    <div class="line">${verdict}</div>
  `;
}

const runningDist = {};

async function applyEvent(ev) {
  switch (ev.type) {
    case "init": {
      GRAPH.nodes.forEach((n) => (runningDist[n.id] = Infinity));
      runningDist[ev.source] = 0;
      setNodeColor(ev.source, COLOR.source);
      distLabels[ev.source].setText("0", "#e63946");
      updateDistTable(runningDist);
      comparePanel.style.display = "none";
      break;
    }
    case "select": {
      setNodeColor(ev.node, COLOR.frontier);
      nodeMeshes[ev.node].scale.setScalar(1.35);
      cameraDirector.focus(ev.node);
      break;
    }
    case "compare": {
      setEdgeColor(ev.from, ev.to, ev.improved ? COLOR.edgeRelax : COLOR.edgeCompare, 1.0);
      showCompare(ev);
      break;
    }
    case "relax": {
      runningDist[ev.node] = ev.newDist;
      distLabels[ev.node].setText(String(ev.newDist), "#ffb703");
      updateDistTable(runningDist);
      break;
    }
    case "finalize": {
      setNodeColor(ev.node, COLOR.finalized);
      nodeMeshes[ev.node].scale.setScalar(1.0);
      distLabels[ev.node].setText(String(ev.dist), "#2a9d8f");
      comparePanel.style.display = "none";
      break;
    }
    case "done": {
      cameraDirector.release();
      controls.autoRotate = document.getElementById("auto-camera").checked;
      break;
    }
  }
}

async function playFrom(index) {
  playState.playing = true;
  document.getElementById("play-pause").textContent = "Pause";
  for (let i = index; i < playState.events.length; i++) {
    if (!playState.playing) {
      playState.index = i;
      return;
    }
    const ev = playState.events[i];
    await applyEvent(ev);
    await speak(narrate(ev));
    playState.index = i + 1;
  }
  document.getElementById("play-pause").textContent = "Play";
  playState.playing = false;
}

function pause() {
  playState.playing = false;
  synth && synth.cancel();
  document.getElementById("play-pause").textContent = "Play";
}

function resetSimulation() {
  pause();
  resetVisuals();
  cameraDirector.release();
  comparePanel.style.display = "none";
  document.getElementById("caption-bar").textContent =
    "Pick a source node and press Play to start the simulation.";
  const source = document.getElementById("source-select").value;
  const { events } = runDijkstra(GRAPH, source);
  playState = { events, index: 0, playing: false };
  GRAPH.nodes.forEach((n) => (runningDist[n.id] = Infinity));
  updateDistTable(runningDist);
}

/* ------------------------------------------------------------------ */
/*  UI wiring                                                           */
/* ------------------------------------------------------------------ */

const sourceSelect = document.getElementById("source-select");
GRAPH.nodes.forEach((n) => {
  const opt = document.createElement("option");
  opt.value = n.id;
  opt.textContent = n.id;
  sourceSelect.appendChild(opt);
});

document.getElementById("play-pause").addEventListener("click", () => {
  if (playState.playing) {
    pause();
  } else {
    playFrom(playState.index);
  }
});

document.getElementById("step-fwd").addEventListener("click", async () => {
  if (playState.index >= playState.events.length) return;
  pause();
  const ev = playState.events[playState.index];
  await applyEvent(ev);
  document.getElementById("caption-bar").textContent = narrate(ev);
  playState.index++;
});

document.getElementById("reset").addEventListener("click", resetSimulation);
sourceSelect.addEventListener("change", resetSimulation);

document.getElementById("auto-camera").addEventListener("change", (e) => {
  if (!e.target.checked) {
    cameraDirector.release();
    controls.autoRotate = false;
  }
});

// Clicking a node: manual "zoom into a node" + (if run finished) highlight path from source
renderer.domElement.addEventListener("click", (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(Object.values(nodeMeshes));
  if (!hits.length) return;
  const id = hits[0].object.userData.id;
  cameraDirector.focus(id, 4.5);

  const finished = playState.index >= playState.events.length && playState.events.length > 0;
  if (finished) {
    const doneEvent = playState.events[playState.events.length - 1];
    const source = sourceSelect.value;
    const path = reconstructPath(doneEvent.prev, source, id);
    GRAPH.edges.forEach(({ a, b }) => setEdgeColor(a, b, COLOR.edgeIdle, 0.5));
    if (path && path.length > 1) {
      for (let i = 0; i < path.length - 1; i++) {
        setEdgeColor(path[i], path[i + 1], COLOR.edgePath, 1.0);
      }
      document.getElementById("caption-bar").textContent =
        `Shortest path ${source} \u2192 ${id}: ${path.join(" \u2192 ")} (total ${fmt(doneEvent.dist[id])})`;
    } else {
      document.getElementById("caption-bar").textContent = `${id} is not reachable from ${source}.`;
    }
  }
});

/* ------------------------------------------------------------------ */
/*  Render loop                                                        */
/* ------------------------------------------------------------------ */

function onResize() {
  camera.aspect = viewport.clientWidth / viewport.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
}
window.addEventListener("resize", onResize);

function animate() {
  requestAnimationFrame(animate);
  cameraDirector.update();
  controls.update();
  renderer.render(scene, camera);
}

resetSimulation();
animate();