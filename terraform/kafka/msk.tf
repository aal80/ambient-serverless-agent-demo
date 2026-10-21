locals {
  # kafka.t3.small doesn't support KRaft, so this is the newest ZooKeeper-mode version.
  kafka_version = "3.9.x"
}

resource "aws_msk_configuration" "this" {
  name           = var.project_name
  kafka_versions = [local.kafka_version]

  server_properties = <<-EOT
    auto.create.topics.enable=true
  EOT
}

resource "aws_msk_cluster" "this" {
  cluster_name           = var.project_name
  kafka_version          = local.kafka_version
  number_of_broker_nodes = length(aws_subnet.private)

  broker_node_group_info {
    instance_type   = "kafka.t3.small"
    client_subnets  = aws_subnet.private[*].id
    security_groups = [aws_security_group.msk.id]

    storage_info {
      ebs_storage_info {
        volume_size = 10
      }
    }
  }

  configuration_info {
    arn      = aws_msk_configuration.this.arn
    revision = aws_msk_configuration.this.latest_revision
  }

  client_authentication {
    unauthenticated = true
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "PLAINTEXT"
      in_cluster    = true
    }
  }
}
