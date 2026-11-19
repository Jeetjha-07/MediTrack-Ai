
# ==========================================
# MediTrack AI - Terraform Configuration
# ==========================================

# 1. MediTrack Security Group
resource "aws_security_group" "meditrack_sg" {
  name        = "meditrack-ai-sg"
  description = "Allow SSH access from my IP"

  ingress {
    description = "Allow SSH access from anywhere (temporary)"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Allow MediTrack application"
    from_port   = 4000
    to_port     = 4000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "meditrack-ai-sg"
    Project = "meditrack-ai"
  }
}

# 2. MediTrack EC2
resource "aws_instance" "meditrack" {
  ami           = "ami-0254b5ec2e774b221"
  instance_type = "t3.micro"
  key_name      = "meditrack-ai-key"

  vpc_security_group_ids = [
    "sg-074822accae3b79b4"
  ]

  tags = {
    Name        = "meditrack-ai-dev"
    Environment = "dev"
    Project     = "meditrack-ai"
  }

  lifecycle {
    ignore_changes = all
  }
}

# 3. MediTrack Key Pair
resource "aws_key_pair" "meditrack_key" {
  key_name   = "meditrack-ai-key"
  public_key = file(pathexpand("~/.ssh/id_ed25519.pub"))
}

# 4. Ansible Master EC2
resource "aws_instance" "ansible_master" {
  ami           = "ami-0254b5ec2e774b221"
  instance_type = "t3.micro"
  key_name      = "AnsibleKey"

  subnet_id = "subnet-0a9554320eeec38f5"

  vpc_security_group_ids = [
    "sg-0c666d2482d98d892"
  ]

  tags = {
    Name = "AnsibleMaster"
  }

  lifecycle {
    ignore_changes = all
  }
}

# 5. Start Ansible Master
resource "aws_ec2_instance_state" "ansible_master" {
  instance_id = "i-04517cbd6244c097d"
  state       = "running"
}

# 6. Start MediTrack
resource "aws_ec2_instance_state" "meditrack" {
  instance_id = "i-033b8832916dd6692"
  state       = "running"
}

# 7. Start Puppet Master
resource "aws_ec2_instance_state" "puppet_master" {
  instance_id = "i-0124d9ecb78236928"
  state       = "running"
}

# 8. Start Nagios
resource "aws_ec2_instance_state" "nagios" {
  instance_id = "i-02942cc618314d220"
  state       = "running"
}


# 9. Run Ansible Deployment Automatically
resource "terraform_data" "ansible_deployment" {

  # Change this version to trigger deployment again
  triggers_replace = [
    "github-deploy-v1"
  ]

  depends_on = [
    aws_ec2_instance_state.ansible_master,
    aws_ec2_instance_state.meditrack,
    aws_ec2_instance_state.puppet_master,
    aws_ec2_instance_state.nagios
  ]

  provisioner "local-exec" {
    interpreter = ["PowerShell", "-Command"]

    command = "$ip = aws ec2 describe-instances --region eu-north-1 --instance-ids i-04517cbd6244c097d --query 'Reservations[0].Instances[0].PublicIpAddress' --output text; Start-Sleep -Seconds 30; ssh -o StrictHostKeyChecking=accept-new -i 'D:\\Term7\\DevOps\\AnsibleKey.pem' ubuntu@$ip 'sudo apt-get update && sudo apt-get install -y git ansible && if [ -d ~/MediTrack-Ai/.git ]; then git -C ~/MediTrack-Ai pull origin main; else git clone https://github.com/Jeetjha-07/MediTrack-Ai.git ~/MediTrack-Ai; fi && cd ~/MediTrack-Ai/ansible && ansible-playbook deploy.yml --vault-password-file /home/ubuntu/.vault_pass'"
  }
}
