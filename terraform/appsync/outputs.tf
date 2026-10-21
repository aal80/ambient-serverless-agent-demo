output "http_domain" {
  value = aws_appsync_api.this.dns["HTTP"]
}

output "realtime_domain" {
  value = aws_appsync_api.this.dns["REALTIME"]
}

output "api_key" {
  value     = aws_appsync_api_key.browser.key
  sensitive = true
}

output "sessions_namespace_arn" {
  value = aws_appsync_channel_namespace.sessions.channel_namespace_arn
}

output "api_arn" {
  value = aws_appsync_api.this.api_arn
}
