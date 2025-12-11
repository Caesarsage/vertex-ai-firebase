import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as cors from "cors";
import { VertexAI } from "@google-cloud/vertexai";

// Initialize Firebase Admin and DB
admin.initializeApp();
const db = admin.firestore();

const corsHandler = cors();

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
/**
 * Check if user has exceeded rate limit
 * @param {string} userId - The user ID
 * @param {number} limitPerHour - Rate limit per hour
 * @return {Promise<boolean>} Whether request is allowed
 */
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
/**
 * Verify Firebase authentication token
 * @param {functions.https.Request} req - The request object
 * @return {Promise<string | null>} User ID or null
 */
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
    return decodedToken.uid;
  } catch (error) {
    console.error("Auth error:", error);
    return null;
  }
}

// ============================================
// GENERATE TEXT
// ============================================
export const generateText = functions.https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    // Verify authentication
    const userId = await verifyAuth(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Check rate limit
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
});

// ============================================
// CHAT
// ============================================
export const chat = functions.https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    // Verify authentication
    const userId = await verifyAuth(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Check rate limit
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

      // Save conversation to Firestore
      const convId = conversationId || `${userId}_${Date.now()}`;
      await db.collection("conversations").doc(convId).set({
        userId: userId,
        history: updatedHistory,
        lastMessage: message,
        lastResponse: text,
        updatedAt: new Date(),
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
});


// ============================================
// GET CONVERSATION
// ============================================
export const getConversation = functions.https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
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

      const doc = await db.collection("conversations")
        .doc(conversationId).get();

      if (!doc.exists || doc.data()?.userId !== userId) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      return res.status(200).json({
        success: true,
        conversation: doc.data(),
      });
    } catch (error: unknown) {
      console.error("Get conversation error:", error);
      return res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });
});

// ============================================
// LIST CONVERSATIONS
// ============================================
export const listConversations = functions.https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== "GET") {
      return res.status(405).send("Method Not Allowed");
    }

    const userId = await verifyAuth(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const snapshot = await db.collection("conversations")
        .where("userId", "==", userId)
        .orderBy("updatedAt", "desc")
        .limit(20)
        .get();

      const conversations = snapshot.docs.map((doc) => ({
        id: doc.id,
        lastMessage: doc.data().lastMessage,
        lastResponse: doc.data().lastResponse,
        updatedAt: doc.data().updatedAt,
      }));

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
});

// ============================================
// HEALTH CHECK
// ============================================
export const health = functions.https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
    res.status(200).json({
      status: "ok",
      project: project,
      location: location,
      timestamp: new Date().toISOString(),
    });
  });
});
