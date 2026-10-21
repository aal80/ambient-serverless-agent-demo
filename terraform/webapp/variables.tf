variable "project_name" {
  type        = string
  description = "Prefix for resource names."
}

variable "tags" {
  type        = map(string)
  description = "Tags for the Web Function (awscc has no provider-level default tags)."
}

variable "producer_function_arn" {
  type = string
}

variable "appsync_http_domain" {
  type = string
}

variable "appsync_realtime_domain" {
  type = string
}

variable "appsync_api_key" {
  type      = string
  sensitive = true
}

variable "demo_key" {
  type      = string
  sensitive = true
}

variable "cookie_sign_key" {
  type      = string
  sensitive = true
}
