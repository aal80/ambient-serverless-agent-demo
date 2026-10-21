variable "project_name" {
  type        = string
  description = "Prefix for resource names."
}

variable "msk_cluster_arn" {
  type = string
}

variable "topic" {
  type = string
}

variable "appsync_http_domain" {
  type        = string
  description = "AppSync Events HTTP domain that replies are published to."
}

variable "appsync_sessions_namespace_arn" {
  type = string
}
