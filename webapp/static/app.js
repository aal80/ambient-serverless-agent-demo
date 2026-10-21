import { initChat } from "./chat.js";

initChat();

const input = document.getElementById("input");
const launcher = document.getElementById("launcher");

function setMinimized(minimized) {
  document.body.classList.toggle("chat-minimized", minimized);
  launcher.hidden = !minimized;
  if (!minimized) input.focus();
}

document.getElementById("minimize").addEventListener("click", () => setMinimized(true));
launcher.addEventListener("click", () => setMinimized(false));
