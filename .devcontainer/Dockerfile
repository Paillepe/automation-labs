# Outillage du cours « Automatisation – Usine Logicielle ». Tout est épinglé : la même image pour toute la salle.
# Debian 13 (trixie) : son Python 3.13 est celui qu'exige ansible-core 2.22.
FROM mcr.microsoft.com/devcontainers/base:trixie@sha256:41ff7ce12ec45f2704f27a6e091831186ad922ec8112e6339425bfefdf5a70f9

ARG NODE_VERSION=24.22.3
ARG TERRAFORM_VERSION=1.17.2
ARG KUBECTL_VERSION=1.37.2
ARG K3D_VERSION=5.9.0
ARG GH_VERSION=2.105.0
ARG ACTIONLINT_VERSION=1.7.12
ARG TF_DOCKER_PROVIDER_VERSION=4.7.0
ARG ANSIBLE_CORE_VERSION=2.22.0
ARG ANSIBLE_LINT_VERSION=26.11.0

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl git jq openssh-client shellcheck unzip xz-utils python3 python3-venv \
 && rm -rf /var/lib/apt/lists/*

# Binaires publiés par leurs éditeurs, pour amd64 (PC, Mac Intel, Codespaces) comme pour arm64 (Apple Silicon).
# Le provider Docker de Terraform est déposé dans le miroir local implicite : « terraform init » ne dépend pas du réseau.
RUN arch="$(dpkg --print-architecture)" \
 && case "$arch" in amd64) node_arch=x64 ;; arm64) node_arch=arm64 ;; *) echo "architecture non prise en charge : $arch" >&2; exit 1 ;; esac \
 && cd /tmp \
 && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" \
      | tar -xJ -C /usr/local --strip-components=1 --exclude='*.md' --exclude=LICENSE \
 && curl -fsSLo terraform.zip "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_${arch}.zip" \
 && unzip -q terraform.zip terraform -d /usr/local/bin && rm terraform.zip \
 && curl -fsSLo /usr/local/bin/kubectl "https://dl.k8s.io/release/v${KUBECTL_VERSION}/bin/linux/${arch}/kubectl" \
 && curl -fsSLo /usr/local/bin/k3d "https://github.com/k3d-io/k3d/releases/download/v${K3D_VERSION}/k3d-linux-${arch}" \
 && curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${arch}.tar.gz" \
      | tar -xz -C /usr/local --strip-components=1 "gh_${GH_VERSION}_linux_${arch}/bin/gh" \
 && curl -fsSL "https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/actionlint_${ACTIONLINT_VERSION}_linux_${arch}.tar.gz" \
      | tar -xz -C /usr/local/bin actionlint \
 && chmod 0755 /usr/local/bin/kubectl /usr/local/bin/k3d \
 && tf_mirror=/usr/local/share/terraform/plugins/registry.terraform.io/kreuzwerker/docker \
 && mkdir -p "$tf_mirror" \
 && curl -fsSLo "$tf_mirror/terraform-provider-docker_${TF_DOCKER_PROVIDER_VERSION}_linux_${arch}.zip" \
      "https://github.com/kreuzwerker/terraform-provider-docker/releases/download/v${TF_DOCKER_PROVIDER_VERSION}/terraform-provider-docker_${TF_DOCKER_PROVIDER_VERSION}_linux_${arch}.zip" \
 && node --version && terraform version && kubectl version --client && k3d version && gh --version && actionlint -version

# Ansible dans son propre environnement Python : rien ne touche au Python du système.
RUN python3 -m venv /opt/ansible \
 && /opt/ansible/bin/pip install --no-cache-dir "ansible-core==${ANSIBLE_CORE_VERSION}" "ansible-lint==${ANSIBLE_LINT_VERSION}" \
 && for bin in ansible ansible-playbook ansible-galaxy ansible-vault ansible-inventory ansible-config ansible-doc ansible-lint; do \
      ln -s "/opt/ansible/bin/$bin" "/usr/local/bin/$bin"; \
    done \
 && ansible --version && ansible-lint --version

# Sur Docker Desktop, le dossier monté paraît parfois appartenir à un autre utilisateur juste après une écriture :
# git refuserait alors le dépôt (« dubious ownership »). Le dépôt du cours est le seul que l'on monte ici.
RUN git config --system --add safe.directory '*'
