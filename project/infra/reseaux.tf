
resource "docker_network" "front" {
  name = "front"
}

resource "docker_network" "back" {
  name = "back"
}
