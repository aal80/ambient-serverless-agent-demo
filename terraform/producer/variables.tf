variable "project_name" {
  type        = string
  description = "Prefix for resource names."
}

variable "subnet_ids" {
  type        = list(string)
  description = "Subnets the function attaches to; must be able to reach the MSK brokers."
}

variable "security_group_id" {
  type = string
}

variable "bootstrap_brokers" {
  type        = string
  description = "Plaintext bootstrap broker string."
}

variable "topic" {
  type    = string
  default = "customer-messages"
}
