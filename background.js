chrome.runtime.onInstalled.addListener(() => {
  console.log("[BG] Extension installed");
  
  // Set default disclaimer acceptance state to false
  chrome.storage.sync.set({ 'disclaimerAccepted': false }, function() {
    console.log('Disclaimer acceptance initialized to false.');
  });
});

// Inject content.js on tab update or activation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && /^http/.test(tab.url)) {
    chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    console.log("[BG] Injected content.js into", tab.url);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FOUND_ADDRESS") {
    // Process message...
    sendResponse({ status: "received" });
    chrome.runtime.sendMessage(message);

    // Send a response back
    return true; // Keep message channel open for async response
  }
});
