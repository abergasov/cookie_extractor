import dappeteer from '@chainsafe/dappeteer';
import { ethers } from "ethers";
import fs from 'fs';

const url = 'https://blur.io/collection/ailoverse-cats/bids';
const bidsURL = 'https://core-api.prod.blur.io/v1/collections/ailoverse-cats/executable-bids';

(async () => {
    const wallet = ethers.Wallet.createRandom();
    console.log('mnemonic:', wallet.mnemonic.phrase)

    const { metaMask, browser } = await dappeteer.bootstrap(
        {
            seed: wallet.mnemonic.phrase,
            password: "IpakgABrNGuqMKCIucArDNho90m",
            // headless: false,
        }
    );
    let connectIterations = 0;
    setTimeout(() => {
        browser.close(); // close browser after 60 seconds
    }, 60000);

    // create a new page and visit blur
    const blurPage = await browser.newPage();
    await blurPage.getSource().setRequestInterception(true);
    blurPage.getSource().on('request', blurInterceptor);
    await blurPage.goto(url,{waitUntil: 'load'});

    // connect MetaMask to blur
    await (await blurPage.waitForSelector('text/connect wallet')).click();
    await (await blurPage.waitForSelector('#METAMASK')).click();

    browser.getSource().on('targetcreated', async (target) => {
        const tPage = await target.page();
        if (!tPage) return;
        const title = await tPage.title();
        if (title !== 'MetaMask Notification') return;
        try {
            const titleItem = await tPage.waitForSelector(".permissions-connect-header__title", { timeout: 3000 })
            const title = await titleItem.evaluate(el => el.textContent)
            if (title === 'Connect with MetaMask') {
                const button = await tPage.waitForSelector("button.button.btn-primary");
                if (button) await button.click();

                const connectButton = await tPage.waitForSelector("button.button.btn-primary");
                if (connectButton) await connectButton.click();
                connectIterations++;
            }
        } catch (error) {
            console.log("Signature request message")
            const connectButton = await tPage.waitForSelector("button.button.btn-primary", { timeout: 3000 });
            if (connectButton) await connectButton.click();
            connectIterations++;
        }
    });

    function waitForChange() {
        return new Promise(resolve => {
            setInterval(() => {
                if (connectIterations >= 2) {
                    // wait until the page is loaded
                    setTimeout(() => {
                        resolve();
                    }, 3000);
                }
            }, 1000);
        });
    }
    await waitForChange()

    const response = await blurPage.getSource().goto(bidsURL, { waitUntil: 'load' });
    const responseStatus = response.status();
    if (responseStatus !== 200) {
        console.log("Error: ", responseStatus);
        return;
    }
    console.log("account connected, extract cookies")
    const cookies = await blurPage.getSource().cookies();
    const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    fs.appendFileSync('cookies.yml', `\n  - "${cookieString}"`);
    await browser.close();
})();

function blurInterceptor(interceptedRequest) {
    if (interceptedRequest.isInterceptResolutionHandled()) return;
    const url = interceptedRequest.url();
    const skip = url.startsWith('https://images.blur.io') ||
        url.startsWith('https://rdr.blurio.workers.dev') ||
        url.startsWith('https://vitals.vercel-insights.com') ||
        url.endsWith('.otf') ||
        url.endsWith('.png');
    skip ? interceptedRequest.abort() : interceptedRequest.continue();
}