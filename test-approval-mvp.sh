#!/bin/bash

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# API base URL
BASE_URL="${1:-http://localhost:3000}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Voice Approval MVP - Integration Tests${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Test counter
PASSED=0
FAILED=0

# Helper function to test API endpoint
test_endpoint() {
    local name="$1"
    local method="$2"
    local url="$3"
    local data="$4"
    local expected_status="$5"

    echo -e "${YELLOW}Testing: ${name}${NC}"

    if [ "$method" = "GET" ] || [ "$method" = "DELETE" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$url")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$url" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi

    # Split response and status code
    body=$(echo "$response" | head -n -1)
    status=$(echo "$response" | tail -n 1)

    if [ "$status" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASSED${NC} (Status: $status)"
        echo "Response: $body"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗ FAILED${NC} (Expected: $expected_status, Got: $status)"
        echo "Response: $body"
        FAILED=$((FAILED + 1))
    fi
    echo ""
}

echo -e "${BLUE}Phase 1: Admin API Tests${NC}"
echo -e "${BLUE}-------------------------${NC}"
echo ""

# Test 1: Approve a voice
test_endpoint \
    "Approve voice for Spanish/Mexican" \
    "POST" \
    "$BASE_URL/api/admin/voice-approvals" \
    '{"voiceKey":"elevenlabs:test-voice-1","language":"es","accent":"mexican","notes":"Test approval"}' \
    "200"

# Test 2: Get approvals for the voice
test_endpoint \
    "Get approvals for test voice" \
    "GET" \
    "$BASE_URL/api/admin/voice-approvals?voiceKey=elevenlabs:test-voice-1" \
    "" \
    "200"

# Test 3: Get approvals by language/accent
test_endpoint \
    "Get all Spanish/Mexican approvals" \
    "GET" \
    "$BASE_URL/api/admin/voice-approvals?language=es&accent=mexican" \
    "" \
    "200"

# Test 4: Batch approve voices
test_endpoint \
    "Batch approve multiple voices" \
    "POST" \
    "$BASE_URL/api/admin/voice-approvals" \
    '{"voiceKey":["elevenlabs:batch-1","elevenlabs:batch-2","lovo:batch-3"],"language":"es","accent":"castilian","batch":true}' \
    "200"

# Test 5: Remove approval
test_endpoint \
    "Remove approval" \
    "DELETE" \
    "$BASE_URL/api/admin/voice-approvals?voiceKey=elevenlabs:test-voice-1&language=es&accent=mexican" \
    "" \
    "200"

echo ""
echo -e "${BLUE}Phase 2: Voice Catalogue Integration Tests${NC}"
echo -e "${BLUE}------------------------------------------${NC}"
echo ""

# Test 6: Query voices without approval filter (should work as before)
test_endpoint \
    "Get voices WITHOUT approval filter" \
    "GET" \
    "$BASE_URL/api/voice-catalogue?operation=filtered-voices&language=es&accent=mexican" \
    "" \
    "200"

# Test 7: Query voices WITH approval filter
test_endpoint \
    "Get voices WITH approval filter" \
    "GET" \
    "$BASE_URL/api/voice-catalogue?operation=filtered-voices&language=es&accent=castilian&requireApproval=true" \
    "" \
    "200"

# Test 8: Get provider options (should work unchanged)
test_endpoint \
    "Get provider options" \
    "GET" \
    "$BASE_URL/api/voice-catalogue?operation=provider-options&language=es" \
    "" \
    "200"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ Passed: $PASSED${NC}"
echo -e "${RED}✗ Failed: $FAILED${NC}"
echo -e "${BLUE}========================================${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed! 🎉${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed${NC}"
    exit 1
fi
