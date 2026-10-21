# Browsers subscribe with the API key; only IAM-signed callers (the consumer) can publish.
resource "aws_appsync_api" "this" {
  name = var.project_name

  event_config {
    auth_provider {
      auth_type = "API_KEY"
    }
    auth_provider {
      auth_type = "AWS_IAM"
    }

    connection_auth_mode {
      auth_type = "API_KEY"
    }
    connection_auth_mode {
      auth_type = "AWS_IAM"
    }

    default_publish_auth_mode {
      auth_type = "AWS_IAM"
    }

    default_subscribe_auth_mode {
      auth_type = "API_KEY"
    }
  }
}

# One channel per chat session: /sessions/<sessionId>.
resource "aws_appsync_channel_namespace" "sessions" {
  api_id = aws_appsync_api.this.api_id
  name   = "sessions"
}

# Defaults to a 7-day expiry.
resource "aws_appsync_api_key" "browser" {
  api_id      = aws_appsync_api.this.api_id
  description = "Browser subscriptions"
}
