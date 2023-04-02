import dappeteer from '@chainsafe/dappeteer';
import { ethers } from "ethers";
import fs from 'fs';
import yaml from 'js-yaml';
import jwt_decode from "jwt-decode";
import dotenv from 'dotenv';
dotenv.config();

const url = 'https://blur.io/collection/ailoverse-cats/bids';
const bidsURL = 'https://core-api.prod.blur.io/v1/collections/ailoverse-cats/executable-bids';

(async () => {
    cleanupCookies()
    const isOwnerMode = process.argv.slice(2).length > 0;
    // depending from script param create random wallet or use mnemonic from env
    const wallet = isOwnerMode ? new ethers.Wallet(process.env.PK) : ethers.Wallet.createRandom();

    let launchOptions = {
        password: "IpakgABrNGuqMKCIucArDNho90m",
        headless: false,
    }
    if (isOwnerMode) {
        console.log("use account: ", wallet.address)
    } else {
        console.log('mnemonic:', wallet.mnemonic.phrase)
        launchOptions.seed = wallet.mnemonic.phrase;
    }

    const { metaMask, browser } = await dappeteer.bootstrap(
        {
           // seed: wallet.mnemonic.phrase,
            password: "IpakgABrNGuqMKCIucArDNho90m",
            headless: false,
        }
    );
    if (isOwnerMode) {
        await metaMask.importPK(wallet.privateKey)
    }
    let connectIterations = 0;
    browser.getSource().on('targetcreated', async (target) => {
        console.log("target created")
        const tPage = await target.page();
        if (!tPage) return;
        const title = await tPage.title();
        console.log("title: ", title)
        if (title !== 'MetaMask Notification') return;
        try {
            const titleItem = await tPage.waitForSelector(".permissions-connect-header__title", { timeout: 3000 })
            const title = await titleItem.evaluate(el => el.textContent)
            if (title === 'Connect with MetaMask') {
                console.log("Connect with MetaMask")
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
    setTimeout(async () => {
        console.log("timeout, close browser");
        await browser.close();
        process.exit()
    }, 60000);

    console.log("create a new page and visit blur");
    const blurPage = await browser.newPage();
    await blurPage.getSource().setRequestInterception(true);
    blurPage.getSource().on('request', blurInterceptor);
    await blurPage.goto(url,{waitUntil: 'load'});

    console.log("connect MetaMask to blur");
    await (await blurPage.waitForSelector('text/connect wallet')).click();
    await (await blurPage.waitForSelector('#METAMASK')).click();
    console.log("connect clicked");

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
    isOwnerMode ? saveOwnerCookie(cookieString) : saveNewCookie(cookieString);
    console.log("cookies extracted, close browser")
    await browser.close();
    process.exit()
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

function saveNewCookie(cookieStr) {
    const doc = yaml.load(fs.readFileSync('cookies.yml', 'utf8'));
    doc.cookies.push(cookieStr);
    saveYml(doc);
}

function saveOwnerCookie(cookieStr) {
    const doc = yaml.load(fs.readFileSync('cookies.yml', 'utf8'));
    doc.owner = cookieStr;
    saveYml(doc);
}

function cleanupCookies() {
    const doc = yaml.load(fs.readFileSync('cookies.yml', 'utf8'));
    let resultCookie = [];
    for (let cookie of doc.cookies) {
        const cookieList = cookie.split(';');
        const decoded = jwt_decode(cookieList[1]);
        if (decoded.exp > (Date.now() / 1000) + (3 * 86400)) { // 3 days from now
            resultCookie.push(cookie);
        }
    }
    doc.cookies = resultCookie;
    saveYml(doc);
    console.log("cookie filtered")
}

function saveYml(doc) {
    fs.writeFileSync('cookies.yml', yaml.dump(doc, {
        styles: {
            '!!null': 'canonical', // dump null as ~
            '!!str': 'single',
            '!!seq': 'block',
        },
        lineWidth: -1,          // set to -1 to disable line wrapping
        quotingType: '"',
        forceQuotes: true,
    }));
}