data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  project_name = "ambient-agent-demo"
  region       = data.aws_region.current.region
  account_id   = data.aws_caller_identity.current.account_id
}

module "kafka" {
  source = "./kafka"

  project_name = local.project_name
}

module "producer" {
  source = "./producer"

  project_name      = local.project_name
  subnet_ids        = module.kafka.private_subnet_ids
  security_group_id = module.kafka.security_group_id
  bootstrap_brokers = module.kafka.bootstrap_brokers
}

module "consumer" {
  source = "./consumer"

  project_name                   = local.project_name
  msk_cluster_arn                = module.kafka.msk_cluster_arn
  topic                          = module.producer.topic
  appsync_http_domain            = module.appsync.http_domain
  appsync_sessions_namespace_arn = module.appsync.sessions_namespace_arn
}

module "appsync" {
  source = "./appsync"

  project_name = local.project_name
}

module "webapp" {
  source = "./webapp"

  project_name            = local.project_name
  tags                    = local.default_tags
  producer_function_arn   = module.producer.function_arn
  appsync_http_domain     = module.appsync.http_domain
  appsync_realtime_domain = module.appsync.realtime_domain
  appsync_api_key         = module.appsync.api_key
  demo_key                = var.demo_key
  cookie_sign_key         = var.cookie_sign_key
}
