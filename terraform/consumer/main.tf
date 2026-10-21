data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  function_name = "${var.project_name}-consumer"

  # Global cross-region inference profile (no regional-endpoint premium).
  model_id = "global.anthropic.claude-haiku-5-5"
}

data "archive_file" "consumer" {
  type        = "zip"
  source_dir  = "${path.module}/../../consumer"
  output_path = "${path.module}/../.build/consumer.zip"
  excludes    = ["__pycache__"]
}

resource "aws_iam_role" "consumer" {
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

# Used by the event source mapping to describe the cluster and create ENIs in its subnets.
resource "aws_iam_role_policy_attachment" "consumer_msk" {
  role       = aws_iam_role.consumer.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaMSKExecutionRole"
}

resource "aws_iam_role_policy" "consumer_appsync" {
  name = "appsync-publish"
  role = aws_iam_role.consumer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "appsync:EventPublish"
      Resource = var.appsync_sessions_namespace_arn
    }]
  })
}

resource "aws_iam_role_policy" "consumer_bedrock" {
  name = "bedrock-invoke"
  role = aws_iam_role.consumer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "bedrock:InvokeModel"
      Resource = [
        "arn:aws:bedrock:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:inference-profile/${local.model_id}",
        # The global profile can route to the model in any region.
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-5-5",
      ]
    }]
  })
}

resource "aws_cloudwatch_log_group" "consumer" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = 7
}

# Not attached to the VPC: the event source mapping reaches MSK, then invokes the function.
resource "aws_lambda_function" "consumer" {
  function_name    = local.function_name
  role             = aws_iam_role.consumer.arn
  runtime          = "python3.15"
  architectures    = ["arm64"]
  handler          = "handler.handler"
  filename         = data.archive_file.consumer.output_path
  source_code_hash = data.archive_file.consumer.output_base64sha256
  memory_size      = 512
  timeout          = 60

  reserved_concurrent_executions = 1

  environment {
    variables = {
      APPSYNC_HTTP_DOMAIN = var.appsync_http_domain
      MODEL_ID            = local.model_id
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.consumer_msk,
    aws_iam_role_policy.consumer_appsync,
    aws_iam_role_policy.consumer_bedrock,
    aws_cloudwatch_log_group.consumer,
  ]
}

# On-demand mode (no provisioned_poller_config).
resource "aws_lambda_event_source_mapping" "consumer" {
  function_name     = aws_lambda_function.consumer.arn
  event_source_arn  = var.msk_cluster_arn
  topics            = [var.topic]
  starting_position = "TRIM_HORIZON"
  batch_size        = 1

  amazon_managed_kafka_event_source_config {
    consumer_group_id = local.function_name
  }
}
