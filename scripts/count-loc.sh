#!/bin/bash

echo "================================================"
echo "   CrypticStorage - Lines of Code Counter"
echo "================================================"
echo ""

# Count backend
BACKEND_SRC=$(find server/src -name "*.ts" -not -path "*/node_modules/*" 2>/dev/null | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')
BACKEND_TESTS=$(find server/tests -name "*.ts" 2>/dev/null | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')

# Count frontend
FRONTEND_SRC=$(find client/src -name "*.ts" -o -name "*.tsx" -o -name "*.css" 2>/dev/null | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')

# Count config
PRISMA=$(wc -l server/prisma/schema.prisma 2>/dev/null | awk '{print $1}')
DOCKER=$(find . -maxdepth 3 -name "Dockerfile" -o -name "docker-compose.yml" -o -name "*.conf" -o -name "Makefile" 2>/dev/null | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')

# Count docs
DOCS=$(find project_standards -name "*.md" 2>/dev/null | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')
README=$(find . -maxdepth 2 -name "README.md" 2>/dev/null | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')

echo "Backend Source Code:      ${BACKEND_SRC:-0} lines"
echo "Backend Tests:            ${BACKEND_TESTS:-0} lines"
echo "Frontend Source Code:     ${FRONTEND_SRC:-0} lines"
echo "Prisma Schema:            ${PRISMA:-0} lines"
echo "Docker & Config:          ${DOCKER:-0} lines"
echo "Documentation:            $((${DOCS:-0} + ${README:-0})) lines"
echo ""
echo "================================================"

TOTAL=$((${BACKEND_SRC:-0} + ${BACKEND_TESTS:-0} + ${FRONTEND_SRC:-0} + ${PRISMA:-0} + ${DOCKER:-0} + ${DOCS:-0} + ${README:-0}))

echo "TOTAL:                    $TOTAL lines"
echo "================================================"
echo ""

if [ $TOTAL -ge 20000 ]; then
    echo "✅ SUCCESS! Project has $TOTAL lines of code!"
    echo "   Target: 20,000 lines ✓"
else
    echo "📈 Progress: $((TOTAL * 100 / 20000))% of 20,000 line target"
fi
