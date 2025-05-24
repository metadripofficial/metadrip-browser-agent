document.addEventListener("DOMContentLoaded", function () {
  const mainContent = document.getElementById("main-content");
  const disclaimerContainer = document.getElementById("disclaimer-container");
  const acceptBtn = document.getElementById("accept-btn");

  // Tab functionality
  function setupTabs() {
    const tabButtons = document.querySelectorAll(".tab-btn");

    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        // Remove active class from all buttons and content
        tabButtons.forEach((btn) => btn.classList.remove("active"));
        document
          .querySelectorAll(".tab-content")
          .forEach((content) => content.classList.remove("active"));

        // Add active class to clicked button and corresponding content
        button.classList.add("active");
        const tabId = button.getAttribute("data-tab");
        document.getElementById(`${tabId}-tab`).classList.add("active");
      });
    });
  }

  // Check if disclaimer has been accepted
  chrome.storage.sync.get(["disclaimerAccepted"], function (result) {
    // If disclaimer hasn't been accepted yet, show disclaimer in popup
    if (!result.disclaimerAccepted) {
      mainContent.style.display = "none";
      disclaimerContainer.style.display = "block";
    } else {
      // Continue with normal popup initialization if disclaimer was accepted
      mainContent.style.display = "block";
      disclaimerContainer.style.display = "none";
      setupTabs(); // Initialize tabs
      initializePopup();
    }
  });

  // Handle accept button click
  acceptBtn.addEventListener("click", function () {
    // Save disclaimer acceptance to Chrome storage
    chrome.storage.sync.set({ disclaimerAccepted: true }, function () {
      console.log("Disclaimer acceptance saved.");

      // Show main content and hide disclaimer
      mainContent.style.display = "block";
      disclaimerContainer.style.display = "none";

      // Initialize tabs
      setupTabs();

      // Initialize the popup functionality
      initializePopup();
    });
  });

  function initializePopup() {
    const instructionInput = document.getElementById("instruction");
    const runBtn = document.getElementById("run");
    const stopBtn = document.getElementById("stop");
    const storeBtn = document.getElementById("store");
    const highlightBtn = document.getElementById("highlight-toggle");
    const addressesDiv = document.getElementById("addresses");
    const clearBtn = document.getElementById("clear");

    let highlightOn = false;
    let startedScrolling = false;
    let addressQueue = [];
    let updateTimer = null;

    function displayAddresses(addresses) {
      // addressesDiv.innerHTML = "";
      addressesDiv.style.display = "block";
      clearBtn.style.display = "block";
      addresses.forEach((addr) => {
        const div = document.createElement("div");
        div.textContent = addr;
        div.style.cursor = "pointer";
        div.onclick = () => {
          copyToClipboard(addr);
          div.textContent = "Address Copied!";
          setTimeout(() => {
            div.textContent = addr; // Reset text after 2 seconds
          }, 2000);
        };
        addressesDiv.appendChild(div);
      });
    }

    function copyToClipboard(text) {
      navigator.clipboard.writeText(text).then(
        () => {
          console.log("Text copied to clipboard");
        },
        (err) => {
          console.error("Failed to copy text: ", err);
        }
      );
    }

    chrome.storage.sync.get(["addresses"], (result) => {
      if (chrome.runtime.lastError) {
        console.error("Error getting addresses:", chrome.runtime.lastError);
        return;
      }
      if (result.addresses && result.addresses.length > 0) {
        displayAddresses(result.addresses);
      } else {
        addressesDiv.style.display = "none"; // Or show a "No addresses found" message
      }
    });

    function clearAddresses() {
      chrome.storage.sync.set({ addresses: [] }, () => {
        addressesDiv.innerHTML = "";
        clearBtn.style.display = "none";
        addressesDiv.style.display = "none"; // Hide container after clearing
      });
    }
    // Run GPT click instruction
    runBtn.addEventListener("click", async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) return alert("No active tab found.");

      const instruction = instructionInput.value;
      console.log('instruction', instruction)
      try {
        const response = await fetch("https://browser-agent-backend.onrender.com/api/instruction", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            instruction: instruction,
          }),
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        if (data.result === true) {
          startedScrolling = true;
          clearAddresses();
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (instruction) => {
              window.postMessage({ type: "FROM_EXTENSION", instruction }, "*");
            },
            args: [instruction],
          });
          runBtn.textContent = startedScrolling ? "Started" : "Start";
        } else {
          alert(data.message || "Failed to process instruction");
        }
      } catch (error) {
        alert(`Error: ${error.message}`);
      }
      // clearAddresses();
      // chrome.scripting.executeScript({
      //   target: { tabId: tab.id },
      //   func: (instruction) => {
      //     window.postMessage({ type: "FROM_EXTENSION", instruction }, "*");
      //   },
      //   args: [instruction],
      // });
      runBtn.textContent = startedScrolling ? "Started" : "Start";
    });

    clearBtn.addEventListener("click", async () => {
      clearAddresses();
    });

    // Stop button just closes popup
    stopBtn.addEventListener("click", async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) return alert("No active tab found.");
      startedScrolling = false;
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          window.postMessage({ type: "FROM_EXTENSION_END" }, "*");
        },
        args: ["end"],
      });
      runBtn.textContent = startedScrolling ? "Started" : "Start";
      alert("Scrolling stopped.");
    });

    // 🧠 Highlight toggle ON/OFF
    highlightBtn.addEventListener("click", async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.id) return alert("No active tab found.");

        highlightOn = !highlightOn;

        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (value) => {
            window.postMessage({ type: "TOGGLE_HIGHLIGHT", value }, "*");
          },
          args: [highlightOn],
        });

        highlightBtn.textContent = highlightOn
          ? "🧠 Highlight: ON"
          : "🧠 Highlight: OFF";
      } catch (err) {
        alert("Failed to toggle highlight mode.");
        console.error("Highlight toggle error:", err);
      }
    });

    // App Store button
    storeBtn.addEventListener("click", () => {
      chrome.tabs.create({ url: "https://app.metadrip.ai" });
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "FOUND_ADDRESS") {
        if (!addressQueue.includes(message.address)) {
          addressQueue.push(message.address);
        }
        if (updateTimer) clearTimeout(updateTimer);
        updateTimer = setTimeout(() => {
          chrome.storage.sync.get(["addresses"], (result) => {
            let addresses = result.addresses || [];
            const newAddresses = addressQueue.filter(
              (addr) => !addresses.includes(addr)
            );
            addresses = addresses.concat(newAddresses);
            chrome.storage.sync.set({ addresses }, () => {
              if (chrome.runtime.lastError) {
                console.error(
                  "Error saving addresses:",
                  chrome.runtime.lastError
                );
              } else {
                displayAddresses(addresses);
              }
            });
            addressQueue = [];
            updateTimer = null;
          });
        }, 200);
      }
    });
  }
});
