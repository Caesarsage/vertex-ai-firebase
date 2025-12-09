# 🤖 AI DevFest Talk - Build AI Web with Vertex AI and Firebase

A full-stack AI chat application built with **Google Cloud's Vertex AI (Gemini 2.5 Flash)**, **Firebase**, and **Terraform**. This project demonstrates how to build a modern AI-powered web application with authentication, rate limiting, conversation persistence, and scalable cloud infrastructure.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [1. Infrastructure Setup](#1-infrastructure-setup)
  - [2. Firebase Configuration](#2-firebase-configuration)
  - [3. Cloud Functions Setup](#3-cloud-functions-setup)
  - [4. Frontend Setup](#4-frontend-setup)
- [Running the Application](#running-the-application)
- [API Documentation](#api-documentation)
- [Contributing](#contributing)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## 📖 Overview

This project creates an interactive AI assistant web application that:

- ✅ Authenticates users with **Google Sign-In** via Firebase Auth
- ✅ Processes user messages with **Vertex AI Generative Model** (Gemini 2.5 Flash)
- ✅ Maintains multi-turn conversations with full history
- ✅ Implements **rate limiting** (20 requests/hour for text generation, 30 for chat)
- ✅ Persists conversations in **Firestore** database
- ✅ Caches conversations locally in browser storage
- ✅ Scales with **Cloud Functions** (serverless)
- ✅ Deploys infrastructure with **Terraform** and **Infrastructure as Code**

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Web App)                        │
│              public/index.html + app.js                      │
│                                                              │
│  ├─ Google Sign-In Authentication                           │
│  ├─ Chat Interface with Markdown Support                    │
│  └─ Local Storage for Conversation History                  │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS
                       ↓
┌─────────────────────────────────────────────────────────────┐
│            Firebase Hosting + Cloud Functions               │
│                                                              │
│  ├─ generateText: Simple text generation                    │
│  ├─ chat: Multi-turn conversation endpoint                  │
│  ├─ getConversation: Retrieve specific conversation         │
│  ├─ listConversations: List user conversations              │
│  └─ health: Health check endpoint                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
   ┌────────┐  ┌─────────────┐  ┌──────────┐
   │Vertex  │  │  Firestore  │  │ Firebase │
   │  AI    │  │  Database   │  │   Auth   │
   │(Gemini)│  │             │  │          │
   └────────┘  └─────────────┘  └──────────┘
```

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 20+ ([Download](https://nodejs.org/))
- **npm** or **yarn** (comes with Node.js)
- **Terraform** 1.3.0+ ([Download](https://www.terraform.io/downloads))
- **Google Cloud CLI** (gcloud) ([Download](https://cloud.google.com/sdk/docs/install))
- **Firebase CLI** ([Install](https://firebase.google.com/docs/cli))
- A **GCP Project** with billing enabled

### Verify Installations

```bash
node --version      # v20.x.x or higher
npm --version       # 10.x.x or higher
terraform --version # v1.3.0 or higher
gcloud --version    # Latest version
firebase --version  # Latest version
```

## 📁 Project Structure

```
ai-devfest-talk/
├── functions/                 # Cloud Functions (Backend)
│   ├── src/
│   │   └── index.ts          # TypeScript Cloud Functions code
│   ├── lib/                  # Compiled JavaScript output
│   ├── package.json          # Dependencies & scripts
│   ├── tsconfig.json         # TypeScript config
│   └── tsconfig.dev.json     # Development TS config
│
├── public/                    # Frontend (Web App)
│   ├── index.html            # Main HTML page
│   ├── app.js                # Frontend logic & event handlers
│   ├── firebaseConfig.js     # Firebase configuration
│   ├── style.css             # Application styling
│   └── favicon/              # Website icons
│
├── infra/                     # Infrastructure as Code (Terraform)
│   ├── main.tf               # Terraform configuration
│   └── terraform.tfvars      # Terraform variables
│
├── firebase.json             # Firebase configuration
├── README.md                 # This file
└── note.md                   # Setup notes & troubleshooting
```

## 🚀 Getting Started

### 1. Infrastructure Setup

#### Step 1: Authenticate with Google Cloud

```bash
gcloud auth application-default login
```

This opens a browser to authenticate your GCP account. Choose the account associated with your GCP project.

#### Step 2: Set Your GCP Project

```bash
# Set the project
gcloud config set project YOUR_PROJECT_ID

# Verify it's set
gcloud config get-value project
```

Replace `YOUR_PROJECT_ID` with your actual GCP project ID.

#### Step 3: Enable Required APIs

```bash
gcloud services enable aiplatform.googleapis.com --project=YOUR_PROJECT_ID
gcloud services enable generativelanguage.googleapis.com --project=YOUR_PROJECT_ID
gcloud services enable storage.googleapis.com --project=YOUR_PROJECT_ID
gcloud services enable iam.googleapis.com --project=YOUR_PROJECT_ID
```

#### Step 4: Initialize and Apply Terraform

```bash
cd infra/

# Initialize Terraform (download providers)
terraform init

# Validate configuration
terraform validate

# Review what will be created
terraform plan

# Apply the configuration
terraform apply
```

When prompted, enter `yes` to confirm. This will:
- ✅ Create a service account for Vertex AI access
- ✅ Enable necessary GCP APIs
- ✅ Set up Firebase project (optional, if `enable_firebase = true`)
- ✅ Create an IAM service account with appropriate roles
- ✅ Generate a service account key

**Save the output**, especially the service account email and bucket name.

### 2. Firebase Configuration

#### Step 1: Add Firebase to Your Project

```bash
# Go back to project root
cd ..

# Add Firebase to your GCP project
firebase projects:addfirebase YOUR_PROJECT_ID

# Set Firebase to use your project
firebase use YOUR_PROJECT_ID

# Get the SDK configuration for web
firebase apps:sdkconfig web
```

#### Step 2: Update Firebase Config (if needed)

If the SDK config differs from what's in `public/firebaseConfig.js`, update it:

```bash
firebase apps:sdkconfig web --json > firebaseConfig.json
```

Then update `public/firebaseConfig.js` with the output.

#### Step 3: Enable Authentication Methods

```bash
# Enable Google Sign-In in Firebase Console
# 1. Go to: https://console.firebase.google.com/
# 2. Select your project
# 3. Go to Authentication → Sign-in method
# 4. Enable "Google" provider
# 5. Add authorized domains (localhost for testing, your domain for production)
```

### 3. Cloud Functions Setup

#### Step 1: Install Dependencies

```bash
cd functions/

# Install npm dependencies
npm install
```

#### Step 2: Set Environment Variables

Create a `.env` file in the `functions/` directory (optional, for local testing):

```bash
# functions/.env
GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa-key.json
```

#### Step 3: Build TypeScript

```bash
# Compile TypeScript to JavaScript
npm run build

# Or use watch mode (auto-recompile on changes)
npm run build:watch
```

### 4. Frontend Setup

No additional setup needed! The `public/` folder contains a static web app that will be served by Firebase Hosting.

However, you should update `public/firebaseConfig.js` with your Firebase credentials:

```javascript
// public/firebaseConfig.js
export const firebaseConfig = {
  projectId: "YOUR_PROJECT_ID",
  appId: "YOUR_APP_ID",
  storageBucket: "YOUR_BUCKET",
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  messagingSenderId: "YOUR_SENDER_ID",
  projectNumber: "YOUR_PROJECT_NUMBER",
  version: "2",
};
```

## ▶️ Running the Application

### Option 1: Local Development (Recommended)

Run the Firebase emulator to test locally:

```bash
# From project root
firebase emulators:start

# In another terminal, serve the frontend
cd public/
npx http-server .
```

Then open http://localhost:8080 in your browser.

**Frontend URL**: http://127.0.0.1:8080
**Functions URL**: http://127.0.0.1:5001/YOUR_PROJECT_ID/us-central1

### Option 2: Build Cloud Functions Only

```bash
cd functions/

# Build the functions
npm run build

# View available scripts
npm run

# Deploy to Firebase
npm run deploy

# View logs
npm run logs
```

### Option 3: Full Firebase Deployment

```bash
# Deploy everything (functions + hosting)
firebase deploy

# Deploy only functions
firebase deploy --only functions

# Deploy only hosting
firebase deploy --only hosting
```

After deployment, your app will be available at `https://YOUR_PROJECT_ID.web.app`

## 📡 API Documentation

All endpoints require Firebase authentication (Bearer token in `Authorization` header).

### 1. Generate Text

**Endpoint**: `POST /generateText`

Generate a single response from the AI model.

**Request**:
```json
{
  "prompt": "Explain quantum computing in simple terms"
}
```

**Response**:
```json
{
  "success": true,
  "text": "Quantum computing uses quantum mechanics..."
}
```

**Rate Limit**: 20 requests/hour

---

### 2. Chat (Multi-turn)

**Endpoint**: `POST /chat`

Send a message and maintain conversation history.

**Request**:
```json
{
  "message": "What is machine learning?",
  "history": [
    {
      "role": "user",
      "parts": [{"text": "What is AI?"}]
    },
    {
      "role": "model",
      "parts": [{"text": "AI stands for Artificial Intelligence..."}]
    }
  ],
  "conversationId": "optional-conv-id"
}
```

**Response**:
```json
{
  "success": true,
  "text": "Machine learning is a subset of AI...",
  "history": [/* updated history */],
  "conversationId": "conv-1234567890"
}
```

**Rate Limit**: 30 requests/hour

---

### 3. Get Conversation

**Endpoint**: `GET /getConversation?id=CONVERSATION_ID`

Retrieve a specific conversation from Firestore.

**Response**:
```json
{
  "success": true,
  "conversation": {
    "userId": "user-123",
    "history": [/* message history */],
    "lastMessage": "...",
    "lastResponse": "...",
    "updatedAt": "2025-12-09T10:30:00Z"
  }
}
```

---

### 4. List Conversations

**Endpoint**: `GET /listConversations`

Get the user's last 20 conversations.

**Response**:
```json
{
  "success": true,
  "conversations": [
    {
      "id": "conv-123",
      "lastMessage": "What is AI?",
      "lastResponse": "AI stands for...",
      "updatedAt": "2025-12-09T10:30:00Z"
    }
  ]
}
```

---

### 5. Health Check

**Endpoint**: `GET /health`

Check if the backend is running.

**Response**:
```json
{
  "status": "ok",
  "project": "new-ai-caesar",
  "location": "us-central1",
  "timestamp": "2025-12-09T10:30:00Z"
}
```

## 🤝 Contributing

We welcome contributions! Here's how to contribute:

### 1. Fork the Repository

```bash
git clone https://github.com/YOUR_USERNAME/ai-devfest-talk.git
cd ai-devfest-talk
```

### 2. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 3. Make Your Changes

- **Backend**: Modify `functions/src/index.ts` and rebuild with `npm run build`
- **Frontend**: Update `public/app.js` or `public/index.html`
- **Infrastructure**: Edit `infra/main.tf` for cloud setup

### 4. Test Your Changes

```bash
# Test backend
cd functions/
npm run lint
npm run build

# Test frontend locally
firebase emulators:start
```

### 5. Commit and Push

```bash
git add .
git commit -m "feat: add your feature description"
git push origin feature/your-feature-name
```

### 6. Open a Pull Request

Go to GitHub and create a pull request with a clear description of your changes.

### Development Guidelines

- **TypeScript**: Use strict mode, add proper type annotations
- **Formatting**: Run `npm run lint` before committing
- **Comments**: Add JSDoc comments for new functions
- **Testing**: Test API endpoints with different inputs
- **Security**: Never commit API keys or sensitive data

## 🚀 Deployment

### Deploy to Firebase Hosting + Cloud Functions

```bash
# 1. Build functions
cd functions/
npm run build
cd ..

# 2. Deploy
firebase deploy

# 3. View your app
firebase open hosting:site
```

### Deploy Only Functions

```bash
cd functions/
npm run deploy
```

### Deploy Only Frontend

```bash
firebase deploy --only hosting
```

### View Deployment Logs

```bash
# Cloud Functions logs
firebase functions:log

# Firestore logs
gcloud firestore logs read "resource.type=cloud_firestore" --limit=50
```

## 🔧 Troubleshooting

### Issue: "GOOGLE_APPLICATION_CREDENTIALS not set"

**Solution**:
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
```

### Issue: Firebase emulator won't start

**Solution**:
```bash
# Kill any existing processes
lsof -i :5001
kill -9 <PID>

# Restart
firebase emulators:start
```

### Issue: Rate limit exceeded

The API enforces rate limiting:
- **generateText**: 20 requests/hour per user
- **chat**: 30 requests/hour per user

Rate limits are tracked in Firestore in the `rateLimits` collection.

### Issue: "Vertex AI API is not enabled"

**Solution**:
```bash
gcloud services enable aiplatform.googleapis.com --project=YOUR_PROJECT_ID
```

### Issue: Frontend can't connect to backend

**Check**:
1. Cloud Functions are deployed: `firebase deploy --only functions`
2. URL matches in `public/app.js`: `const FUNCTIONS_URL = "..."`
3. CORS is enabled (it is, via `cors` middleware)

### Issue: "Authentication failed"

**Check**:
1. Firebase Auth is enabled
2. Google Sign-In provider is enabled in Firebase Console
3. Authorization domain includes localhost or your domain
4. Firebase config is correct in `public/firebaseConfig.js`

## 📚 Resources

- [Google Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
- [Firebase Documentation](https://firebase.google.com/docs)
- [Cloud Functions Documentation](https://cloud.google.com/functions/docs)
- [Gemini API Guide](https://ai.google.dev/)
- [Terraform GCP Provider](https://registry.terraform.io/providers/hashicorp/google/latest)

## 📝 License

This project is open source and available under the MIT License.
