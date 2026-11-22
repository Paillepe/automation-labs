# Spike : Terraform (provider Docker) crée et détruit réseaux et conteneurs depuis le devcontainer.
terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "4.7.0"
    }
  }
}

provider "docker" {}

variable "infra_dir" {
  type        = string
  description = "Dossier infra/ du dépôt : contexte de construction de l'image serveur"
}

resource "docker_network" "front" {
  name = "spike-front"
}

resource "docker_network" "back" {
  name = "spike-back"
}

resource "docker_image" "server" {
  name = "usine-server:spike"
  build {
    context    = var.infra_dir
    dockerfile = "server/Dockerfile"
  }
}

resource "docker_image" "postgres" {
  name         = "postgres:18-alpine@sha256:0115267ab5a509022df9319c77be365cef335adb71556c75f60f5360ee247e71"
  keep_locally = true
}

resource "docker_container" "web" {
  count    = 2
  name     = "spike-srv-web-${count.index + 1}"
  hostname = "spike-srv-web-${count.index + 1}"
  image    = docker_image.server.image_id

  networks_advanced {
    name = docker_network.front.name
  }
  networks_advanced {
    name = docker_network.back.name
  }
}

resource "docker_container" "db" {
  name  = "spike-db"
  image = docker_image.postgres.image_id
  env   = ["POSTGRES_PASSWORD=mot-de-passe-de-lab"]

  networks_advanced {
    name = docker_network.back.name
  }
}
