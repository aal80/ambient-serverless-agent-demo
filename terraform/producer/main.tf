locals {
  function_name = "${var.project_name}-producer"
}

# Run `npm ci --omit=dev` in ./producer first so node_modules is included.
data "archive_file" "producer" {
  type        = "zip"
  source_dir  = "${path.module}/../../producer"
  output_path = "${path.module}/../.build/producer.zip"
}

resource "aws_iam_role" "producer" {
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

resource "aws_iam_role_policy_attachment" "producer_vpc" {
  role       = aws_iam_role.producer.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_cloudwatch_log_group" "producer" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = 7
}

resource "aws_lambda_function" "producer" {
  function_name    = local.function_name
  role             = aws_iam_role.producer.arn
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.producer.output_path
  source_code_hash = data.archive_file.producer.output_base64sha256
  memory_size      = 256
  timeout          = 15

  reserved_concurrent_executions = 1

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [var.security_group_id]
  }

  environment {
    variables = {
      KAFKA_BOOTSTRAP_BROKERS = var.bootstrap_brokers
      KAFKA_TOPIC             = var.topic
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.producer_vpc,
    aws_cloudwatch_log_group.producer,
  ]
}
