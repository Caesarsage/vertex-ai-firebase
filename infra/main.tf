terraform {
  required_version = ">= 1.3.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
    }
  }
}

variable "project_id" {
  type        = string
  description = "GCP Project ID (must already exist)"
}

variable "region" {
  type        = string
  default     = "us-central1"
  description = "Default region"
}

variable "enable_firebase" {
  type        = bool
  default     = true
  description = "Enable Firebase for this project"
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# Enable Required APIs
resource "google_project_service" "vertex_ai" {
  project            = var.project_id
  service            = "aiplatform.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "generativelanguage_api" {
  project            = var.project_id
  service            = "generativelanguage.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "iam_api" {
  project            = var.project_id
  service            = "iam.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "firebase_api" {
  count              = var.enable_firebase ? 1 : 0
  project            = var.project_id
  service            = "firebase.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "firestore_api" {
  count              = var.enable_firebase ? 1 : 0
  project            = var.project_id
  service            = "firestore.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "firebasehosting_api" {
  count              = var.enable_firebase ? 1 : 0
  project            = var.project_id
  service            = "firebasehosting.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloudfunctions" {
  project            = var.project_id
  service            = "cloudfunctions.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloudbuild" {
  project            = var.project_id
  service            = "cloudbuild.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "artifactregistry" {
  project            = var.project_id
  service            = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloudrun" {
  project            = var.project_id
  service            = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "eventarc" {
  project            = var.project_id
  service            = "eventarc.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "pubsub" {
  project            = var.project_id
  service            = "pubsub.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "storage" {
  project            = var.project_id
  service            = "storage.googleapis.com"
  disable_on_destroy = false
}


# Enable Firebase
resource "google_firebase_project" "default" {
  count      = var.enable_firebase ? 1 : 0
  provider   = google-beta
  project    = var.project_id
  depends_on = [google_project_service.firebase_api]
}

resource "google_firebase_web_app" "default" {
  count        = var.enable_firebase ? 1 : 0
  provider     = google-beta
  project      = var.project_id
  display_name = "DevFest AI Web App"
  depends_on   = [google_firebase_project.default]
}

# Firestore Database
resource "google_firestore_database" "database" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  depends_on = [
    google_project_service.firestore_api
  ]
}

# Firestore Index for conversations query
resource "google_firestore_index" "conversations_by_user_and_time" {
  project    = var.project_id
  database   = "(default)"
  collection = "conversations"

  fields {
    field_path = "userId"
    order      = "ASCENDING"
  }

  fields {
    field_path = "updatedAt"
    order      = "DESCENDING"
  }

  depends_on = [google_firestore_database.database]
}

# Service Account
resource "google_service_account" "ai_demo_sa" {
  project      = var.project_id
  account_id   = "vertex-ai-demo-sa"
  display_name = "Vertex AI Demo Service Account"
  depends_on   = [google_project_service.iam_api]
}

# IAM Roles
resource "google_project_iam_member" "vertex_ai_role" {
  project    = var.project_id
  role       = "roles/aiplatform.admin"
  member     = "serviceAccount:${google_service_account.ai_demo_sa.email}"
  depends_on = [google_service_account.ai_demo_sa]
}

resource "google_project_iam_member" "token_creator_role" {
  project    = var.project_id
  role       = "roles/iam.serviceAccountTokenCreator"
  member     = "serviceAccount:${google_service_account.ai_demo_sa.email}"
  depends_on = [google_service_account.ai_demo_sa]
}

resource "google_project_iam_member" "firebase_admin_role" {
  count      = var.enable_firebase ? 1 : 0
  project    = var.project_id
  role       = "roles/firebase.admin"
  member     = "serviceAccount:${google_service_account.ai_demo_sa.email}"
  depends_on = [google_service_account.ai_demo_sa]
}
