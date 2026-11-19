
output "project_name" {
  description = "Name of the MediTrack project"
  value       = var.project_name
}

output "environment" {
  description = "Deployment environment"
  value       = var.environment
}

output "instance_type" {
  description = "Selected EC2 instance type"
  value       = var.instance_type
}

output "instance_id" {
  description = "ID of MediTrack EC2 instance"
  value       = aws_instance.meditrack.id
}

output "public_ip" {
  description = "Public IP of MediTrack EC2 instance"
  value       = aws_instance.meditrack.public_ip
}

output "private_ip" {
  description = "Private IP of MediTrack EC2 instance"
  value       = aws_instance.meditrack.private_ip
}

output "security_group_id" {
  description = "Security Group ID of MediTrack"
  value       = aws_security_group.meditrack_sg.id
}
