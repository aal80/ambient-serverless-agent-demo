output "vpc_id" {
  value = aws_vpc.this.id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "security_group_id" {
  value = aws_security_group.msk.id
}

output "msk_cluster_arn" {
  value = aws_msk_cluster.this.arn

  # Event source mappings built from this ARN can't poll until the endpoints exist.
  depends_on = [aws_vpc_endpoint.this]
}

output "bootstrap_brokers" {
  description = "Plaintext (port 9092) bootstrap broker string."
  value       = aws_msk_cluster.this.bootstrap_brokers
}
