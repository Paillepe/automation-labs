# Service de réservation des médiathèques de Valmorin

L'application que l'équipe de développement vous remet. **Vous ne la modifiez pas** : vous l'industrialisez.
Node.js 24, une seule dépendance d'exécution (`pg`, le client PostgreSQL).

## Commandes

```bash
cd app
npm ci            # installe les dépendances
npm test          # tests unitaires ; rapport JUnit dans reports/junit.xml
npm run lint      # analyse statique (ESLint)
npm start         # démarre le service sur le port 8080
```

Image : `docker build --build-arg APP_VERSION=1.0.0 --build-arg APP_COMMIT="$(git rev-parse HEAD)" -t reservations app`

## Points techniques

| Chemin | Rôle | Réponse |
|---|---|---|
| `GET /health` | Le processus est vivant | 200 `{"status":"ok"}`, même sans base |
| `GET /ready` | Prêt à servir : la base répond | 200, sinon 503 avec la raison (`reason`) |
| `GET /version` | Ce qui tourne | `{"service","version","commit"}`, lus dans `APP_VERSION` et `APP_COMMIT` |
| `GET /metrics` | Métriques Prometheus | `http_requests_total`, `http_request_duration_seconds`, `app_info`, `process_*` |

API : `GET /api/sites`, `GET /api/config`, `GET /api/reservations`,
`POST /api/reservations` avec `{"numero_carte":"VAL000123","titre":"…","site_id":3}`.

L'application **démarre sans base** : `/health` est vert, `/ready` est rouge, l'API répond 503.

## Réglages (variables d'environnement)

| Variable | Défaut | Rôle |
|---|---|---|
| `APP_VERSION`, `APP_COMMIT` | `0.0.0-dev`, `unknown` | Version et commit renvoyés par `/version`. Posés par celui qui déploie |
| `PORT` | `8080` | Port d'écoute |
| `DB_HOST` | — | Hôte PostgreSQL. Absent : pas de base |
| `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | `5432`, `reservations`, `reservations`, — | Connexion à la base |
| `RESERVATION_HOLD_DAYS` | `7` | Jours pendant lesquels un ouvrage réservé est mis de côté |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `SHUTDOWN_DELAY_MS` | `2000` | À l'arrêt (SIGTERM), délai pendant lequel `/ready` répond 503 avant la fermeture |
| `FAULT_TOKEN` | — | Active l'injection de pannes (voir plus bas) |
| `APP_REQUIRED_ENV` | — | Liste de réglages que cette version exige : s'il en manque un, l'application refuse de démarrer |
| `APP_BALLAST_MB` | `0` | Mémoire occupée au démarrage, en Mio |

Un réglage invalide ou manquant arrête l'application au démarrage, avec un log `fatal` qui le nomme :

```json
{"level":"fatal","msg":"Réglage obligatoire absent : RESERVATION_HOLD_DAYS. …","event":"config_error","setting":"RESERVATION_HOLD_DAYS"}
```

## Logs

Une ligne JSON par évènement sur la sortie standard : `time`, `level`, `service`, `msg`, `event`, et pour chaque
requête `request_id`, `method`, `path`, `status`, `duration_ms`. L'identifiant de requête est repris de l'en-tête
`X-Request-Id` s'il est fourni, et renvoyé dans la réponse. Les requêtes vers `/health`, `/ready`, `/version` et
`/metrics` sont journalisées au niveau `debug`.

## Injection de pannes (labs `resilience` et `monitoring`)

Désactivée tant que `FAULT_TOKEN` n'est pas défini. Chaque appel porte l'en-tête `X-Fault-Token`.

| Appel | Effet |
|---|---|
| `POST /fault` `{"errorRate":0.5}` | La moitié des requêtes de l'API répondent 500 |
| `POST /fault` `{"latencyMs":800}` | 800 ms ajoutées à chaque requête de l'API |
| `POST /fault/freeze` `{"seconds":30}` | Le processus se fige (sans `seconds` : pour toujours). `/health` ne répond plus |
| `GET /fault`, `DELETE /fault` | État des pannes ; retrait des pannes |

Chaque erreur injectée écrit dans les logs une référence unique (`error_ref`, de la forme `ERR-1A2B3C4D`),
qui ne figure pas dans la réponse HTTP. Les points techniques ne sont jamais touchés par les pannes.
