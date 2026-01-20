#!/bin/bash

# Decentralized Voting App - Service Management Script
# Usage: ./services.sh [start|stop|restart|status]

# Safety: preserve and restore terminal state on exit
ORIG_STTY="$(stty -g 2>/dev/null)"
restore_terminal() {
    # Restore original stty if captured, else reset to sane defaults
    if [ -n "$ORIG_STTY" ]; then
        stty "$ORIG_STTY" 2>/dev/null || true
    fi
    stty sane 2>/dev/null || true
    # Ensure cursor is visible
    if command -v tput >/dev/null 2>&1; then
        tput cnorm 2>/dev/null || true
    fi
    # Force show cursor via ANSI if needed
    printf '\033[?25h' >/dev/null 2>&1 || true
}

trap restore_terminal EXIT

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Service directories
DKG_DIR="dkg-service"
RELAYER_DIR="vote-relayer"
FRONTEND_DIR="voting-frontend"
ENCRYPTION_DIR="decryption-service"  # unified crypto-service (encrypt + decrypt)

# PID files
DKG_PID_FILE="/tmp/dkg-service.pid"
RELAYER_PID_FILE="/tmp/vote-relayer.pid"
FRONTEND_PID_FILE="/tmp/voting-frontend.pid"
ENCRYPTION_PID_FILE="/tmp/crypto-service.pid"

# Log files
DKG_LOG="/tmp/dkg-service.log"
RELAYER_LOG="/tmp/vote-relayer.log"
FRONTEND_LOG="/tmp/voting-frontend.log"
ENCRYPTION_LOG="/tmp/crypto-service.log"

# Function to print colored messages
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Function to check if service is running
is_running() {
    local pid_file=$1
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p $pid > /dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

# Function to start DKG service
start_dkg() {
    print_info "Starting DKG Service..."
    
    # Kill any existing processes on port 3003 first
    lsof -ti:3003 2>/dev/null | xargs -r kill -9 2>/dev/null
    pkill -9 -f "node.*dkg-service/src/server.js" 2>/dev/null
    sleep 1
    
    if is_running "$DKG_PID_FILE"; then
        print_warning "DKG PID file exists, cleaning up..."
        rm -f "$DKG_PID_FILE"
    fi
    
    cd "$DKG_DIR" || exit 1
    npm start > "$DKG_LOG" 2>&1 &
    echo $! > "$DKG_PID_FILE"
    sleep 2
    
    if is_running "$DKG_PID_FILE"; then
        print_success "DKG Service started on port 3003 (PID: $(cat $DKG_PID_FILE))"
    else
        print_error "Failed to start DKG Service"
        tail -20 "$DKG_LOG"
    fi
    cd - > /dev/null
}
# Function to start Vote Relayer
start_relayer() {
    print_info "Starting Vote Relayer..."
    
    # Kill any existing processes on port 3001 first
    lsof -ti:3001 2>/dev/null | xargs -r kill -9 2>/dev/null
    pkill -9 -f "node.*vote-relayer/src/server.js" 2>/dev/null
    sleep 1
    
    if is_running "$RELAYER_PID_FILE"; then
        print_warning "Relayer PID file exists, cleaning up..."
        rm -f "$RELAYER_PID_FILE"
    fi
    
    cd "$RELAYER_DIR" || exit 1
    npm start > "$RELAYER_LOG" 2>&1 &
    echo $! > "$RELAYER_PID_FILE"
    sleep 2
    
    if is_running "$RELAYER_PID_FILE"; then
        print_success "Vote Relayer started on port 3001 (PID: $(cat $RELAYER_PID_FILE))"
    else
        print_error "Failed to start Vote Relayer"
        tail -20 "$RELAYER_LOG"
    fi
    cd - > /dev/null
}

# Function to start Frontend
start_frontend() {
    print_info "Starting Frontend..."
    
    # Kill any existing processes on port 3000 first (try with sudo if needed)
    lsof -ti:3000 2>/dev/null | xargs -r kill -9 2>/dev/null
    sudo -n lsof -ti:3000 2>/dev/null | xargs -r sudo -n kill -9 2>/dev/null || true
    pkill -9 -f "next-server.*3000" 2>/dev/null
    pkill -9 -f "node.*voting-frontend" 2>/dev/null
    pkill -9 -f "next dev" 2>/dev/null
    sleep 2
    
    if is_running "$FRONTEND_PID_FILE"; then
        print_warning "Frontend PID file exists, cleaning up..."
        rm -f "$FRONTEND_PID_FILE"
    fi
    
    cd "$FRONTEND_DIR" || exit 1
    npm run dev -- --hostname 0.0.0.0 --port 3000 > "$FRONTEND_LOG" 2>&1 &
    echo $! > "$FRONTEND_PID_FILE"
    sleep 3
    
    if is_running "$FRONTEND_PID_FILE"; then
        print_success "Frontend started on port 3000 (PID: $(cat $FRONTEND_PID_FILE))"
    else
        print_error "Failed to start Frontend"
        tail -20 "$FRONTEND_LOG"
    fi
    cd - > /dev/null
}

# Function to start Encryption Service
start_encryption() {
    print_info "Starting Crypto Service (encrypt + decrypt)..."
    
    # Kill any existing processes on port 3005 first
    lsof -ti:3005 2>/dev/null | xargs -r kill -9 2>/dev/null
    pkill -9 -f "node.*decryption-service/src/server.js" 2>/dev/null
    sleep 1
    
    if is_running "$ENCRYPTION_PID_FILE"; then
        print_warning "Crypto PID file exists, cleaning up..."
        rm -f "$ENCRYPTION_PID_FILE"
    fi
    
    cd "$ENCRYPTION_DIR" || exit 1
    npm start > "$ENCRYPTION_LOG" 2>&1 &
    echo $! > "$ENCRYPTION_PID_FILE"
    sleep 2
    
    if is_running "$ENCRYPTION_PID_FILE"; then
        print_success "Crypto Service started on port 3005 (PID: $(cat $ENCRYPTION_PID_FILE))"
    else
        print_error "Failed to start Crypto Service"
        tail -20 "$ENCRYPTION_LOG"
    fi
    cd - > /dev/null
}

# Function to stop a service
stop_service() {
    local name=$1
    local pid_file=$2
    local port=$3
    
    print_info "Stopping $name..."
    
    # Kill by PID file if exists
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p $pid > /dev/null 2>&1; then
            kill $pid 2>/dev/null
            sleep 1
            
            # Force kill if still running
            if ps -p $pid > /dev/null 2>&1; then
                kill -9 $pid 2>/dev/null
                sleep 1
            fi
        fi
        rm -f "$pid_file"
    fi
    
    # Also kill by port to catch any orphaned processes (try with sudo)
    if [ -n "$port" ]; then
        local pids=$(lsof -ti:$port 2>/dev/null)
        if [ -n "$pids" ]; then
            echo "$pids" | xargs -r kill -9 2>/dev/null
            sleep 1
        fi
        # Try with sudo if still occupied
        local pids=$(sudo -n lsof -ti:$port 2>/dev/null)
        if [ -n "$pids" ]; then
            echo "$pids" | xargs -r sudo -n kill -9 2>/dev/null
            sleep 1
        fi
    fi
    
    # Kill by process name as fallback (with sudo)
    case "$name" in
        "DKG Service")
            pkill -9 -f "node.*dkg-service/src/server.js" 2>/dev/null
            sudo pkill -9 -f "node.*dkg-service/src/server.js" 2>/dev/null
            ;;
        "Vote Relayer")
            pkill -9 -f "node.*vote-relayer/src/server.js" 2>/dev/null
            sudo pkill -9 -f "node.*vote-relayer/src/server.js" 2>/dev/null
            ;;
        "Frontend")
            pkill -9 -f "next-server.*3000" 2>/dev/null
            pkill -9 -f "node.*voting-frontend" 2>/dev/null
            pkill -9 -f "next dev" 2>/dev/null
            sudo pkill -9 -f "next-server" 2>/dev/null
            sudo pkill -9 -f "node.*voting-frontend" 2>/dev/null
            ;;
    esac
    
    print_success "$name stopped"
}

# Function to get service status
get_status() {
    echo ""
    echo "═══════════════════════════════════════════════════"
    echo "         Voting System Services Status"
    echo "═══════════════════════════════════════════════════"
    echo ""
    
    # DKG Service
    if is_running "$DKG_PID_FILE"; then
        local pid=$(cat "$DKG_PID_FILE")
        echo -e "DKG Service:      ${GREEN}●${NC} Running (PID: $pid, Port: 3003)"
        curl -s http://localhost:3003/health > /dev/null 2>&1
        if [ $? -eq 0 ]; then
            echo -e "                  ${GREEN}✓${NC} Health check: OK"
        else
            echo -e "                  ${RED}✗${NC} Health check: Failed"
        fi
    else
        echo -e "DKG Service:      ${RED}○${NC} Stopped"
    fi
    
    echo ""
    
    # Encryption Service
    if is_running "$ENCRYPTION_PID_FILE"; then
        local pid=$(cat "$ENCRYPTION_PID_FILE")
            echo -e "Crypto Service:   ${GREEN}●${NC} Running (PID: $pid, Port: 3005)"
            curl -s http://localhost:3005/health > /dev/null 2>&1
        if [ $? -eq 0 ]; then
            echo -e "                  ${GREEN}✓${NC} Health check: OK"
        else
            echo -e "                  ${RED}✗${NC} Health check: Failed"
        fi
    else
            echo -e "Crypto Service:   ${RED}○${NC} Stopped"
    fi
    
    echo ""
    
    # Vote Relayer
    if is_running "$RELAYER_PID_FILE"; then
        local pid=$(cat "$RELAYER_PID_FILE")
        echo -e "Vote Relayer:     ${GREEN}●${NC} Running (PID: $pid, Port: 3001)"
        curl -s http://localhost:3001/health > /dev/null 2>&1
        if [ $? -eq 0 ]; then
            echo -e "                  ${GREEN}✓${NC} Health check: OK"
        else
            echo -e "                  ${RED}✗${NC} Health check: Failed"
        fi
    else
        echo -e "Vote Relayer:     ${RED}○${NC} Stopped"
    fi
    
    echo ""
    
    # Frontend
    if is_running "$FRONTEND_PID_FILE"; then
        local pid=$(cat "$FRONTEND_PID_FILE")
        echo -e "Frontend:         ${GREEN}●${NC} Running (PID: $pid, Port: 3000)"
        curl -s http://localhost:3000 > /dev/null 2>&1
        if [ $? -eq 0 ]; then
            echo -e "                  ${GREEN}✓${NC} HTTP check: OK"
        else
            echo -e "                  ${YELLOW}⚠${NC} HTTP check: Starting..."
        fi
    else
        echo -e "Frontend:         ${RED}○${NC} Stopped"
    fi
    
    echo ""
    echo "═══════════════════════════════════════════════════"
    echo ""
    echo "Logs:"
    echo "  DKG:        tail -f $DKG_LOG"
    echo "  Encryption: tail -f $ENCRYPTION_LOG"
    echo "  Relayer:    tail -f $RELAYER_LOG"
    echo "  Frontend:   tail -f $FRONTEND_LOG"
    echo ""
}

# Function to show logs
show_logs() {
    local service=$1
    case $service in
        dkg)
            print_info "Showing DKG Service logs (Ctrl+C to exit)..."
            tail -f "$DKG_LOG"
            ;;
        encryption)
            print_info "Showing Encryption Service logs (Ctrl+C to exit)..."
            tail -f "$ENCRYPTION_LOG"
            ;;
        relayer)
            print_info "Showing Vote Relayer logs (Ctrl+C to exit)..."
            tail -f "$RELAYER_LOG"
            ;;
        frontend)
            print_info "Showing Frontend logs (Ctrl+C to exit)..."
            tail -f "$FRONTEND_LOG"
            ;;
        *)
            print_error "Unknown service: $service"
            echo "Usage: $0 logs [dkg|encryption|relayer|frontend]"
            ;;
    esac
}

# Main command handling
case "${1:-}" in
    start)
        if [ -n "${2:-}" ]; then
            case "$2" in
                dkg) start_dkg ;;
                encryption) start_encryption ;;
                relayer) start_relayer ;;
                frontend) start_frontend ;;
                *)
                    print_error "Unknown service: $2"
                    echo "Usage: $0 start [dkg|encryption|relayer|frontend]"
                    exit 1
                    ;;
            esac
        else
            echo ""
            echo "Starting all services..."
            echo ""
            start_dkg
            start_encryption
            start_relayer
            start_frontend
            echo ""
            get_status
        fi
        ;;
    
    stop)
        if [ -n "${2:-}" ]; then
            case "$2" in
                dkg) stop_service "DKG Service" "$DKG_PID_FILE" "3003" ;;
                encryption) stop_service "Encryption Service" "$ENCRYPTION_PID_FILE" "3004" ;;
                relayer) stop_service "Vote Relayer" "$RELAYER_PID_FILE" "3001" ;;
                frontend) stop_service "Frontend" "$FRONTEND_PID_FILE" "3000" ;;
                *)
                    print_error "Unknown service: $2"
                    echo "Usage: $0 stop [dkg|encryption|relayer|frontend]"
                    exit 1
                    ;;
            esac
        else
            echo ""
            echo "Stopping all services..."
            echo ""
            stop_service "DKG Service" "$DKG_PID_FILE" "3003"
            stop_service "Encryption Service" "$ENCRYPTION_PID_FILE" "3004"
            stop_service "Vote Relayer" "$RELAYER_PID_FILE" "3001"
            stop_service "Frontend" "$FRONTEND_PID_FILE" "3000"
            echo ""
        fi
        ;;
    
    restart)
        if [ -n "${2:-}" ]; then
            case "$2" in
                dkg)
                    stop_service "DKG Service" "$DKG_PID_FILE" "3003"
                    start_dkg
                    ;;
                encryption)
                    stop_service "Encryption Service" "$ENCRYPTION_PID_FILE" "3004"
                    start_encryption
                    ;;
                relayer)
                    stop_service "Vote Relayer" "$RELAYER_PID_FILE" "3001"
                    start_relayer
                    ;;
                frontend)
                    stop_service "Frontend" "$FRONTEND_PID_FILE" "3000"
                    start_frontend
                    ;;
                *)
                    print_error "Unknown service: $2"
                    echo "Usage: $0 restart [dkg|encryption|relayer|frontend]"
                    exit 1
                    ;;
            esac
        else
            echo ""
            echo "Restarting all services..."
            echo ""
            stop_service "DKG Service" "$DKG_PID_FILE" "3003"
            stop_service "Encryption Service" "$ENCRYPTION_PID_FILE" "3004"
            stop_service "Vote Relayer" "$RELAYER_PID_FILE" "3001"
            stop_service "Frontend" "$FRONTEND_PID_FILE" "3000"
            echo ""
            start_dkg
            start_encryption
            start_relayer
            start_frontend
            echo ""
            get_status
        fi
        ;;
    
    status)
        get_status
        ;;
    
    logs)
        if [ -n "${2:-}" ]; then
            show_logs "$2"
        else
            print_error "Please specify a service"
            echo "Usage: $0 logs [dkg|relayer|frontend]"
            exit 1
        fi
        ;;
    
    *)
        echo ""
        echo "Decentralized Voting App - Service Management"
        echo ""
        echo "Usage: $0 COMMAND [SERVICE]"
        echo ""
        echo "Commands:"
        echo "  start [SERVICE]    Start all services or specific service"
        echo "  stop [SERVICE]     Stop all services or specific service"
        echo "  restart [SERVICE]  Restart all services or specific service"
        echo "  status             Show status of all services"
        echo "  logs SERVICE       Show logs for specific service"
        echo ""
        echo "Services:"
        echo "  dkg                DKG Service (port 3003)"
        echo "  relayer            Vote Relayer (port 3001)"
        echo "  frontend           Frontend (port 3000)"
        echo ""
        echo "Examples:"
        echo "  $0 start              # Start all services"
        echo "  $0 start dkg          # Start only DKG service"
        echo "  $0 stop               # Stop all services"
        echo "  $0 restart relayer    # Restart vote relayer"
        echo "  $0 status             # Check service status"
        echo "  $0 logs frontend      # View frontend logs"
        echo ""
        exit 1
        ;;
esac
