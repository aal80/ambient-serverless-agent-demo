output "function_name" {
  value = aws_lambda_function.consumer.function_name
}

output "event_source_mapping_uuid" {
  value = aws_lambda_event_source_mapping.consumer.uuid
}
