const isLocal =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();

if (isLocal) {
  // Connect to emulator for local testing
  auth.useEmulator("http://127.0.0.1:9099");
}

// Configuration
const FUNCTIONS_URL = isLocal
  ? "http://127.0.0.1:5001/devfest-chat-app/us-central1"
  : "https://us-central1-devfest-chat-app.cloudfunctions.net";

let conversationHistory = [];
let currentUser = null;
let currentConversationId = null;

// Load conversation from localStorage on page load
function loadSavedConversation() {
  const saved = localStorage.getItem("currentConversation");
  if (saved) {
    try {
      const data = JSON.parse(saved);
      conversationHistory = data.history || [];
      currentConversationId = data.id || null;

      // Restore messages
      conversationHistory.forEach((msg) => {
        if (msg.role === "user") {
          addMessage(msg.parts[0].text, true);
        } else if (msg.role === "model") {
          addMessage(msg.parts[0].text, false);
        }
      });
    } catch (e) {
      console.error("Failed to load conversation:", e);
    }
  }
}

// Save conversation to localStorage
function saveConversation() {
  if (conversationHistory.length > 0) {
    localStorage.setItem(
      "currentConversation",
      JSON.stringify({
        id: currentConversationId,
        history: conversationHistory,
      })
    );
  }
}

// Clear conversation
function clearConversation() {
  conversationHistory = [];
  currentConversationId = null;
  messagesContainer.innerHTML = "";
  localStorage.removeItem("currentConversation");
  addMessage("Hello! I'm your AI assistant. How can I help you today?", false);
}

// DOM Elements
const authSection = document.getElementById("auth-section");
const app = document.getElementById("app");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const newChatBtn = document.getElementById("new-chat-btn");
const loadConvosBtn = document.getElementById("load-convos-btn");
const userEmail = document.getElementById("user-email");
const promptInput = document.getElementById("prompt");
const sendBtn = document.getElementById("send-btn");
const messagesContainer = document.getElementById("messages");
const loadingDiv = document.getElementById("loading");
const loadingText = document.getElementById("loading-text");
const errorDiv = document.getElementById("error");
const convPanel = document.getElementById("conversations-panel");
const convList = document.getElementById("conversations-list");
const closeConvBtn = document.getElementById("close-convos-btn");

// Auth State Observer
auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
    authSection.classList.add("hidden");
    app.classList.remove("hidden");
    userEmail.textContent = user.email;

    // Load saved conversation or show welcome message
    if (conversationHistory.length === 0) {
      loadSavedConversation();
      if (conversationHistory.length === 0) {
        addMessage(
          "Hello! I'm your AI assistant. How can I help you today?",
          false
        );
      }
    }
  } else {
    currentUser = null;
    authSection.classList.remove("hidden");
    app.classList.add("hidden");
  }
});

// --- Conversations UI & logic ---
function openConversationsPanel() {
  convPanel.classList.remove("hidden");
  loadConversations();
}

function closeConversationsPanel() {
  convPanel.classList.add("hidden");
}

async function loadConversations() {
  convList.innerHTML = "<p>Loading...</p>";
  try {
    const token = await getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(`${FUNCTIONS_URL}/listConversations`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load conversations");

    if (!data.conversations || data.conversations.length === 0) {
      convList.innerHTML = "<p>No conversations found.</p>";
      return;
    }

    convList.innerHTML = "";
    data.conversations.forEach((c) => {
      const item = document.createElement("div");
      item.className = "conversation-item";
      item.innerHTML = `
          <div class="conv-main">
            <div class="conv-text">
              <strong>${escapeHtml(c.lastMessage || "(no message)")}</strong>
              <div class="conv-sub">${new Date(
                c.updatedAt
              ).toLocaleString()}</div>
            </div>
            <div class="conv-actions">
              <button data-id="${c.id}" class="load-conv-btn">Load</button>
            </div>
          </div>`;
      convList.appendChild(item);
    });

    // Attach listeners
    convList.querySelectorAll(".load-conv-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.target.dataset.id;
        if (id) loadConversationById(id);
      });
    });
  } catch (err) {
    convList.innerHTML = "<p>Error loading conversations.</p>";
    console.error(err);
  }
}

async function loadConversationById(id) {
  try {
    const token = await getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(
      `${FUNCTIONS_URL}/getConversation?id=${encodeURIComponent(id)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load conversation");

    if (data.success && data.conversation) {
      // Replace local conversation with loaded one
      conversationHistory = data.conversation.history || [];
      currentConversationId = id;

      // Render messages
      messagesContainer.innerHTML = "";
      conversationHistory.forEach((msg) => {
        if (msg.role === "user") addMessage(msg.parts?.[0]?.text || "", true);
        else addMessage(msg.parts?.[0]?.text || "", false);
      });

      saveConversation();
      closeConversationsPanel();
    } else {
      throw new Error(data.error || "Conversation not found");
    }
  } catch (err) {
    showError(err.message || "Failed to load conversation");
    console.error(err);
  }
}

function escapeHtml(unsafe) {
  return String(unsafe)
    .replaceAll("&", "&amp;")
    .replaceAll(/</g, "&lt;")
    .replaceAll(/>/g, "&gt;")
    .replaceAll(/\"/g, "&quot;")
    .replaceAll(/'/g, "&#039;");
}

// Login
loginBtn.addEventListener("click", async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
  } catch (error) {
    showError("Login failed: " + error.message);
  }
});

// Logout
logoutBtn.addEventListener("click", () => {
  if (confirm("Sign out? Your current conversation will be saved.")) {
    saveConversation();
    auth.signOut();
  }
});

// New Chat
newChatBtn.addEventListener("click", () => {
  if (confirm("Start a new chat? Current conversation will be saved.")) {
    saveConversation();
    clearConversation();
  }
});

// Open conversations panel
if (loadConvosBtn)
  loadConvosBtn.addEventListener("click", openConversationsPanel);
if (closeConvBtn)
  closeConvBtn.addEventListener("click", closeConversationsPanel);

// Simple markdown to HTML converter
function formatMarkdown(text) {
  return (
    text
      // Bold
      .replaceAll(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // Italic
      .replaceAll(/\*(.+?)\*/g, "<em>$1</em>")
      // Code blocks
      .replaceAll(/```(\w+)?\n([\s\S]+?)```/g, "<pre><code>$2</code></pre>")
      // Inline code
      .replaceAll(/`(.+?)`/g, "<code>$1</code>")
      // Links
      .replaceAll(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>')
      // Line breaks
      .replaceAll(/\n/g, "<br>")
  );
}

// Add message to chat
function addMessage(text, isUser, imageData = null) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${isUser ? "user-message" : "ai-message"}`;

  if (imageData) {
    messageDiv.classList.add("image-message");
    const img = document.createElement("img");
    img.src = `data:${imageData.mimeType};base64,${imageData.data}`;
    img.alt = "Generated image";
    messageDiv.appendChild(img);
  } else {
    if (isUser) {
      messageDiv.textContent = text;
    } else {
      messageDiv.innerHTML = formatMarkdown(text);
    }
  }

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Show error
function showError(message) {
  errorDiv.textContent = message;
  errorDiv.classList.remove("hidden");
  setTimeout(() => {
    errorDiv.classList.add("hidden");
  }, 5000);
}

// Get auth token
async function getAuthToken() {
  if (!currentUser) return null;
  return await currentUser.getIdToken();
}

// Send message
async function sendMessage() {
  const message = promptInput.value.trim();
  if (!message) return;

  sendBtn.disabled = true;
  promptInput.disabled = true;
  loadingDiv.classList.remove("hidden");
  errorDiv.classList.add("hidden");

  addMessage(message, true);
  promptInput.value = "";

  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    loadingText.textContent = "Thinking...";
    await sendChatMessage(message, token);
  } catch (error) {
    console.error("Error:", error);
    showError(error.message || "Request failed. Please try again.");
  } finally {
    sendBtn.disabled = false;
    promptInput.disabled = false;
    loadingDiv.classList.add("hidden");
    promptInput.focus();
  }
}

// Send chat message
async function sendChatMessage(message, token) {
  const response = await fetch(`${FUNCTIONS_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      message: message,
      history: conversationHistory,
      conversationId: currentConversationId,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Chat request failed");
  }

  if (data.success) {
    addMessage(data.text, false);
    conversationHistory = data.history;
    currentConversationId = data.conversationId;
    saveConversation(); // Save after each message
  } else {
    throw new Error(data.error);
  }
}

// Event listeners
sendBtn.addEventListener("click", sendMessage);
promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
