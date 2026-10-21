data "aws_region" "current" {}

# The on-demand MSK event source mapping polls from ENIs in the MSK subnets and
# needs to reach Lambda and STS; the subnets have no internet access.
resource "aws_vpc_endpoint" "this" {
  for_each = toset(["lambda", "sts"])

  vpc_id              = aws_vpc.this.id
  service_name        = "com.amazonaws.${data.aws_region.current.region}.${each.key}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.msk.id]
  private_dns_enabled = true

  tags = {
    Name = "${var.project_name}-${each.key}"
  }
}
