output "kafka_bootstrap_brokers" {
  value = module.kafka.bootstrap_brokers
}

output "producer_function_name" {
  value = module.producer.function_name
}

output "consumer_function_name" {
  value = module.consumer.function_name
}

output "webapp_url" {
  value = module.webapp.url
}
