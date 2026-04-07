#!/usr/bin/env node
/**
 * Simple startup script for BountyFlow Frontend (Development Mode)
 */

const { spawn } = require('child_process');
const path = require('path');

function main() {
    console.log('🚀 Starting BountyFlow Frontend (Development Mode)');
    console.log('🌐 Frontend will be available at: http://localhost:3000');
    console.log('🔗 Backend API should be running at: http://localhost:8002');
    console.log();

    // Start Next.js development server
    const nextProcess = spawn('npx', ['next', 'dev'], {
        cwd: path.join(__dirname),
        stdio: 'inherit',
        shell: true
    });

    // Handle process termination
    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down frontend server...');
        nextProcess.kill('SIGINT');
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log('\n🛑 Shutting down frontend server...');
        nextProcess.kill('SIGTERM');
        process.exit(0);
    });

    nextProcess.on('error', (error) => {
        console.error('❌ Failed to start frontend server:', error);
        process.exit(1);
    });

    nextProcess.on('exit', (code) => {
        if (code !== 0) {
            console.error(`❌ Frontend server exited with code ${code}`);
            process.exit(code);
        }
    });
}

if (require.main === module) {
    main();
}


