# Squelette fourni (lab terraform) : les deux images dont vos conteneurs ont besoin.
# Utilisez-les par leur identifiant : image = docker_image.server.image_id

# L'image « serveur » du cours (Debian, sshd, Node.js 24, script de service), construite depuis infra/server/.
# Le contexte est envoyé au démon Docker par l'API : aucune montée de fichiers.
resource "docker_image" "server" {
  name         = "usine-server:lab"
  keep_locally = true

  build {
    context    = abspath("${path.module}/../../infra")
    dockerfile = "server/Dockerfile"
  }
}

# PostgreSQL 18, la même image que la base de test (épinglée par condensat, téléchargée par usine pull).
resource "docker_image" "postgres" {
  name         = "postgres:18-alpine@sha256:0115267ab5a509022df9319c77be365cef335adb71556c75f60f5360ee247e71"
  keep_locally = true
}
