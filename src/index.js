import dappeteer from '@chainsafe/dappeteer';
import { ethers } from "ethers";
import fs from 'fs';

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

    // create a new page and visit blur
    const blurPage = await browser.newPage();
    await blurPage.getSource().setRequestInterception(true);
    blurPage.getSource().on('request', interceptedRequest => {
        if (interceptedRequest.isInterceptResolutionHandled()) return;
        (interceptedRequest.url().endsWith('.png') || interceptedRequest.url().endsWith('.jpg')) ?
            interceptedRequest.abort() : interceptedRequest.continue();
    });
    await blurPage.goto('https://blur.io/collection/ailoverse-cats/bids');

    // connect MetaMask to blur
    await (await blurPage.waitForSelector('text/connect wallet')).click();
    await (await blurPage.waitForSelector('#METAMASK')).click();
    await metaMask.approve();

    // extract cookies from blur
    const cookies = await blurPage.getSource().cookies();
    const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');

    fs.appendFileSync('cookies.yml', `\n  - "${cookieString}"`);
    await browser.close();
})();
