#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

CONTEXT="${REPO_ROOT}"
DOCKERFILE="${REPO_ROOT}/Dockerfile"
BUILDER="oneshare-builder"
IMAGE=""
TAG=""
PLATFORMS=""
OUTPUT_MODE=""
ARCHIVE_PATH=""
NO_CACHE=0
DRY_RUN=0
INTERACTIVE=0
ASSUME_YES=0
ARGS_PROVIDED=0

usage() {
  cat <<'EOF'
Usage:
  scripts/build-image.sh [options]

Interactive:
  scripts/build-image.sh
  scripts/build-image.sh --interactive

Options:
  --image IMAGE             Image repository or full image ref.
  --tag TAG                 Image tag. Overrides tag from --image/docker-compose.yml.
  --platforms LIST          Target platforms, e.g. linux/amd64,linux/arm64.
  --amd64                   Shortcut for --platforms linux/amd64.
  --arm64                   Shortcut for --platforms linux/arm64.
  --multi                   Shortcut for --platforms linux/amd64,linux/arm64.
  --push                    Push image to registry.
  --load                    Load single-platform image into local Docker.
  --oci                     Export OCI archive instead of push/load.
  --archive PATH            OCI archive path. Implies --oci.
  --cache-only              Build without exporting. Mostly useful for warming cache.
  --no-cache                Build without cache.
  --builder NAME            Docker buildx builder name.
  --context PATH            Docker build context. Default: repository root.
  --dockerfile PATH         Dockerfile path. Default: repository Dockerfile.
  --yes                     Non-interactive. Use defaults for unspecified options.
  --interactive             Force interactive prompts.
  --dry-run                 Print the docker buildx command without running it.
  -h, --help                Show this help.

Examples:
  scripts/build-image.sh
  scripts/build-image.sh --multi --push --tag 1.1.0
  scripts/build-image.sh --amd64 --load --tag local-test
  scripts/build-image.sh --multi --oci --archive dist/docker/oneshare.oci.tar
EOF
}

die() {
  echo "Error: $*" >&2
  exit 1
}

log() {
  echo "==> $*"
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

default_compose_image() {
  local compose_file="${REPO_ROOT}/docker-compose.yml"
  if [[ -f "${compose_file}" ]]; then
    awk '
      /^[[:space:]]*image:[[:space:]]*/ {
        sub(/^[[:space:]]*image:[[:space:]]*/, "", $0)
        gsub(/["'\'']/, "", $0)
        print $0
        exit
      }
    ' "${compose_file}"
  fi
}

split_image_ref() {
  local ref="$1"
  local last_part="${ref##*/}"
  if [[ "${last_part}" == *:* ]]; then
    IMAGE="${ref%:*}"
    TAG="${TAG:-${ref##*:}}"
  else
    IMAGE="${ref}"
  fi
}

host_platform() {
  local os="linux"
  local arch
  arch="$(docker info --format '{{.Architecture}}' 2>/dev/null || uname -m)"

  case "${arch}" in
    x86_64|amd64) arch="amd64" ;;
    aarch64|arm64) arch="arm64" ;;
    armv7l) arch="arm/v7" ;;
  esac

  echo "${os}/${arch}"
}

is_multi_platform() {
  [[ "$1" == *,* ]]
}

prompt_text() {
  local label="$1"
  local default="$2"
  local value

  read -r -p "${label} [${default}]: " value
  echo "${value:-${default}}"
}

prompt_choice() {
  local label="$1"
  local default="$2"
  shift 2
  local choices=("$@")
  local value

  echo "${label}" >&2
  local i
  for i in "${!choices[@]}"; do
    local number=$((i + 1))
    if [[ "${number}" == "${default}" ]]; then
      echo "  ${number}) ${choices[$i]} (default)" >&2
    else
      echo "  ${number}) ${choices[$i]}" >&2
    fi
  done

  read -r -p "Select [${default}]: " value
  value="${value:-${default}}"
  [[ "${value}" =~ ^[0-9]+$ ]] || die "Invalid choice: ${value}"
  (( value >= 1 && value <= ${#choices[@]} )) || die "Invalid choice: ${value}"
  echo "${value}"
}

parse_args() {
  ARGS_PROVIDED=$#

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --image)
        [[ $# -ge 2 ]] || die "--image requires a value"
        split_image_ref "$2"
        shift 2
        ;;
      --tag)
        [[ $# -ge 2 ]] || die "--tag requires a value"
        TAG="$2"
        shift 2
        ;;
      --platforms)
        [[ $# -ge 2 ]] || die "--platforms requires a value"
        PLATFORMS="$2"
        shift 2
        ;;
      --amd64)
        PLATFORMS="linux/amd64"
        shift
        ;;
      --arm64)
        PLATFORMS="linux/arm64"
        shift
        ;;
      --multi)
        PLATFORMS="linux/amd64,linux/arm64"
        shift
        ;;
      --push)
        OUTPUT_MODE="push"
        shift
        ;;
      --load)
        OUTPUT_MODE="load"
        shift
        ;;
      --oci)
        OUTPUT_MODE="oci"
        shift
        ;;
      --archive)
        [[ $# -ge 2 ]] || die "--archive requires a value"
        OUTPUT_MODE="oci"
        ARCHIVE_PATH="$2"
        shift 2
        ;;
      --cache-only)
        OUTPUT_MODE="cache"
        shift
        ;;
      --no-cache)
        NO_CACHE=1
        shift
        ;;
      --builder)
        [[ $# -ge 2 ]] || die "--builder requires a value"
        BUILDER="$2"
        shift 2
        ;;
      --context)
        [[ $# -ge 2 ]] || die "--context requires a value"
        CONTEXT="$2"
        shift 2
        ;;
      --dockerfile)
        [[ $# -ge 2 ]] || die "--dockerfile requires a value"
        DOCKERFILE="$2"
        shift 2
        ;;
      --yes)
        ASSUME_YES=1
        shift
        ;;
      --interactive)
        INTERACTIVE=1
        shift
        ;;
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "Unknown option: $1"
        ;;
    esac
  done
}

interactive_config() {
  local compose_image
  compose_image="$(default_compose_image)"

  if [[ -z "${IMAGE}" ]]; then
    split_image_ref "${compose_image:-oneshare}"
  fi

  TAG="${TAG:-$(git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || echo latest)}"

  IMAGE="$(prompt_text "Image repository" "${IMAGE}")"
  TAG="$(prompt_text "Image tag" "${TAG}")"

  local platform_choice
  platform_choice="$(prompt_choice \
    "Target platform" \
    "1" \
    "linux/amd64" \
    "linux/arm64" \
    "linux/amd64,linux/arm64" \
    "current Docker host ($(host_platform))" \
    "custom")"

  case "${platform_choice}" in
    1) PLATFORMS="linux/amd64" ;;
    2) PLATFORMS="linux/arm64" ;;
    3) PLATFORMS="linux/amd64,linux/arm64" ;;
    4) PLATFORMS="$(host_platform)" ;;
    5) PLATFORMS="$(prompt_text "Custom platforms" "${PLATFORMS:-linux/amd64}")" ;;
  esac

  local default_output="1"
  if is_multi_platform "${PLATFORMS}"; then
    default_output="2"
  fi

  local output_choice
  output_choice="$(prompt_choice \
    "Output mode" \
    "${default_output}" \
    "load into local Docker (single platform only)" \
    "push to registry" \
    "export OCI archive" \
    "cache only")"

  case "${output_choice}" in
    1) OUTPUT_MODE="load" ;;
    2) OUTPUT_MODE="push" ;;
    3) OUTPUT_MODE="oci" ;;
    4) OUTPUT_MODE="cache" ;;
  esac

  if [[ "${OUTPUT_MODE}" == "oci" && -z "${ARCHIVE_PATH}" ]]; then
    ARCHIVE_PATH="$(prompt_text "OCI archive path" "${REPO_ROOT}/dist/docker/oneshare-${TAG}.oci.tar")"
  fi

  local no_cache_choice
  no_cache_choice="$(prompt_choice "Use Docker cache" "1" "yes" "no")"
  if [[ "${no_cache_choice}" == "2" ]]; then
    NO_CACHE=1
  fi
}

default_config() {
  local compose_image
  compose_image="$(default_compose_image)"

  if [[ -z "${IMAGE}" ]]; then
    split_image_ref "${compose_image:-oneshare:latest}"
  fi

  TAG="${TAG:-latest}"
  PLATFORMS="${PLATFORMS:-$(host_platform)}"

  if [[ -z "${OUTPUT_MODE}" ]]; then
    if is_multi_platform "${PLATFORMS}"; then
      OUTPUT_MODE="push"
    else
      OUTPUT_MODE="load"
    fi
  fi

  if [[ "${OUTPUT_MODE}" == "oci" && -z "${ARCHIVE_PATH}" ]]; then
    ARCHIVE_PATH="${REPO_ROOT}/dist/docker/oneshare-${TAG}.oci.tar"
  fi
}

validate_config() {
  command_exists docker || die "docker is not installed or not on PATH"
  docker buildx version >/dev/null 2>&1 || die "docker buildx is not available"

  [[ -f "${DOCKERFILE}" ]] || die "Dockerfile not found: ${DOCKERFILE}"
  [[ -d "${CONTEXT}" ]] || die "Build context not found: ${CONTEXT}"
  [[ -n "${IMAGE}" ]] || die "Image repository is empty"
  [[ -n "${TAG}" ]] || die "Image tag is empty"
  [[ -n "${PLATFORMS}" ]] || die "Target platforms are empty"

  if [[ "${OUTPUT_MODE}" == "load" ]] && is_multi_platform "${PLATFORMS}"; then
    die "--load only supports one platform. Use --push or --oci for multi-platform builds."
  fi
}

ensure_builder() {
  if docker buildx inspect "${BUILDER}" >/dev/null 2>&1; then
    docker buildx use "${BUILDER}" >/dev/null
  else
    log "Creating buildx builder: ${BUILDER}"
    docker buildx create --name "${BUILDER}" --driver docker-container --use >/dev/null
  fi

  docker buildx inspect --bootstrap >/dev/null
}

build_image() {
  local image_ref="${IMAGE}:${TAG}"
  local cmd=(
    docker buildx build "${CONTEXT}"
    --file "${DOCKERFILE}"
    --platform "${PLATFORMS}"
    --tag "${image_ref}"
  )

  if [[ "${NO_CACHE}" == "1" ]]; then
    cmd+=(--no-cache)
  fi

  case "${OUTPUT_MODE}" in
    push)
      cmd+=(--push)
      ;;
    load)
      cmd+=(--load)
      ;;
    oci)
      mkdir -p "$(dirname "${ARCHIVE_PATH}")"
      cmd+=(--output "type=oci,dest=${ARCHIVE_PATH}")
      ;;
    cache)
      ;;
    *)
      die "Unknown output mode: ${OUTPUT_MODE}"
      ;;
  esac

  echo
  log "Build summary"
  echo "  Image:      ${image_ref}"
  echo "  Platforms:  ${PLATFORMS}"
  echo "  Output:     ${OUTPUT_MODE}"
  echo "  Dockerfile: ${DOCKERFILE}"
  echo "  Context:    ${CONTEXT}"
  echo "  Builder:    ${BUILDER}"
  if [[ "${OUTPUT_MODE}" == "oci" ]]; then
    echo "  Archive:    ${ARCHIVE_PATH}"
  fi
  echo

  if [[ "${DRY_RUN}" == "1" ]]; then
    printf 'Dry run:'
    printf ' %q' "${cmd[@]}"
    echo
    return
  fi

  log "Running docker buildx"
  "${cmd[@]}"

  case "${OUTPUT_MODE}" in
    push)
      log "Pushed ${image_ref}"
      ;;
    load)
      log "Loaded ${image_ref} into local Docker"
      ;;
    oci)
      log "Wrote OCI archive: ${ARCHIVE_PATH}"
      ;;
    cache)
      log "Build completed without export"
      ;;
  esac
}

main() {
  parse_args "$@"

  if [[ "${INTERACTIVE}" == "1" || ( "${ARGS_PROVIDED}" == "0" && -t 0 && "${ASSUME_YES}" == "0" ) ]]; then
    interactive_config
  else
    default_config
  fi

  validate_config
  if [[ "${DRY_RUN}" != "1" ]]; then
    ensure_builder
  fi
  build_image
}

main "$@"
