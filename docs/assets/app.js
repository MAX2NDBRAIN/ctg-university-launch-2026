"use strict";

const FIREBASE_DATABASE_URL =
  "https://ctg-university-launch-2026-default-rtdb.asia-southeast1.firebasedatabase.app";
const STATUS_ENDPOINT = `${FIREBASE_DATABASE_URL}/launch_status.json`;
const NAME_KEY = "ctg-name";
const STATUS_KEY = "ctg-launch-status";
const CHANNEL_NAME = "ctg-university-launch";
const page = document.body.dataset.page;
const root = document.body.dataset.root || "./";

function navigate(path) {
  window.location.assign(`${root}${path}/`);
}

function getName() {
  return window.localStorage.getItem(NAME_KEY)?.trim() || "";
}

function requireName() {
  const name = getName();
  if (!name) {
    window.location.replace(root);
    return null;
  }
  return name;
}

async function readLaunchStatus() {
  const response = await fetch(STATUS_ENDPOINT, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to read launch status");
  return (await response.json()) === "launched" ? "launched" : "waiting";
}

async function writeLaunchStatus(status) {
  const response = await fetch(STATUS_ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(status),
  });
  if (!response.ok) throw new Error("Unable to send launch signal");
  window.localStorage.setItem(STATUS_KEY, status);
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(status);
    channel.close();
  }
}

function startLaunchListener(onLaunch) {
  let launched = false;
  let stream;
  let channel;
  const announce = (status) => {
    if (status !== "launched" || launched) return;
    launched = true;
    onLaunch();
  };
  const refresh = () => readLaunchStatus().then(announce).catch(() => undefined);
  void refresh();
  const poller = window.setInterval(refresh, 2500);
  try {
    stream = new EventSource(STATUS_ENDPOINT);
    const receive = (event) => {
      try {
        const payload = JSON.parse(event.data);
        announce(payload.data);
      } catch {
        // Polling remains active as a reliability fallback.
      }
    };
    stream.addEventListener("put", receive);
    stream.addEventListener("patch", receive);
  } catch {
    // Polling remains active on browsers without EventSource support.
  }
  if ("BroadcastChannel" in window) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event) => announce(event.data);
  }
  window.addEventListener("storage", (event) => {
    if (event.key === STATUS_KEY) announce(event.newValue);
  });
  return () => {
    window.clearInterval(poller);
    stream?.close();
    channel?.close();
  };
}

function initHome() {
  const form = document.querySelector("#entry-form");
  const input = document.querySelector("#name");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      input.focus();
      return;
    }
    window.localStorage.setItem(NAME_KEY, name);
    navigate("waiting");
  });
}

function initWaiting() {
  const name = requireName();
  if (!name) return;
  document.querySelector("#guest-name").textContent = name;
  startLaunchListener(() => navigate("launch"));
}

function initAdmin() {
  const launchButton = document.querySelector("#launch-button");
  const dialog = document.querySelector("#confirm-dialog");
  const cancel = document.querySelector("#cancel-launch");
  const confirm = document.querySelector("#confirm-launch");
  const panel = document.querySelector("#admin-panel");
  launchButton?.addEventListener("click", () => dialog.showModal());
  cancel?.addEventListener("click", () => dialog.close());
  dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  confirm?.addEventListener("click", async () => {
    confirm.disabled = true;
    confirm.textContent = "Sending…";
    try {
      await writeLaunchStatus("launched");
      dialog.close();
      panel.innerHTML = `
        <p class="eyebrow">Ceremony Control</p>
        <div class="launch-sent" role="status">
          <span class="launch-sent-icon">✓</span>
          <strong>Launch signal sent</strong>
          <p>All connected screens are now beginning the ceremony.</p>
        </div>`;
    } catch {
      confirm.disabled = false;
      confirm.textContent = "Yes, launch now";
      document.querySelector("#admin-error").hidden = false;
    }
  });
}

function initLaunch() {
  if (!requireName()) return;
  const scenes = [
    { kicker: "CTG University", lines: ["Officially", "Launched"], tone: "white" },
    { kicker: "Entry Level", lines: ["Unlocking…"], tone: "white", loading: true },
    { kicker: "Entry Level", lines: ["Unlocked"], tone: "lime", unlocked: true },
    { kicker: "Next Destination", lines: ["Bronze", "Level"], tone: "bronze" },
    { kicker: "Welcome To", lines: ["CTG", "University"], tone: "white" },
    { kicker: "You Are", lines: ["The Founding", "Batch"], tone: "lime" },
  ];
  const sceneRoot = document.querySelector("#scene-root");
  const progress = document.querySelector("#scene-progress");
  const duration = 2400;
  function render(index) {
    const scene = scenes[index];
    sceneRoot.innerHTML = `
      ${scene.unlocked ? '<div class="unlock-orbit" aria-hidden="true"><span></span><span></span></div>' : ""}
      <p class="scene-kicker">${scene.kicker}</p>
      <h1 class="scene-title tone-${scene.tone}">${scene.lines.map((line) => `<span>${line}</span>`).join("")}</h1>
      ${scene.loading ? '<div class="unlock-meter" aria-hidden="true"><span></span></div>' : '<div class="down-mark" aria-hidden="true">↓</div>'}`;
    progress.innerHTML = scenes
      .map((_, itemIndex) => `<span class="${itemIndex <= index ? "active" : ""}"></span>`)
      .join("");
  }
  render(0);
  scenes.slice(1).forEach((_, index) => {
    window.setTimeout(() => render(index + 1), duration * (index + 1));
  });
  window.setTimeout(() => navigate("dashboard"), duration * scenes.length);
}

function initDashboard() {
  const name = requireName();
  if (!name) return;
  document.querySelector("#dashboard-name").textContent = name;
}

({ home: initHome, waiting: initWaiting, admin: initAdmin, launch: initLaunch, dashboard: initDashboard }[page] || (() => undefined))();
