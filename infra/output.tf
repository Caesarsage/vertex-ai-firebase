output "project_id" {
  value = var.project_id
}

output "service_account_email" {
  value = google_service_account.ai_demo_sa.email
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

    To use the service account in your app:

    To update Firebase config:
    cd .. && firebase use ${var.project_id}

    To destroy:
    terraform destroy
  EOT
}
