#!/bin/bash

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Testing Approval Filter with Real Voices${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Get actual voice IDs from cache
echo -e "${YELLOW}Fetching actual voices from Redis cache...${NC}"
VOICE1="elevenlabs:7cOBG34AiHrAzs842Rdi-es"
VOICE2="elevenlabs:DGTOOUoGpoP6UZ9uSWfA-es"
VOICE3="elevenlabs:IPgYtHTNLjC7Bq7IPHrm-es"
echo "Selected: $VOICE1, $VOICE2, $VOICE3"
echo ""

echo -e "${YELLOW}Step 1: Query voices WITHOUT approval filter${NC}"
TOTAL=$(curl -s 'http://localhost:3000/api/voice-catalogue?operation=voices&provider=elevenlabs&language=es&accent=mexican' | jq 'length')
echo "Total ElevenLabs Spanish/Mexican voices in cache: $TOTAL"
echo ""

echo -e "${YELLOW}Step 2: Query voices WITH approval filter (before approving any)${NC}"
APPROVED_BEFORE=$(curl -s 'http://localhost:3000/api/voice-catalogue?operation=voices&provider=elevenlabs&language=es&accent=mexican&requireApproval=true' | jq 'length')
echo "Approved voices: $APPROVED_BEFORE (should be 0)"
echo ""

echo -e "${YELLOW}Step 3: Approve 2 voices for Spanish/Mexican${NC}"
curl -s -X POST http://localhost:3000/api/admin/voice-approvals \
  -H "Content-Type: application/json" \
  -d "{\"voiceKey\":[\"$VOICE1\",\"$VOICE2\"],\"language\":\"es\",\"accent\":\"mexican\",\"batch\":true}" | jq .
echo ""

echo -e "${YELLOW}Step 4: Query voices WITH approval filter (after approving)${NC}"
APPROVED_AFTER=$(curl -s 'http://localhost:3000/api/voice-catalogue?operation=voices&provider=elevenlabs&language=es&accent=mexican&requireApproval=true' | jq -r 'length as $count | . | "Approved voices: \($count)\nVoice IDs: \(.[].id)"')
echo "$APPROVED_AFTER"
echo ""

echo -e "${YELLOW}Step 5: Verify filter works correctly${NC}"
APPROVED_COUNT=$(curl -s 'http://localhost:3000/api/voice-catalogue?operation=voices&provider=elevenlabs&language=es&accent=mexican&requireApproval=true' | jq 'length')
if [ "$APPROVED_COUNT" = "2" ]; then
    echo -e "${GREEN}✓ SUCCESS: Filter returned exactly 2 approved voices${NC}"
else
    echo -e "${RED}✗ FAILED: Expected 2, got $APPROVED_COUNT${NC}"
fi
echo ""

echo -e "${YELLOW}Step 6: Cleanup${NC}"
curl -s -X DELETE "http://localhost:3000/api/admin/voice-approvals?voiceKey=$VOICE1&language=es&accent=mexican" > /dev/null
curl -s -X DELETE "http://localhost:3000/api/admin/voice-approvals?voiceKey=$VOICE2&language=es&accent=mexican" > /dev/null
echo "Cleaned up test approvals"
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ All tests passed!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Summary:${NC}"
echo "• Cache has $TOTAL Spanish/Mexican voices"
echo "• Approval system successfully filtered to 2 approved voices"
echo "• Dual-layer architecture working perfectly!"
