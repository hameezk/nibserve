#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────
# NibServe — Phase 1 Automated Test Runner
# Usage: ./scripts/test-phase1.sh [--e2e-only | --unit-only | --all]
# Default: runs unit tests then e2e tests
# ─────────────────────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$SCRIPT_DIR/../apps/api"
INFRA_DIR="$SCRIPT_DIR/../infra"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

RUN_UNIT=true
RUN_E2E=true

for arg in "$@"; do
  case $arg in
    --e2e-only)  RUN_UNIT=false ;;
    --unit-only) RUN_E2E=false ;;
    --all)       RUN_UNIT=true; RUN_E2E=true ;;
  esac
done

echo ""
echo "${BOLD}${BLUE}══════════════════════════════════════════════${NC}"
echo "${BOLD}${BLUE}   NibServe — Phase 1 Test Suite              ${NC}"
echo "${BOLD}${BLUE}══════════════════════════════════════════════${NC}"
echo ""

# ── Pre-flight checks ─────────────────────────────────────────────────────────

echo "${YELLOW}▶ Pre-flight checks...${NC}"

if [ ! -f "$API_DIR/.env" ]; then
  echo "${RED}✗ Missing $API_DIR/.env — copy from .env.example and fill in values${NC}"
  exit 1
fi

if ! command -v docker &> /dev/null; then
  echo "${RED}✗ Docker not found. Install Docker Desktop first.${NC}"
  exit 1
fi

# ── Start infrastructure ──────────────────────────────────────────────────────

if [ "$RUN_E2E" = true ]; then
  echo "${YELLOW}▶ Starting PostgreSQL + Redis...${NC}"
  docker compose -f "$INFRA_DIR/docker-compose.yml" up -d

  echo "${YELLOW}▶ Waiting for PostgreSQL to be ready...${NC}"
  for i in {1..30}; do
    if docker compose -f "$INFRA_DIR/docker-compose.yml" exec -T postgres pg_isready -U nibserve &>/dev/null; then
      echo "${GREEN}✓ PostgreSQL ready${NC}"
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo "${RED}✗ PostgreSQL did not become ready in time${NC}"
      exit 1
    fi
    sleep 1
  done

  echo "${YELLOW}▶ Waiting for Redis to be ready...${NC}"
  for i in {1..15}; do
    if docker compose -f "$INFRA_DIR/docker-compose.yml" exec -T redis redis-cli ping &>/dev/null; then
      echo "${GREEN}✓ Redis ready${NC}"
      break
    fi
    if [ "$i" -eq 15 ]; then
      echo "${RED}✗ Redis did not become ready in time${NC}"
      exit 1
    fi
    sleep 1
  done
fi

# ── Install dependencies ──────────────────────────────────────────────────────

echo "${YELLOW}▶ Installing dependencies...${NC}"
cd "$API_DIR" && npm install --silent
echo "${GREEN}✓ Dependencies ready${NC}"

# ── Unit Tests ────────────────────────────────────────────────────────────────

if [ "$RUN_UNIT" = true ]; then
  echo ""
  echo "${BOLD}${BLUE}── Unit Tests ──────────────────────────────────${NC}"
  echo ""

  UNIT_PASS=true

  echo "${YELLOW}▶ AuthService unit tests...${NC}"
  if npx jest --testPathPatterns="auth/auth.service.spec" --no-coverage --forceExit 2>&1; then
    echo "${GREEN}✓ AuthService unit tests passed${NC}"
  else
    echo "${RED}✗ AuthService unit tests FAILED${NC}"
    UNIT_PASS=false
  fi

  echo ""
  echo "${YELLOW}▶ UsersService unit tests...${NC}"
  if npx jest --testPathPatterns="users/users.service.spec" --no-coverage --forceExit 2>&1; then
    echo "${GREEN}✓ UsersService unit tests passed${NC}"
  else
    echo "${RED}✗ UsersService unit tests FAILED${NC}"
    UNIT_PASS=false
  fi

  if [ "$UNIT_PASS" = false ]; then
    echo ""
    echo "${RED}${BOLD}✗ Unit tests failed. Fix before running e2e.${NC}"
    exit 1
  fi

  echo ""
  echo "${GREEN}${BOLD}✓ All unit tests passed${NC}"
fi

# ── E2E Integration Tests ─────────────────────────────────────────────────────

if [ "$RUN_E2E" = true ]; then
  echo ""
  echo "${BOLD}${BLUE}── E2E Integration Tests ────────────────────────${NC}"
  echo ""
  echo "${YELLOW}▶ Running Phase 1 e2e tests (Auth + Users)...${NC}"
  echo ""

  if npx jest --config ./test/jest-e2e.json --testPathPatterns="phase1-auth" --forceExit --verbose 2>&1; then
    echo ""
    echo "${GREEN}${BOLD}✓ All e2e tests passed${NC}"
  else
    echo ""
    echo "${RED}${BOLD}✗ E2E tests failed${NC}"
    exit 1
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "${BOLD}${GREEN}══════════════════════════════════════════════${NC}"
echo "${BOLD}${GREEN}   Phase 1 — All Tests Passed ✓               ${NC}"
echo "${BOLD}${GREEN}══════════════════════════════════════════════${NC}"
echo ""
