output "url" {
  value = "https://${awscc_lambda_web_function_endpoint.webapp.domain_name}"
}

output "function_name" {
  value = awscc_lambda_web_function.webapp.function_name
}

output "secret_arn" {
  value = aws_secretsmanager_secret.webapp.arn
}
