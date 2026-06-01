#!/bin/bash
set -e

echo "Creating public directory..."
mkdir -p public

echo "Copying Menu Analyzer files..."
cp index.html public/
cp -r lib public/ 2>/dev/null || echo "No lib directory to copy"

echo "Building Menu Journey Reviewer..."
cd reviewer
npm ci
npm run build
cd ..

echo "Build complete!"
