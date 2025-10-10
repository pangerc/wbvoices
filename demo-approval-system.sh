#!/bin/bash

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Voice Approval System - Live Demo${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

echo -e "${YELLOW}Step 1: Approve some test voices for Spanish/Mexican${NC}"
echo "Approving 3 voices..."
curl -s -X POST http://localhost:3000/api/admin/voice-approvals \
  -H "Content-Type: application/json" \
  -d '{"voiceKey":["elevenlabs:voice-a","lovo:voice-b","openai:voice-c"],"language":"es","accent":"mexican","batch":true}' | jq .
echo ""

echo -e "${YELLOW}Step 2: Verify approvals were stored${NC}"
curl -s 'http://localhost:3000/api/admin/voice-approvals?language=es&accent=mexican' | jq -r '.approvals | length as $count | "Found \($count) approved voices"'
echo ""

echo -e "${YELLOW}Step 3: Query voices WITHOUT approval filter${NC}"
echo "This returns all voices in the Redis cache (existing behavior):"
curl -s 'http://localhost:3000/api/voice-catalogue?operation=voices&provider=elevenlabs&language=es&accent=mexican' | jq -r 'length as $count | "Total ElevenLabs voices: \($count)"'
echo ""

echo -e "${YELLOW}Step 4: Query voices WITH approval filter${NC}"
echo "This only returns approved voices from Postgres:"
curl -s 'http://localhost:3000/api/voice-catalogue?operation=voices&provider=elevenlabs&language=es&accent=mexican&requireApproval=true' | jq -r 'length as $count | "Approved ElevenLabs voices: \($count)"'
echo ""

echo -e "${YELLOW}Step 5: Cleanup - Remove approvals${NC}"
curl -s -X DELETE 'http://localhost:3000/api/admin/voice-approvals?voiceKey=elevenlabs:voice-a&language=es&accent=mexican' | jq .
curl -s -X DELETE 'http://localhost:3000/api/admin/voice-approvals?voiceKey=lovo:voice-b&language=es&accent=mexican' | jq .
curl -s -X DELETE 'http://localhost:3000/api/admin/voice-approvals?voiceKey=openai:voice-c&language=es&accent=mexican' | jq .
echo ""

echo -e "${GREEN}✓ Demo complete!${NC}"
echo ""
echo -e "${BLUE}Key Takeaways:${NC}"
echo "1. Approvals are stored in Postgres (persistent)"
echo "2. Voice queries work unchanged (backward compatible)"
echo "3. requireApproval=true filters to approved voices only"
echo "4. Both systems work together seamlessly"
