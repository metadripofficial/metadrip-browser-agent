console.log("[Metadrip Agent] content.js loaded");

let highlightBoxes = [];
let collectedAddresses = [];
let highlightOn = false;
let observer = null;
let scrollInterval = null;
const solanaAddressRegex = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

function createPersistentOutline(el, color, labelText) {
  const box = document.createElement("div");
  box.className = "metadrip-outline-box";
  box.style.position = "absolute";
  box.style.border = `2px solid ${color}`;
  box.style.borderRadius = "6px";
  box.style.zIndex = "999999";
  box.style.pointerEvents = "none";
  box.style.boxShadow = `0 0 10px ${color}`;
  box.style.transition = "top 0.2s, left 0.2s, width 0.2s, height 0.2s";
  document.body.appendChild(box);

  const label = document.createElement("div");
  label.innerText = labelText;
  label.style.position = "absolute";
  label.style.background = color;
  label.style.color = "#000";
  label.style.fontSize = "10px";
  label.style.fontWeight = "bold";
  label.style.padding = "2px 6px";
  label.style.borderRadius = "4px";
  label.style.zIndex = "999999";
  label.style.pointerEvents = "none";
  document.body.appendChild(label);

  function updatePosition() {
    const r = el.getBoundingClientRect();
    box.style.top = `${r.top + window.scrollY}px`;
    box.style.left = `${r.left + window.scrollX}px`;
    box.style.width = `${r.width}px`;
    box.style.height = `${r.height}px`;

    label.style.top = `${r.top + window.scrollY - 20}px`;
    label.style.left = `${r.left + window.scrollX}px`;
  }

  updatePosition();

  requestAnimationFrame(function track() {
    updatePosition();
    if (document.body.contains(box)) requestAnimationFrame(track);
  });

  highlightBoxes.push({ el, box, label });
}

function clearHighlights() {
  highlightBoxes.forEach(({ box, label }) => {
    box.remove();
    label.remove();
  });
  highlightBoxes = [];
}

function highlightAllTextBlocks() {
  const textElements = Array.from(document.querySelectorAll("p, span, div"));

  for (const el of textElements) {
    if (!el.offsetParent) continue; // hidden
    const text = el.innerText?.trim();
    if (!text || text.length < 20) continue; // skip empty/short

    const isInsideClickable = el.closest(
      'button, a, input[type="button"], input[type="submit"], div[role="button"]'
    );
    if (isInsideClickable) continue;

    createPersistentOutline(el, "#cccccc", `TEXT`);
  }
}

function highlightAllElements() {
  clearHighlights();

  const allClickable = Array.from(
    document.querySelectorAll(
      'button, a[href], input[type="button"], input[type="submit"], div[role="button"]'
    )
  );

  for (const el of allClickable) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role");
    const type = el.getAttribute("type");

    let labelText = "CLICKABLE";
    let color = "#ffffff";

    if (tag === "button") {
      labelText = "BUTTON";
      color = "#ff6f00";
    } else if (tag === "a") {
      labelText = "LINK";
      color = "#00ffe7";
    } else if (type === "submit" || type === "button") {
      labelText = "INPUT";
      color = "#39ff14";
    } else if (role === "button") {
      labelText = "DIV[BTN]";
      color = "#ff2b6d";
    }

    createPersistentOutline(el, color, labelText);
  }

  highlightAllTextBlocks();
  console.log("[Metadrip Agent] Highlighted all elements.");
}

function showFoundAddresses(foundedAddress) {
  const address = document.createElement("div");
  address.innerText = foundedAddress;
  // address.style.position = "absolute";
  // address.style.background = color;
  address.style.color = "#000";
  address.style.fontSize = "10px";
  address.style.fontWeight = "bold";
  address.style.padding = "2px 6px";
  address.style.borderRadius = "4px";
  address.style.zIndex = "999999";
  address.style.pointerEvents = "none";
  document.body.appendChild(address);
}

function toggleHighlight(state) {
  highlightOn = state;
  if (highlightOn) {
    highlightAllElements();

    if (!observer) {
      let lastRefresh = 0;
      const MIN_INTERVAL = 1000;

      observer = new MutationObserver(() => {
        const now = Date.now();
        if (highlightOn && now - lastRefresh > MIN_INTERVAL) {
          highlightAllElements();
          lastRefresh = now;
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    }
  } else {
    clearHighlights();
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }
}

window.addEventListener("message", async (event) => {
  if (!event.data) return;

  // console.log('event.data', event.data)
  if (event.data.type === "TOGGLE_HIGHLIGHT") {
    console.log("event.data.value", event.data.value);
    toggleHighlight(event.data.value);
    return;
  }

  if (event.data.type === "FROM_EXTENSION") {
    console.log("event.data", event.data.instruction);
    toggleHighlight(true);
    startScrolling();
  }

  if (event.data.type === "FROM_EXTENSION_END") {
    console.log("event.data", event.data.type);
    stopScrolling();
    toggleHighlight(false);
  }

  if (event.data.type === "FOUND_ADDRESS") {
    console.log("found text", event.data.text);
    showFoundAddresses(event.data.text);
    // startScrolling();
  }

  const action = event.data.action;
  if (!action || !action.type) return;

  const allClickable = Array.from(
    document.querySelectorAll(
      'button, a[href], input[type="button"], input[type="submit"], div[role="button"]'
    )
  );

  function checkAndAppend(list, value) {
    let flag = false;
    for (const item of list) {
      if (item === value) {
        flag = true;
        break;
      }
    }
    return flag;
  }
  function parseTweets() {
    const tweets = document.querySelectorAll("h3, span, a[href], div, p");
    const links = document.querySelectorAll("a");
    for (const link of links) {
      const href = link.getAttribute("href");
      const matches = href.match(solanaAddressRegex);
      if (matches) {
        console.log("matches", matches);
        for (const match of matches) {
          const result = checkAndAppend(collectedAddresses, match);
          if (!result) {
            collectedAddresses.push(match);
          }
        }
      }
    }
    for (const tweet of tweets) {
      const text = tweet.innerText;
      const matches = text.match(solanaAddressRegex);
      if (matches) {
        console.log("matches", matches);
        for (const match of matches) {
          const result = checkAndAppend(collectedAddresses, match);
          if (!result) {
            collectedAddresses.push(match);
          }
        }
      }
    }
    for (address of collectedAddresses) {
      console.log("address", address);
      chrome.runtime?.sendMessage(
        { type: "FOUND_ADDRESS", address },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "SendMessage error:",
              chrome.runtime.lastError.message
            );
          } else {
            console.log("Message sent successfully");
          }
        }
      );
    }
    console.log("collectedAddresses", collectedAddresses);
  }

  function isAtPageBottom() {
    // Check if the user has scrolled to near bottom (100px threshold) and account for dynamically loaded content
    const scrollPosition = window.innerHeight + window.scrollY;
    const contentHeight = document.body.scrollHeight;
    const bottomThreshold = contentHeight - 100; // 100px threshold from the bottom
    return scrollPosition >= bottomThreshold;
  }

  function startScrolling() {
    if (scrollInterval) return;
    scrollInterval = setInterval(() => {
      // if (isAtPageBottom()) {
      //   // Stop scrolling if bottom reached
      //   stopScrolling();
      //   chrome.runtime.sendMessage({
      //     type: "END_OF_FEED",
      //     message: "end_of_feed",
      //   });
      //   return;
      // }
      window.scrollBy(0, 500);
      parseTweets();
    }, 2000);
  }

  function stopScrolling() {
    if (scrollInterval) {
      clearInterval(scrollInterval);
      scrollInterval = null;
      console.log("Scrolling stopped");
    }
  }

  function getDeepText(el) {
    return Array.from(el.querySelectorAll("*"))
      .map((child) => child.innerText || "")
      .concat(el.innerText || "")
      .join(" ")
      .trim()
      .toLowerCase();
  }

  function scoreElement(el, text) {
    const elText = getDeepText(el);
    const normText = text.toLowerCase().trim();
    if (!elText) return 0;
    if (elText === normText) return 100;
    if (elText.includes(normText)) return 75;

    const words = normText.split(" ");
    const matches = words.filter((w) => elText.includes(w));
    return (matches.length / words.length) * 50;
  }

  let bestMatch = null;
  let bestScore = 0;

  for (const el of allClickable) {
    const score = scoreElement(el, action.text || "");
    if (score > bestScore) {
      bestScore = score;
      bestMatch = el;
    }
  }

  if (!bestMatch) {
    console.warn(
      "[Metadrip Agent] No matching element found for:",
      action.text
    );
    return;
  }

  bestMatch.scrollIntoView({ behavior: "smooth", block: "center" });

  setTimeout(() => {
    const rect = bestMatch.getBoundingClientRect();

    const outline = document.createElement("div");
    outline.style.position = "fixed";
    outline.style.top = `${rect.top}px`;
    outline.style.left = `${rect.left}px`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
    outline.style.border = "2px solid #00ffff";
    outline.style.borderRadius = "6px";
    outline.style.zIndex = "999999";
    outline.style.pointerEvents = "none";
    outline.style.boxShadow = "0 0 12px #00ffff";
    outline.style.transition = "all 0.3s ease-in-out";
    document.body.appendChild(outline);
    setTimeout(() => outline.remove(), 1500);

    const tooltip = document.createElement("div");
    tooltip.innerText = `⚡ ${action.type}`;
    tooltip.style.position = "fixed";
    tooltip.style.background = "#00ffff";
    tooltip.style.color = "#000";
    tooltip.style.padding = "4px 8px";
    tooltip.style.borderRadius = "6px";
    tooltip.style.zIndex = "999999";
    tooltip.style.fontSize = "12px";
    tooltip.style.fontWeight = "bold";
    tooltip.style.top = `${rect.top - 30}px`;
    tooltip.style.left = `${rect.left}px`;
    document.body.appendChild(tooltip);
    setTimeout(() => tooltip.remove(), 1500);
  }, 500);

  if (action.type === "click") {
    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
    });
    bestMatch.dispatchEvent(clickEvent);
    console.log("[Metadrip Agent] Clicked:", bestMatch);
  }
});
