// Support chat: sends messages to the webapp backend and receives agent events over AppSync Events.
// Expects the chat markup (#status, #messages, #composer, #input) on the page.

export const sessionId = crypto.randomUUID();
const userId = localStorage.getItem("userId") ?? crypto.randomUUID();
localStorage.setItem("userId", userId);

const statusEl = document.getElementById("status");
const messagesEl = document.getElementById("messages");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const button = form.querySelector("button");

let hooks = {};
let getDelayMs = () => undefined; // undefined: the backend's default per-step delay

const THINKING_PHRASES = [
  "Thinking",
  "Working on your request",
  "Looking into this",
  "Give me a moment",
  "Checking our systems",
  "Pulling up the details",
  "On it",
  "Reviewing your message",
  "Digging into this",
  "Gathering information",
  "Just a sec",
  "Crunching the details",
  "Connecting the dots",
  "Consulting the team",
  "Running a few checks",
  "Getting that sorted",
  "Hang tight",
  "Searching our records",
  "Putting it together",
  "Almost there",
];
const REPLY_TIMEOUT_MS = 60_000;

let online = false;
let thinkingEl = null; // shown from send until the agent's final reply
let thinkingTimer;

// New messages go above the "thinking" indicator so it stays at the bottom.
function addMessage(role, text) {
  const li = document.createElement("li");
  li.className = `message message--${role}`;
  li.textContent = text;
  messagesEl.insertBefore(li, thinkingEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updateComposer() {
  input.disabled = button.disabled = !online || thinkingEl !== null;
  if (!input.disabled) input.focus();
}

function setStatus(state, label) {
  statusEl.className = `status status--${state}`;
  statusEl.textContent = label;
  online = state === "online";
  updateComposer();
}

function startThinking() {
  const phrase = THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)];
  thinkingEl = document.createElement("li");
  thinkingEl.className = "message message--thinking";
  thinkingEl.innerHTML = `<span></span><span class="dots"><i></i><i></i><i></i></span>`;
  thinkingEl.firstChild.textContent = phrase;
  messagesEl.append(thinkingEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  updateComposer();

  thinkingTimer = setTimeout(() => {
    stopThinking();
    addMessage("system", "This is taking longer than expected. Please try again.");
  }, REPLY_TIMEOUT_MS);
}

function stopThinking() {
  clearTimeout(thinkingTimer);
  thinkingEl?.remove();
  thinkingEl = null;
  updateComposer();
}

// Events: { type: "trace", step, ... } for the architecture view, or { type: "progress" | "final", text }.
let renderChain = Promise.resolve();

function handleAgentEvent(event) {
  if (event.type === "trace") return hooks.onTrace?.(event);
  // onAgentEvent may return a promise (the architecture view resolves it when its animation
  // reaches the browser); messages render after it, in arrival order.
  renderChain = renderChain
    .then(() => hooks.onAgentEvent?.(event))
    .catch(console.error)
    .then(() => renderAgentEvent(event));
}

function renderAgentEvent({ type, text }) {
  if (type === "progress") {
    addMessage("progress", text);
  } else {
    stopThinking();
    addMessage("agent", text);
  }
}

function base64Url(obj) {
  return btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Subscribe to this session's channel on AppSync Events; agent replies arrive here.
// The server answers 401 once the session cookie is missing or expired.
function redirectToLogin() {
  window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
}

async function subscribe() {
  const configRes = await fetch("/api/config");
  if (configRes.status === 401) return redirectToLogin();
  const { httpDomain, realtimeDomain, apiKey } = await configRes.json();
  const authorization = { host: httpDomain, "x-api-key": apiKey };
  const subscriptionId = crypto.randomUUID();

  const socket = new WebSocket(`wss://${realtimeDomain}/event/realtime`, [
    "aws-appsync-event-ws",
    `header-${base64Url(authorization)}`,
  ]);

  socket.onopen = () => socket.send(JSON.stringify({ type: "connection_init" }));
  socket.onclose = () => setStatus("offline", "Disconnected — reload to reconnect");

  socket.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    switch (msg.type) {
      case "connection_ack":
        socket.send(JSON.stringify({
          type: "subscribe",
          id: subscriptionId,
          channel: `/sessions/${sessionId}`,
          authorization,
        }));
        break;
      case "subscribe_success":
        setStatus("online", "Online");
        break;
      case "data":
        for (const event of [].concat(msg.event)) {
          handleAgentEvent(JSON.parse(event));
        }
        break;
      case "subscribe_error":
      case "broadcast_error":
      case "error":
        console.error(msg);
        break;
    }
  };
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const customerMessage = input.value.trim();
  if (!customerMessage) return;

  input.value = "";
  addMessage("customer", customerMessage);
  startThinking();
  hooks.onSend?.(customerMessage);

  const ok = await sendMessage(customerMessage).catch(() => false);
  if (!ok) {
    hooks.onSendFailed?.();
    stopThinking();
    addMessage("system", "Message failed to send. Please try again.");
  }
});

// The backend streams one JSON event per line (workflow steps 1-3) while it enqueues the message.
async function sendMessage(customerMessage) {
  const res = await fetch("/api/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, sessionId, customerMessage, delayMs: getDelayMs() }),
  });
  if (res.status === 401) return redirectToLogin();
  if (!res.ok) return false;

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return true;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines.filter(Boolean)) {
      const event = JSON.parse(line);
      if (event.type === "error") return false;
      handleAgentEvent(event);
    }
  }
}

/**
 * Starts the chat. Optional hooks observe the message lifecycle:
 * onSend(text), onTrace({ step, ... }), onSendFailed(), onAgentEvent({ type, text }).
 * `delayMs` returns the per-step delay to send with each message.
 */
export function initChat({ delayMs, ...chatHooks } = {}) {
  hooks = chatHooks;
  if (delayMs) getDelayMs = delayMs;
  addMessage("agent", "Hi! 👋 Welcome to VoltBay support. How can we help you today?");
  subscribe().catch((err) => {
    console.error(err);
    setStatus("offline", "Failed to connect");
  });
}
