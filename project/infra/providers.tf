# Squelette fourni (lab terraform) : le provider est configuré, vous n'avez rien à changer ici.
# Le provider Docker pilote le démon Docker de votre poste, celui où tournent déjà les serveurs du cours.
# Il est déjà dans l'environnement (miroir local) : terraform init ne télécharge rien.
terraform {
  required_version = ">= 1.10"

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "4.7.0"
    }
  }
}

provider "docker" {}
