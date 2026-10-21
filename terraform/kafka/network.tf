data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  # MSK requires at least two AZs; one private subnet per AZ.
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = var.project_name
  }
}

resource "aws_subnet" "private" {
  count = length(local.azs)

  vpc_id            = aws_vpc.this.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index)

  tags = {
    Name = "${var.project_name}-private-${local.azs[count.index]}"
  }
}

# Single allow-all security group shared by everything in the VPC. Acceptable for
# this demo because the subnets are private (no IGW/NAT). Named "msk" because
# renaming it would force replacement of the MSK cluster.
resource "aws_security_group" "msk" {
  name        = "${var.project_name}-msk"
  description = "MSK brokers"
  vpc_id      = aws_vpc.this.id
}

resource "aws_vpc_security_group_ingress_rule" "all" {
  security_group_id = aws_security_group.msk.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_vpc_security_group_egress_rule" "msk_all" {
  security_group_id = aws_security_group.msk.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
