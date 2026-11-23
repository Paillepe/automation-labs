# Squelette fourni (lab terraform) : les variables du projet.

variable "db_password" {
  type        = string
  description = "Mot de passe de l'utilisateur reservations de la base. Identifiant de LAB, sans valeur hors du cours."
  default     = "lab-db-password"
  sensitive   = true
}

variable "web_count" {
  type        = number
  description = "Nombre de serveurs web (bonus du lab : piloter le nombre de serveurs par cette variable)."
  default     = 2
}
