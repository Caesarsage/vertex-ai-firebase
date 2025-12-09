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

resource "google_project_service" "storage_api" {
  project            = var.project_id
  service            = "storage.googleapis.com"
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

resource "google_project_iam_member" "storage_admin_role" {
  project    = var.project_id
  role       = "roles/storage.admin"
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

# Service Account Key
resource "google_service_account_key" "sa_key" {
  service_account_id = google_service_account.ai_demo_sa.name
  public_key_type    = "TYPE_X509_PEM_FILE"
  private_key_type   = "TYPE_GOOGLE_CREDENTIALS_FILE"
}

resource "local_file" "sa_key_file" {
  content         = base64decode(google_service_account_key.sa_key.private_key)
  filename        = "${path.module}/sa-key.json"
  file_permission = "0600"
}

# Outputs
output "project_id" {
  value = var.project_id
}

output "service_account_email" {
  value = google_service_account.ai_demo_sa.email
}

output "bucket_name" {
  value = google_storage_bucket.demo_bucket.name
}

output "sa_key_path" {
  value = abspath(local_file.sa_key_file.filename)
}

output "firebase_enabled" {
  value = var.enable_firebase
}

output "firebase_web_app_id" {
  value = var.enable_firebase ? google_firebase_web_app.default[0].app_id : "Not enabled"
}

output "setup_instructions" {
  value = <<-EOT

    Infrastructure Setup Complete!

    Project: ${var.project_id}
    Service Account: ${google_service_account.ai_demo_sa.email}
    Storage Bucket: ${google_storage_bucket.demo_bucket.name}

    To use the service account in your app:
    export GOOGLE_APPLICATION_CREDENTIALS="${abspath(local_file.sa_key_file.filename)}"

    To update Firebase config:
    cd .. && firebase use ${var.project_id}

    To destroy:
    terraform destroy
  EOT
}
