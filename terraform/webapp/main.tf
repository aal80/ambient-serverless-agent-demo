data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  function_name = "${var.project_name}-webapp"
  account_id    = data.aws_caller_identity.current.account_id
  region        = data.aws_region.current.region
}

# --- Code bucket: Web Functions load code from a versioned S3 bucket. ---

resource "aws_s3_bucket" "code" {
  bucket        = "${local.function_name}-${local.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_versioning" "code" {
  bucket = aws_s3_bucket.code.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_policy" "code" {
  bucket = aws_s3_bucket.code.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = ["s3:GetObject", "s3:GetObjectVersion"]
      Resource  = "${aws_s3_bucket.code.arn}/*"
      Condition = {
        StringEquals = { "aws:SourceAccount" = local.account_id }
        # Requests come from the revision, so the source ARN is under the function.
        ArnLike = { "aws:SourceArn" = "arn:aws:lambda:${local.region}:${local.account_id}:web-function/${local.function_name}/*" }
      }
    }]
  })
}

# Run `npm ci --omit=dev` in ./webapp first so node_modules is included.
data "archive_file" "webapp" {
  type        = "zip"
  source_dir  = "${path.module}/../../webapp"
  output_path = "${path.module}/../.build/webapp.zip"
}

resource "aws_s3_object" "code" {
  bucket      = aws_s3_bucket.code.id
  key         = "${local.function_name}/function.zip"
  source      = data.archive_file.webapp.output_path
  source_hash = data.archive_file.webapp.output_base64sha256

  depends_on = [aws_s3_bucket_versioning.code]
}

# --- Execution role ---

resource "aws_iam_role" "webapp" {
  name = local.function_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "webapp_logs" {
  role       = aws_iam_role.webapp.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "webapp_invoke_producer" {
  name = "invoke-producer"
  role = aws_iam_role.webapp.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = var.producer_function_arn
    }]
  })
}

# --- Login secrets: read by the server at startup ---

resource "aws_secretsmanager_secret" "webapp" {
  name = local.function_name
  # Delete immediately on destroy, so a redeploy can reuse the name.
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "webapp" {
  secret_id = aws_secretsmanager_secret.webapp.id
  secret_string = jsonencode({
    DEMO_KEY        = var.demo_key
    COOKIE_SIGN_KEY = var.cookie_sign_key
  })
}

resource "aws_iam_role_policy" "webapp_read_secret" {
  name = "read-login-secret"
  role = aws_iam_role.webapp.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "secretsmanager:GetSecretValue"
      Resource = aws_secretsmanager_secret.webapp.arn
    }]
  })
}

resource "aws_cloudwatch_log_group" "webapp" {
  name              = "/aws/lambda/web/${local.function_name}"
  retention_in_days = 7
}

# --- Web Function ---

resource "awscc_lambda_web_function" "webapp" {
  function_name = local.function_name
  tags          = [for k, v in var.tags : { key = k, value = v }]
}

# Revisions are immutable: a code or config change replaces this resource.
resource "awscc_lambda_web_function_revision" "webapp" {
  function_name = awscc_lambda_web_function.webapp.function_name

  build_config = {
    code_config = {
      s3_object = {
        bucket     = aws_s3_bucket.code.id
        key        = aws_s3_object.code.key
        version_id = aws_s3_object.code.version_id
      }
    }
    runtime_config = {
      runtime = "nodejs24.x"
    }
  }

  service_config = {
    execution_role_arn = aws_iam_role.webapp.arn
    timeout_seconds    = 30
    environment_variables = {
      PRODUCER_FUNCTION_NAME  = var.producer_function_arn
      APPSYNC_HTTP_DOMAIN     = var.appsync_http_domain
      APPSYNC_REALTIME_DOMAIN = var.appsync_realtime_domain
      APPSYNC_API_KEY         = var.appsync_api_key
      SECRET_ARN              = aws_secretsmanager_secret.webapp.arn
    }
  }

  # Keep the old revision serving until the endpoint has moved to the new one.
  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_s3_bucket_policy.code,
    aws_iam_role_policy_attachment.webapp_logs,
    aws_iam_role_policy.webapp_invoke_producer,
    aws_iam_role_policy.webapp_read_secret,
    aws_secretsmanager_secret_version.webapp,
    aws_cloudwatch_log_group.webapp,
  ]
}

# Public endpoint (ApplicationManaged = no AWS-layer auth). Throttled to cap
# abuse and cost, since anyone with the URL can reach it.
resource "awscc_lambda_web_function_endpoint" "webapp" {
  function_name = awscc_lambda_web_function.webapp.function_name
  endpoint_name = "default"
  endpoint_type = "HomeRegion"
  auth_type     = "ApplicationManaged"

  revision_weights = [{
    revision_id = awscc_lambda_web_function_revision.webapp.revision_id
    weight      = 100
  }]

  throttle_config = {
    rate_limit = 100
  }

  scaling_config = {
    max_environments = 2
  }
}
