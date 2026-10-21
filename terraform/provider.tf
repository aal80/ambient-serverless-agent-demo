terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.69.1"
    }
    awscc = {
      source  = "hashicorp/awscc"
      version = ">= 1.106.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.8.1"
    }
    local = {
      source  = "hashicorp/local"
      version = ">= 2.9.1"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.9.1"
    }
  }
}

locals {
  default_tags = {
    project_name = "ambient-serverless-agent-demo"
  }
}

provider "aws" {
  default_tags {
    tags = local.default_tags
  }
}

# awscc has no provider-level default_tags; pass local.default_tags to each
# awscc resource's `tags` argument instead.
provider "awscc" {}
