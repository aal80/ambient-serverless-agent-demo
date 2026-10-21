output "function_name" {
  value = aws_lambda_function.producer.function_name
}

output "topic" {
  value = var.topic
}

output "function_arn" {
  value = aws_lambda_function.producer.arn
}
