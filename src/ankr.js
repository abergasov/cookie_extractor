import dappeteer from '@chainsafe/dappeteer';
import { ethers } from "ethers";
import fs from 'fs';
import yaml from 'js-yaml';
import jwt_decode from "jwt-decode";
import dotenv from 'dotenv';
dotenv.config();

const ankrURL = "https://www.ankr.com/rpc/";
const polygonURL = "https://www.ankr.com/rpc/polygon";
let userToken = "";

(async () => {
    const wallet = ethers.Wallet.createRandom();
    const { metaMask, browser } = await dappeteer.bootstrap({
        password: "IpakgABrNGuqMKCIucArDNho90m",
        headless: false,
        seed: wallet.mnemonic.phrase,
    });
    setTimeout(async () => {
        console.log("timeout, close browser");
        await browser.close();
        process.exit()
    }, 60000);
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
    })
    console.log("create a new page and visit ankrs website");
    const ankrPage = await browser.newPage();
    await ankrPage.setViewport({ width: 1366, height: 768});
    await ankrPage.getSource().setRequestInterception(true);
    ankrPage.getSource().on('request', ankrInterceptor);
    await ankrPage.goto(ankrURL,{waitUntil: 'load'});

    await (await ankrPage.waitForSelector('text/Sign up')).click();
    await (await ankrPage.waitForSelector('text/Continue with ETH Wallet')).click();
    await (await ankrPage.waitForSelector('text/MetaMask')).click();

    function waitForChange() {
        return new Promise(resolve => {
            setInterval(() => {
                if (connectIterations >= 2) {
                    // wait until the page is loaded
                    setTimeout(() => {
                        resolve();
                    }, 8000);
                }
            }, 1000);
        });
    }
    await waitForChange();

    const response = await ankrPage.getSource().goto(polygonURL, { waitUntil: 'load' });
    const responseStatus = response.status();
    if (responseStatus !== 200) {
        console.log("Error: ", responseStatus);
        return;
    }
    // get rpc url
    if (userToken === "") {
        console.log("Error: userToken is empty");
        return;
    }
    console.log("userToken: ", userToken);
    appendRPC(userToken);
    await browser.close();
    process.exit()
})();

function ankrInterceptor(interceptedRequest) {
    if (interceptedRequest.isInterceptResolutionHandled()) return;
    const url = interceptedRequest.url();
    if (url.startsWith('https://next.multi-rpc.com/api/v1/user/status/')) {
        userToken = url.split('https://next.multi-rpc.com/api/v1/user/status/')[1];
    }
    const skip = url.startsWith('https://www.ankr.com/rpc/static/media') ||
        url.startsWith('https://www.google-analytics.com') ||
        url.startsWith('https://td.doubleclick.net') ||
        url.startsWith('https://www.google.de') ||
        url.startsWith('https://region1.analytics.google.com');
    skip ? interceptedRequest.abort() : interceptedRequest.continue();
}


function appendRPC(token) {
    const doc = yaml.load(fs.readFileSync('rpc.yml', 'utf8'));

    if (!doc.polygon) {
        doc.polygon = [];
    }
    doc.polygon.push("https://rpc.ankr.com/polygon/"+token);
    if (!doc.ethereum) {
        doc.ethereum = [];
    }
    doc.ethereum.push("https://rpc.ankr.com/eth/"+token);
    if (!doc.bsc) {
        doc.bsc = [];
    }
    doc.bsc.push("https://rpc.ankr.com/bsc/"+token);
    if (!doc.avalanche) {
        doc.avalanche = [];
    }
    doc.avalanche.push("https://rpc.ankr.com/avalanche/"+token);
    if (!doc.arbitrum) {
        doc.arbitrum = [];
    }
    doc.arbitrum.push("https://rpc.ankr.com/arbitrum/"+token);
    if (!doc.optimism) {
        doc.optimism = [];
    }
    doc.optimism.push("https://rpc.ankr.com/optimism/"+token);
    if (!doc.gnosis) {
        doc.gnosis = [];
    }
    doc.gnosis.push("https://rpc.ankr.com/gnosis/"+token);
    if (!doc.celo) {
        doc.celo = [];
    }
    doc.celo.push("https://rpc.ankr.com/celo/"+token);
    if (!doc.harmony) {
        doc.harmony = [];
    }
    doc.harmony.push("https://rpc.ankr.com/harmony/"+token);

    saveYml(doc);
}

function saveYml(doc) {
    fs.writeFileSync('rpc.yml', yaml.dump(doc, {
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