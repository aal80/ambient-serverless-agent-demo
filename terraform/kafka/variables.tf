variable "project_name" {
  type        = string
  description = "Prefix for resource names."
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the VPC hosting the MSK cluster."
  default     = "10.0.0.0/16"
}
