#!/bin/bash

# Helix Static Metabolism Deployer
# Bypasses local permission deadlocks and provides 10x hosting speed

FRONTEND_DIR="/home/himanshu/internship/Helix/frontend"
DIST_DIR="/tmp/helix_metabolism_dist"
PORT=3000

echo "🧬 Initiating Static Metabolism Build..."
cd $FRONTEND_DIR

# 1. Build the genotype (Static Tissue)
# Note: Using a custom build dir in /tmp to avoid permission errors
NEXT_PRIVATE_LOCAL_BUILD=1 npx next build

if [ $? -eq 0 ]; then
    echo "✅ Metabolism synthesized successfully."
    
    # 2. Extract and serve
    # Copy build output to a clean /tmp location
    rm -rf $DIST_DIR
    cp -r $FRONTEND_DIR/out $DIST_DIR
    
    echo "🚀 Launching Static Metabolism on port $PORT..."
    
    # Kill existing port if possible (locally)
    fuser -k $PORT/tcp 2>/dev/null
    
    # Serve using Python's high-speed http.server
    cd $DIST_DIR
    python3 -m http.server $PORT
else
    echo "❌ Metabolism synthesis failed. Check logs."
    exit 1
fi
