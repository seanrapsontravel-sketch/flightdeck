module.exports = {
    testDir: './tests/browser', timeout: 600000, workers: 1,
    use: { actionTimeout:15000, ignoreHTTPSErrors: true, viewport: { width:1280, height:800 }, hasTouch:true,
        screenshot: 'only-on-failure', trace:'retain-on-failure' },
    outputDir:'output/playwright', reporter:'list'
};
