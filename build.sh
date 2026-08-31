#!/usr/bin/env bash
# Exit immediately if a command exits with a non-zero status
set -o errexit

echo "==> Step 1: Installing Python backend dependencies..."
pip install -r backend/requirements.txt

echo "==> Step 2: Building React production bundle..."
cd frontend
npm install
npm run build
cd ..

echo "==> Build complete! Ready to start FastAPI server."
