import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { VertexAI } from "@google-cloud/vertexai";

// Initialize Firebase Admin and DB
admin.initializeApp();
const db = admin.firestore();

// Helper to set CORS headers
function setCorsHeaders(res: any) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// Initialize Vertex AI
const project = "devfest-chat-app";  // your GCP project ID
const location = "us-central1";
const model = "gemini-2.5-flash";

const vertexAI = new VertexAI({
  project: project,
  location: location,
});

const textModel = vertexAI.getGenerativeModel({
  model,
});

// ============================================
// RATE LIMITING HELPER
// ============================================
async function checkRateLimit(
  userId: string,
  limitPerHour = 20
): Promise<boolean> {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;

  const userRef = db.collection("rateLimits").doc(userId);
  const doc = await userRef.get();

  if (!doc.exists) {
    await userRef.set({
      requests: [now],
      lastReset: now,
    });
    return true;
  }

  const data = doc.data();
  if (!data) return false;

  const recentRequests = (data.requests || []).filter(
    (time: number) => time > oneHourAgo
  );

  if (recentRequests.length >= limitPerHour) {
    return false;
  }

  recentRequests.push(now);
  await userRef.update({
    requests: recentRequests,
    lastReset: data.lastReset,
  });

  return true;
}

// ============================================
// AUTH MIDDLEWARE
// ============================================
async function verifyAuth(
  req: functions.https.Request
): Promise<string | null> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log("User authenticated:", decodedToken.uid, "Email:", decodedToken.email);
    return decodedToken.uid;
  } catch (error) {
    console.error("Auth error:", error);
    return null;
  }
}

// ============================================
// GENERATE TEXT
// ============================================
export const generateText = functions.https.onRequest(async (req: any, res: any) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const userId = await verifyAuth(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const allowed = await checkRateLimit(userId);
  if (!allowed) {
    return res.status(429).json({
      error: "Rate limit exceeded. Please try again later.",
    });
  }

  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    console.log("Generating content for user:", userId);

    const result = await textModel.generateContent(prompt);
    const response = result.response;

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No response generated";

    return res.status(200).json({
      success: true,
      text: text,
    });
  } catch (error: unknown) {
    console.error("Generation error:", error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || "Unknown error occurred",
      code: (error as { code?: string }).code,
    });
  }
});

// ============================================
// CHAT
// ============================================
export const chat = functions.https.onRequest(async (req: any, res: any) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const userId = await verifyAuth(req);
  if (!userId) {
    console.log("Chat: Authentication failed");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const allowed = await checkRateLimit(userId, 30);
  if (!allowed) {
    return res.status(429).json({
      error: "Rate limit exceeded. Please try again later.",
    });
  }

  try {
    const { message, history = [], conversationId } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    console.log("Chat request from user:", userId);

    const chat = textModel.startChat({
      history: history,
    });

    const result = await chat.sendMessage(message);
    const response = result.response;

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No response generated";

    const updatedHistory = [
      ...history,
      { role: "user", parts: [{ text: message }] },
      { role: "model", parts: [{ text: text }] },
    ];

    const convId = conversationId || `${userId}_${Date.now()}`;

    console.log("Saving conversation:", convId, "for user:", userId);

    await db.collection("conversations").doc(convId).set({
      userId: userId,
      history: updatedHistory,
      lastMessage: message,
      lastResponse: text,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return res.status(200).json({
      success: true,
      text: text,
      history: updatedHistory,
      conversationId: convId,
    });
  } catch (error: unknown) {
    console.error("Chat error:", error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || "Unknown error occurred",
      code: (error as { code?: string }).code,
    });
  }
});

// ============================================
// GET CONVERSATION
// ============================================
export const getConversation = functions.https.onRequest(async (req: any, res: any) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (req.method !== "GET") {
    return res.status(405).send("Method Not Allowed");
  }

  const userId = await verifyAuth(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const conversationId = req.query.id as string;

    if (!conversationId) {
      return res.status(400).json({ error: "Conversation ID required" });
    }

    console.log("Getting conversation:", conversationId, "for user:", userId);

    const doc = await db.collection("conversations")
      .doc(conversationId).get();

    if (!doc.exists) {
      console.log("Conversation not found:", conversationId);
      return res.status(404).json({ error: "Conversation not found" });
    }

    const data = doc.data();

    if (data?.userId !== userId) {
      console.log("Conversation belongs to different user. Expected:", userId, "Got:", data?.userId);
      return res.status(404).json({ error: "Conversation not found" });
    }

    return res.status(200).json({
      success: true,
      conversation: data,
    });
  } catch (error: unknown) {
    console.error("Get conversation error:", error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// ============================================
// LIST CONVERSATIONS
// ============================================
export const listConversations = functions.https.onRequest(async (req: any, res: any) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (req.method !== "GET") {
    return res.status(405).send("Method Not Allowed");
  }

  const userId = await verifyAuth(req);
  if (!userId) {
    console.log("ListConversations: Authentication failed");
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    console.log("Listing conversations for user:", userId);

    const snapshot = await db.collection("conversations")
      .where("userId", "==", userId)
      .orderBy("updatedAt", "desc")
      .limit(20)
      .get();

    console.log("Found", snapshot.size, "conversations for user:", userId);

    const conversations = snapshot.docs.map((doc) => {
      const data = doc.data();
      console.log("Conversation:", doc.id, "userId:", data.userId, "lastMessage:", data.lastMessage);
      return {
        id: doc.id,
        lastMessage: data.lastMessage,
        lastResponse: data.lastResponse,
        updatedAt: data.updatedAt,
      };
    });

    return res.status(200).json({
      success: true,
      conversations: conversations,
    });
  } catch (error: unknown) {
    console.error("List conversations error:", error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// ============================================
// HEALTH CHECK
// ============================================
export const health = functions.https.onRequest(async (req: any, res: any) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  res.status(200).json({
    status: "ok",
    project: project,
    location: location,
    timestamp: new Date().toISOString(),
  });
});
