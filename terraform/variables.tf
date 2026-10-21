# variable "hosted_zone_name" {
#   type        = string
#   description = "Route 53 hosted zone the control plane's public domain lives in. Set in terraform.tfvars (gitignored); copy terraform.tfvars.example to get started."
# }

# variable "alerts_topic_name" {
#   type        = string
#   description = "Name of the (out-of-band, not managed here) SNS topic that capacity-throttle alerts publish to. Resolved to an ARN via a data lookup in main.tf."
# }

variable "demo_key" {
  type        = string
  sensitive   = true
  description = "Key users enter on the webapp login screen. Set in terraform.tfvars (gitignored)."
}

variable "cookie_sign_key" {
  type        = string
  sensitive   = true
  description = "HMAC key that signs the webapp session cookie. Set in terraform.tfvars (gitignored)."

  validation {
    condition     = length(var.cookie_sign_key) >= 32
    error_message = "cookie_sign_key must be at least 32 characters."
  }
}
