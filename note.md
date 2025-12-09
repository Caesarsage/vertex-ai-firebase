
# 1. auth terraform with gcloud
gcloud auth application-default login

# 2. Set project for terraform
gcloud config set project <project-id>

# 3. Verify it's set correctly
gcloud config get-value project

# 4. Check what gcloud thinks your project is

gcloud config configurations list

gcloud config list

# 5
unset GOOGLE_APPLICATION_CREDENTIALS

# Now run Terraform with clean credentials
unset GOOGLE_APPLICATION_CREDENTIALS
terraform init
terraform apply

<!-- firebase -->

# Add Firebase to your existing GCP project
firebase projects:addfirebase <project-id>

firebase use <project-id>

firebase apps:sdkconfig web

# Enable the Vertex AI API if not enabled

gcloud services enable aiplatform.googleapis.com --project=<project-id>

# Also enable the Generative Language API if not enabled
gcloud services enable generativelanguage.googleapis.com --project=<project-id>

# Verify they're enabled if not enabled
gcloud services list --enabled --project=new-ai-caesar | grep -E "aiplatform|generativelanguage"
