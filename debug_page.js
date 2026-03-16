const puppeteer = require('/tmp/node_modules/puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch({
            executablePath: '/home/himanshu/.cache/puppeteer/chrome/linux-146.0.7680.76/chrome-linux64/chrome',
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
        page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText || ''));
        
        console.log("Navigating to http://localhost:3000...");
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });
        
        await browser.close();
        console.log("Done.");
    } catch (error) {
        console.error("Puppeteer Script Error:", error);
    }
})();
