// Architecture view: animates the 12 workflow steps of each chat message. Every step is reported
// by the component doing the work — steps 1-3 by the web backend (streamed HTTP response), 4-11 by
// the consumer (AppSync trace events) — and step 12 is the reply arriving over the WebSocket.

import { initChat, sessionId } from "./chat.js";

const SVG_NS = "http://www.w3.org/2000/svg";
// Hop duration grows with distance (constant speed), so long routes such as the
// AppSync -> Browser return path don't flash by. "Add delay" also halves the speed.
const HOP_BASE_MS = 400;
const HOP_MS_PER_PX = 1.6;
const DELAYED_SLOWDOWN = 2;
const DELAY_MS = 1000; // per-step delay with "Add delay" checked
const NO_DELAY_MS = 100;
const REQUEST = "#38bdf8";
const RESPONSE = "#4ade80";
const AGENT = "#a78bfa";

const arch = document.getElementById("arch");
const svg = document.getElementById("arch-lines");
const logEl = document.getElementById("log");
const delayInput = document.getElementById("delay");
const node = (id) => document.getElementById(`node-${id}`);

const TOOL_NODES = { tech_support: "tool-support", order_system: "tool-orders", payments: "tool-payments" };
const SPINE = ["browser", "web", "producer", "kafka", "consumer", "appsync"];
const AGENT_LINKS = ["bedrock", ...Object.values(TOOL_NODES)];

document.getElementById("appsync-channel").textContent = `channel /sessions/${sessionId.slice(0, 8)}…`;

// --- Geometry -------------------------------------------------------------------------------

function box(id) {
  const a = arch.getBoundingClientRect();
  const r = node(id).getBoundingClientRect();
  return { left: r.left - a.left, right: r.right - a.left, top: r.top - a.top, bottom: r.bottom - a.top,
    cx: r.left - a.left + r.width / 2, cy: r.top - a.top + r.height / 2 };
}

// Polyline between two nodes: down the spine, agent <-> Bedrock/tools, or up the return rail.
function route(from, to) {
  if (from === "appsync" && to === "browser") {
    const s = box("appsync"), b = box("browser"), railX = 22;
    return [[s.left, s.cy], [railX, s.cy], [railX, b.cy], [b.left, b.cy]];
  }
  if (from === "agent" && to === "bedrock") {
    const a = box("agent"), b = box("bedrock");
    return [[a.right, a.cy], [b.left, b.cy]];
  }
  if (from === "agent" && AGENT_LINKS.includes(to)) {
    const a = box("agent"), t = box(to);
    return [[t.cx, a.bottom], [t.cx, t.top]];
  }
  if (to === "agent") return route("agent", from).reverse();
  const a = box(from), b = box(to);
  return [[a.cx, a.bottom], [b.cx, b.top]];
}

// Lines up Bedrock's vertical center with the AI agent's, which sits inside the consumer box.
function alignBedrock() {
  const bedrock = node("bedrock");
  bedrock.style.marginTop = "0px";
  bedrock.style.marginTop = `${box("agent").cy - box("bedrock").cy}px`;
}

// Separate layers: redrawing the lines (on every resize) must not remove packets in flight.
const linesLayer = document.createElementNS(SVG_NS, "g");
const packetsLayer = document.createElementNS(SVG_NS, "g");
svg.append(linesLayer, packetsLayer);

function drawLines() {
  alignBedrock();
  linesLayer.innerHTML = `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5"
    orient="auto-start-reverse"><path class="arrowhead" d="M0,0 L10,5 L0,10 z"/></marker></defs>`;
  const line = (points, { both = false, dashed = false } = {}) => {
    const el = document.createElementNS(SVG_NS, "polyline");
    el.setAttribute("points", points.map((p) => p.join(",")).join(" "));
    el.setAttribute("class", `line${dashed ? " line--return" : ""}`);
    el.setAttribute("marker-end", "url(#arrow)");
    if (both) el.setAttribute("marker-start", "url(#arrow)");
    linesLayer.append(el);
  };
  for (let i = 0; i < SPINE.length - 1; i++) line(route(SPINE[i], SPINE[i + 1]));
  for (const target of AGENT_LINKS) line(route("agent", target), { both: true });
  const ret = route("appsync", "browser");
  line(ret, { dashed: true });

  const label = document.createElementNS(SVG_NS, "text");
  label.setAttribute("class", "line-label");
  label.setAttribute("transform", `translate(14, ${(ret[1][1] + ret[2][1]) / 2}) rotate(-90)`);
  label.setAttribute("text-anchor", "middle");
  label.textContent = "WebSocket push";
  linesLayer.append(label);
}

// --- Animation primitives ----------------------------------------------------------------------

function measure(from, to) {
  const points = route(from, to);
  const segments = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  return { points, segments, total: segments.reduce((a, b) => a + b, 0) };
}

// Moves a glowing dot along the route, highlighting both ends.
function hop(from, to, color) {
  const { points: [origin], total: initialTotal } = measure(from, to);
  const duration = (HOP_BASE_MS + initialTotal * HOP_MS_PER_PX) * (delayInput.checked ? DELAYED_SLOWDOWN : 1);

  const dot = document.createElementNS(SVG_NS, "circle");
  // Positioned before it's added: otherwise it renders at the SVG origin (top-left) for a frame.
  dot.setAttribute("cx", origin[0]);
  dot.setAttribute("cy", origin[1]);
  dot.setAttribute("r", 7);
  dot.setAttribute("fill", color);
  dot.setAttribute("class", "packet");
  dot.style.color = color;
  packetsLayer.append(dot);
  node(from).classList.add("active");

  return new Promise((resolve) => {
    const start = performance.now();
    const frame = (now) => {
      const t = Math.min((now - start) / duration, 1);
      // Re-measured every frame so the dot stays on its line if the layout shifts mid-flight.
      const { points, segments, total } = measure(from, to);
      let d = (1 - (1 - t) ** 2) * total; // ease-out
      let i = 0;
      while (i < segments.length - 1 && d > segments[i]) d -= segments[i++];
      const [x0, y0] = points[i], [x1, y1] = points[i + 1];
      const f = segments[i] ? d / segments[i] : 1;
      dot.setAttribute("cx", x0 + (x1 - x0) * f);
      dot.setAttribute("cy", y0 + (y1 - y0) * f);
      if (t < 1) return requestAnimationFrame(frame);
      dot.remove();
      node(from).classList.remove("active");
      flash(to);
      resolve();
    };
    requestAnimationFrame(frame);
  });
}

function flash(id) {
  node(id).classList.add("active");
  setTimeout(() => node(id).classList.remove("active"), 700);
}

function status(id, text) {
  const el = node(id).querySelector(".node__status");
  if (el) el.textContent = text;
}

let t0 = performance.now();
function log(step, html) {
  const li = document.createElement("li");
  const label = step ? `<b>Step ${step}</b> · ` : "";
  li.innerHTML = `<time>+${((performance.now() - t0) / 1000).toFixed(2)}s</time>${label}${html}`;
  logEl.append(li);
  logEl.scrollTop = logEl.scrollHeight;
}

// Animations run one after another so the view follows the real order of events.
let chain = Promise.resolve();
const queue = (fn) => (chain = chain.then(fn).catch(console.error));

// --- Workflow steps ----------------------------------------------------------------------------

let currentTool = null;

const STEPS = {
  1: async () => {
    log(1, "Browser → Web backend: POST /api/messages");
    await hop("browser", "web", REQUEST);
  },
  2: async () => {
    log(2, "Web backend → Support prompt ingestion: Lambda Invoke");
    await hop("web", "producer", REQUEST);
  },
  3: async ({ partition, offset }) => {
    log(3, `Support prompt ingestion → Kafka: record stored at partition ${partition}, offset ${offset}`);
    await hop("producer", "kafka", REQUEST);
    status("kafka", `partition ${partition} · offset ${offset}`);
    status("web", "202 Accepted");
  },
  4: async () => {
    log(4, "Kafka → Consumer: event source mapping delivers the record");
    await hop("kafka", "consumer", REQUEST);
    status("consumer", "record received");
  },
  5: async () => {
    log(5, "Consumer starts the AI agent");
    node("agent").classList.add("working");
    status("consumer", "running agent");
    status("agent", "🤔 What kind of request is this?");
  },
  6: async () => {
    log(6, "Agent → Amazon Bedrock: classify the request");
    await hop("agent", "bedrock", AGENT);
    node("bedrock").classList.add("working");
    status("bedrock", "thinking…");
  },
  7: async ({ category, tool }) => {
    log(7, `Amazon Bedrock → Agent: category = <b>${category}</b>`);
    status("bedrock", "");
    node("bedrock").classList.remove("working");
    await hop("bedrock", "agent", AGENT);
    if (tool) {
      node(TOOL_NODES[tool]).classList.add("selected");
      status("agent", `🧭 Picked ${toolName(tool)}`);
    } else {
      status("agent", "💬 No tool needed");
    }
  },
  8: async ({ tool }) => {
    currentTool = TOOL_NODES[tool];
    log(8, `Agent → ${toolName(tool)}: tool call`);
    await hop("agent", currentTool, AGENT);
  },
  9: async ({ tool }) => {
    log(9, `${toolName(tool)} runs`);
    node(TOOL_NODES[tool]).classList.add("working");
    status("agent", "⏳ Waiting for the tool");
  },
  10: async () => {
    if (currentTool) {
      node(currentTool).classList.remove("working");
      await hop(currentTool, "agent", AGENT);
      currentTool = null;
    }
    log(10, "Agent returns the response to the consumer");
    node("agent").classList.remove("working");
    status("agent", "✅ Response ready");
    flash("consumer");
  },
  11: async () => {
    log(11, "Consumer → AppSync: publish the response (IAM-signed)");
    await hop("consumer", "appsync", RESPONSE);
    status("consumer", "");
  },
};

function toolName(tool) {
  return `Tool: ${node(TOOL_NODES[tool]).lastChild.textContent}`;
}

// Returns every box to its idle look.
function resetDiagram() {
  currentTool = null;
  for (const el of arch.querySelectorAll(".working, .selected, .active")) {
    el.classList.remove("working", "selected", "active");
  }
  for (const el of arch.querySelectorAll(".node__status")) el.textContent = "";
}

function onSend() {
  t0 = performance.now();
  logEl.replaceChildren();
  resetDiagram();
}

function onTrace(event) {
  queue(() => STEPS[event.step]?.(event));
}

// The returned promise resolves when the packet reaches the browser; the chat renders the message then.
function onAgentEvent({ type }) {
  return queue(async () => {
    if (type === "final") {
      log(12, "AppSync → Browser: response delivered over the WebSocket");
      await hop("appsync", "browser", RESPONSE);
      resetDiagram();
    } else {
      log(null, "AppSync → Browser: progress update for the chat");
      await hop("appsync", "browser", RESPONSE);
    }
  });
}

function onSendFailed() {
  queue(() => {
    node("web").classList.add("error");
    status("web", "request failed");
    setTimeout(() => node("web").classList.remove("error"), 2000);
  });
}

function delayMs() {
  return delayInput.checked ? DELAY_MS : NO_DELAY_MS;
}

// --- Example prompts ----------------------------------------------------------------------------

// Clicking a suggestion sends it like a typed message; buttons follow the input's enabled state.
const chatInput = document.getElementById("input");
const suggestions = [...document.querySelectorAll(".suggestions button")];
for (const button of suggestions) {
  button.addEventListener("click", () => {
    chatInput.value = button.textContent;
    document.getElementById("composer").requestSubmit();
  });
}
new MutationObserver(() => {
  for (const button of suggestions) button.disabled = chatInput.disabled;
}).observe(chatInput, { attributes: true, attributeFilter: ["disabled"] });

// --- Start ---------------------------------------------------------------------------------------

drawLines();
new ResizeObserver(drawLines).observe(arch);
initChat({ delayMs, onSend, onTrace, onAgentEvent, onSendFailed });
