
variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "meditrack-ai"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
}

variable "instance_type" {
  description = "AWS EC2 instance type"
  type        = string
  default     = "t3.micro"
}
