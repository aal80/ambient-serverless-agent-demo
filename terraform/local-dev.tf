# Webapp env vars for local development (`make web-watch`), one file per variable: <repo>/tmp/<NAME>.txt.

locals {
  local_dev_dir = "${path.root}/../tmp"

  webapp_local_env = {
    PRODUCER_FUNCTION_NAME  = module.producer.function_arn
    APPSYNC_HTTP_DOMAIN     = module.appsync.http_domain
    APPSYNC_REALTIME_DOMAIN = module.appsync.realtime_domain
    SECRET_ARN              = module.webapp.secret_arn
  }
}

resource "local_file" "webapp_env" {
  for_each = local.webapp_local_env

  filename = "${local.local_dev_dir}/${each.key}.txt"
  content  = each.value
}

# Separate resource: for_each can't iterate over a sensitive value.
resource "local_sensitive_file" "webapp_api_key" {
  filename = "${local.local_dev_dir}/APPSYNC_API_KEY.txt"
  content  = module.appsync.api_key
}
